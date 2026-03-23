package agent

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type relaySocket struct {
	url  string
	conn *websocket.Conn
	mu   sync.Mutex
}

func (socket *relaySocket) sendJSON(value any) error {
	socket.mu.Lock()
	defer socket.mu.Unlock()
	return socket.conn.WriteJSON(value)
}

type daemon struct {
	ctx              context.Context
	cancel           context.CancelFunc
	controlServer    *http.Server
	controlPort      int
	stopping         bool
	stoppingMu       sync.Mutex
	relay            *relaySocket
	relayMu          sync.Mutex
	reconnectTimer   *time.Timer
	reconnectTimerMu sync.Mutex
	localSockets     map[string]*localWebSocket
	localSocketsMu   sync.RWMutex
}

func runDaemon() error {
	ctx, stop := signal.NotifyContext(context.Background(), daemonSignals()...)
	defer stop()

	daemonCtx, cancel := context.WithCancel(ctx)
	instance := &daemon{
		ctx:          daemonCtx,
		cancel:       cancel,
		localSockets: map[string]*localWebSocket{},
	}

	return instance.run()
}

func (d *daemon) run() error {
	controlListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}

	addr := controlListener.Addr().(*net.TCPAddr)
	d.controlPort = addr.Port

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		respondJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
	mux.HandleFunc("/sync", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}

		result, err := d.sync()
		if err != nil {
			d.updateRuntime(func(runtimeState *RuntimeState) {
				runtimeState.LastError = err.Error()
			})
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		respondJSON(w, http.StatusOK, result)
	})
	mux.HandleFunc("/stop", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}

		go func() {
			time.Sleep(50 * time.Millisecond)
			d.stop()
		}()
		respondJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	d.controlServer = &http.Server{Handler: mux}
	go func() {
		_ = d.controlServer.Serve(controlListener)
	}()

	d.updateRuntime(func(runtimeState *RuntimeState) {
		runtimeState.ControlPort = d.controlPort
		runtimeState.DaemonPID = os.Getpid()
	})

	if _, err := d.sync(); err != nil {
		d.updateRuntime(func(runtimeState *RuntimeState) {
			runtimeState.LastError = err.Error()
		})
	}

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-d.ctx.Done():
			d.stop()
			return nil
		case <-ticker.C:
			if _, err := d.sync(); err != nil {
				d.updateRuntime(func(runtimeState *RuntimeState) {
					runtimeState.LastError = err.Error()
				})
			}
		}
	}
}

func (d *daemon) sync() (SyncResponse, error) {
	config, err := loadConfig()
	if err != nil {
		return SyncResponse{}, err
	}

	if config.Token == "" {
		return SyncResponse{}, fmt.Errorf("run `bore login` first")
	}

	client := newAPIClient(config)
	if err := client.registerDevice(); err != nil {
		return SyncResponse{}, err
	}

	result, err := client.syncTunnels()
	if err != nil {
		return SyncResponse{}, err
	}

	d.updateRuntime(func(runtimeState *RuntimeState) {
		runtimeState.LastSyncAt = time.Now().UTC().Format(time.RFC3339)
		runtimeState.LastError = ""
		runtimeState.Tunnels = result.Tunnels
	})

	d.ensureRelayAsync(config)

	return result, nil
}

func (d *daemon) ensureRelayAsync(config AgentConfig) {
	go func() {
		if err := d.ensureRelay(config); err != nil {
			d.updateRuntime(func(runtimeState *RuntimeState) {
				runtimeState.LastError = err.Error()
			})
		}
	}()
}

func (d *daemon) ensureRelay(config AgentConfig) error {
	if config.Token == "" || len(config.DesiredTunnels) == 0 {
		d.closeRelay()
		return nil
	}

	wsURL, err := relayURL(config.ServerOrigin, config.Token, config.DeviceID)
	if err != nil {
		return err
	}

	d.relayMu.Lock()
	if d.relay != nil && d.relay.url == wsURL {
		d.relayMu.Unlock()
		return nil
	}
	d.relayMu.Unlock()

	d.closeRelay()

	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
	}

	conn, _, err := dialer.DialContext(d.ctx, wsURL, nil)
	if err != nil {
		d.scheduleReconnect()
		return err
	}

	socket := &relaySocket{url: wsURL, conn: conn}
	d.relayMu.Lock()
	d.relay = socket
	d.relayMu.Unlock()

	if err := socket.sendJSON(clientHelloMessage{
		Type:     "hello",
		DeviceID: config.DeviceID,
	}); err != nil {
		conn.Close()
		d.relayMu.Lock()
		if d.relay == socket {
			d.relay = nil
		}
		d.relayMu.Unlock()
		d.scheduleReconnect()
		return err
	}

	go d.readRelayLoop(socket)
	return nil
}

func relayURL(serverOrigin, token, deviceID string) (string, error) {
	parsed, err := url.Parse(serverOrigin)
	if err != nil {
		return "", err
	}

	switch parsed.Scheme {
	case "https":
		parsed.Scheme = "wss"
	case "http":
		parsed.Scheme = "ws"
	default:
		return "", fmt.Errorf("unsupported server origin %q", serverOrigin)
	}

	parsed.Path = "/ws"
	query := parsed.Query()
	query.Set("token", token)
	query.Set("deviceId", deviceID)
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func (d *daemon) readRelayLoop(socket *relaySocket) {
	defer func() {
		socket.conn.Close()
		d.relayMu.Lock()
		if d.relay == socket {
			d.relay = nil
		}
		d.relayMu.Unlock()
		d.closeLocalSockets()
		if !d.isStopping() {
			d.scheduleReconnect()
		}
	}()

	for {
		select {
		case <-d.ctx.Done():
			return
		default:
		}

		_, raw, err := socket.conn.ReadMessage()
		if err != nil {
			return
		}

		var envelope struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(raw, &envelope); err != nil {
			continue
		}

		switch envelope.Type {
		case "proxy_request":
			var message proxyRequestMessage
			if err := json.Unmarshal(raw, &message); err != nil {
				continue
			}

			response, err := proxyLocalRequest(message)
			if err != nil {
				errorBody, _ := json.Marshal(map[string]string{
					"error": err.Error(),
				})
				_ = socket.sendJSON(proxyResponseMessage{
					Type:      "proxy_response",
					RequestID: message.RequestID,
					Status:    http.StatusBadGateway,
					Headers: map[string][]string{
						"Content-Type": {"application/json; charset=utf-8"},
					},
					Body: base64.StdEncoding.EncodeToString(errorBody),
				})
				continue
			}

			_ = socket.sendJSON(response)
		case "websocket_connect":
			var message websocketConnectMessage
			if err := json.Unmarshal(raw, &message); err != nil {
				continue
			}

			localSocket, protocol, err := connectLocalWebSocket(d.ctx, message)
			if err != nil {
				_ = socket.sendJSON(websocketConnectErrorMessage{
					Type:         "websocket_connect_error",
					ConnectionID: message.ConnectionID,
					Message:      err.Error(),
				})
				continue
			}

			d.localSocketsMu.Lock()
			d.localSockets[message.ConnectionID] = localSocket
			d.localSocketsMu.Unlock()

			_ = socket.sendJSON(websocketConnectedMessage{
				Type:         "websocket_connected",
				ConnectionID: message.ConnectionID,
				Protocol:     protocol,
			})

			go d.readLocalWebSocket(socket, message.ConnectionID, localSocket)
		case "websocket_data":
			var message websocketDataMessage
			if err := json.Unmarshal(raw, &message); err != nil {
				continue
			}

			d.localSocketsMu.RLock()
			localSocket := d.localSockets[message.ConnectionID]
			d.localSocketsMu.RUnlock()
			if localSocket == nil {
				continue
			}

			payload, err := base64.StdEncoding.DecodeString(message.Data)
			if err != nil {
				continue
			}

			messageType := websocket.TextMessage
			if message.IsBinary {
				messageType = websocket.BinaryMessage
			}
			if err := localSocket.write(messageType, payload); err != nil {
				d.removeLocalSocket(message.ConnectionID)
			}
		case "websocket_close":
			var message websocketCloseMessage
			if err := json.Unmarshal(raw, &message); err != nil {
				continue
			}

			d.localSocketsMu.RLock()
			localSocket := d.localSockets[message.ConnectionID]
			d.localSocketsMu.RUnlock()
			if localSocket == nil {
				continue
			}

			_ = localSocket.close(message.Code, message.Reason)
			d.removeLocalSocket(message.ConnectionID)
		}
	}
}

func (d *daemon) readLocalWebSocket(socket *relaySocket, connectionID string, localSocket *localWebSocket) {
	defer func() {
		d.removeLocalSocket(connectionID)
	}()

	for {
		messageType, payload, err := localSocket.conn.ReadMessage()
		if err != nil {
			closeCode := 0
			closeReason := ""
			if closeErr, ok := err.(*websocket.CloseError); ok {
				closeCode = closeErr.Code
				closeReason = closeErr.Text
			}

			_ = socket.sendJSON(websocketCloseMessage{
				Type:         "websocket_close",
				ConnectionID: connectionID,
				Code:         closeCode,
				Reason:       trimCloseReason(closeReason),
			})
			return
		}

		switch messageType {
		case websocket.TextMessage, websocket.BinaryMessage:
			_ = socket.sendJSON(websocketDataMessage{
				Type:         "websocket_data",
				ConnectionID: connectionID,
				Data:         base64.StdEncoding.EncodeToString(payload),
				IsBinary:     messageType == websocket.BinaryMessage,
			})
		}
	}
}

func (d *daemon) removeLocalSocket(connectionID string) {
	d.localSocketsMu.Lock()
	socket := d.localSockets[connectionID]
	delete(d.localSockets, connectionID)
	d.localSocketsMu.Unlock()
	if socket != nil {
		socket.conn.Close()
	}
}

func (d *daemon) closeLocalSockets() {
	d.localSocketsMu.Lock()
	sockets := d.localSockets
	d.localSockets = map[string]*localWebSocket{}
	d.localSocketsMu.Unlock()

	for _, socket := range sockets {
		_ = socket.close(1012, "Tunnel relay disconnected")
		socket.conn.Close()
	}
}

func (d *daemon) closeRelay() {
	d.relayMu.Lock()
	socket := d.relay
	d.relay = nil
	d.relayMu.Unlock()
	if socket != nil {
		socket.conn.Close()
	}
	d.closeLocalSockets()
}

func (d *daemon) scheduleReconnect() {
	d.reconnectTimerMu.Lock()
	defer d.reconnectTimerMu.Unlock()

	if d.reconnectTimer != nil {
		d.reconnectTimer.Stop()
	}

	d.reconnectTimer = time.AfterFunc(2*time.Second, func() {
		if d.isStopping() {
			return
		}

		config, err := loadConfig()
		if err != nil {
			return
		}
		_ = d.ensureRelay(config)
	})
}

func (d *daemon) stop() {
	d.stoppingMu.Lock()
	if d.stopping {
		d.stoppingMu.Unlock()
		return
	}
	d.stopping = true
	d.stoppingMu.Unlock()

	d.cancel()

	d.reconnectTimerMu.Lock()
	if d.reconnectTimer != nil {
		d.reconnectTimer.Stop()
	}
	d.reconnectTimerMu.Unlock()

	d.closeRelay()

	d.updateRuntime(func(runtimeState *RuntimeState) {
		runtimeState.ControlPort = 0
		runtimeState.DaemonPID = 0
	})

	if d.controlServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = d.controlServer.Shutdown(ctx)
	}
}

func (d *daemon) updateRuntime(update func(*RuntimeState)) {
	runtimeState, err := loadRuntime()
	if err != nil {
		return
	}

	update(&runtimeState)
	_ = saveRuntime(runtimeState)
}

func (d *daemon) isStopping() bool {
	d.stoppingMu.Lock()
	defer d.stoppingMu.Unlock()
	return d.stopping
}

func respondJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
