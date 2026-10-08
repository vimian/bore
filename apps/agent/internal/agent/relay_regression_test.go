package agent

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func regressionDaemon(t *testing.T) *daemon {
	ctx, cancel := context.WithCancel(context.Background())
	d := &daemon{ctx: ctx, cancel: cancel, localSockets: map[string]*localWebSocket{}}
	t.Cleanup(func() {
		d.stoppingMu.Lock()
		d.stopping = true
		d.stoppingMu.Unlock()
		cancel()
		d.closeRelay()
		d.reconnectTimerMu.Lock()
		if d.reconnectTimer != nil {
			d.reconnectTimer.Stop()
		}
		d.reconnectTimerMu.Unlock()
	})
	return d
}

func TestSlowLocalWebSocketDoesNotBlockHTTPRelay(t *testing.T) {
	d := regressionDaemon(t)
	local := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/hung-websocket" {
			<-d.ctx.Done()
			return
		}
		fmt.Fprint(w, "ok")
	}))
	t.Cleanup(local.Close)
	port := local.Listener.Addr().(*net.TCPAddr).Port
	responses := make(chan proxyResponseMessage, 1)
	upgrader := websocket.Upgrader{}
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		var hello clientHelloMessage
		if conn.ReadJSON(&hello) != nil {
			return
		}
		conn.WriteJSON(websocketConnectMessage{Type: "websocket_connect", ConnectionID: "hung", LocalPort: port, Path: "/hung-websocket"})
		conn.WriteJSON(proxyRequestMessage{Type: "proxy_request", RequestID: "fast", LocalPort: port, Method: "GET", Path: "/"})
		var response proxyResponseMessage
		if conn.ReadJSON(&response) == nil {
			responses <- response
		}
	}))
	t.Cleanup(relay.Close)
	// Cancel before server cleanup, which waits for the intentionally hung handler.
	t.Cleanup(d.cancel)
	if err := d.ensureRelay(AgentConfig{ServerOrigin: relay.URL, Token: "token", DeviceID: "device", DesiredTunnels: []DesiredTunnelConfig{{LocalPort: port}}}); err != nil {
		t.Fatal(err)
	}
	select {
	case response := <-responses:
		if response.RequestID != "fast" || response.Status != 200 {
			t.Fatalf("unexpected response: %+v", response)
		}
	case <-time.After(time.Second):
		t.Fatal("a hung local WebSocket handshake blocked an unrelated HTTP request")
	}
}

func TestConcurrentEnsureRelayUsesOneConnection(t *testing.T) {
	d := regressionDaemon(t)
	var connections atomic.Int32
	upgrader := websocket.Upgrader{}
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		connections.Add(1)
		defer conn.Close()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}))
	t.Cleanup(relay.Close)
	config := AgentConfig{ServerOrigin: relay.URL, Token: "token", DeviceID: "device", DesiredTunnels: []DesiredTunnelConfig{{LocalPort: 3000}}}
	var calls sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 8; i++ {
		calls.Add(1)
		go func() {
			defer calls.Done()
			<-start
			if err := d.ensureRelay(config); err != nil {
				t.Error(err)
			}
		}()
	}
	close(start)
	calls.Wait()
	if connections.Load() != 1 {
		t.Fatalf("concurrent reconnects opened %d sockets; want one", connections.Load())
	}
}

func TestStaleRelayTeardownPreservesReplacementSockets(t *testing.T) {
	d := regressionDaemon(t)
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		<-d.ctx.Done()
	}))
	t.Cleanup(server.Close)
	t.Cleanup(d.cancel)
	url, err := relayURL(server.URL, "token", "device")
	if err != nil {
		t.Fatal(err)
	}
	old, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	current, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	d.relay = &relaySocket{conn: current}
	d.localSockets["current"] = newLocalWebSocket(current)
	old.Close()
	d.readRelayLoop(&relaySocket{conn: old})
	if len(d.localSockets) != 1 {
		t.Fatal("stale relay closed the replacement's local sockets")
	}
	if d.reconnectTimer != nil {
		t.Fatal("stale relay scheduled an unnecessary reconnect")
	}
}
