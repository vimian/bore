package agent

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"time"
)

type guiServer struct {
	csrfToken string
	port      int
	server    *http.Server
}

func runGUIServer(openOnStart bool) error {
	port, listeners, err := guiListeners(guiPortCandidates())
	if err != nil {
		return err
	}
	defer closeGUIListeners(listeners)

	server := &guiServer{csrfToken: randomGUISecret(), port: port}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", server.handleHealth)
	mux.HandleFunc("/stop", server.handleStop)
	mux.HandleFunc("/", server.handleRoot)
	mux.HandleFunc("/api/state", server.handleState)
	mux.HandleFunc("/api/login", server.handleLogin)
	mux.HandleFunc("/api/sign-out", server.handleSignOut)
	mux.HandleFunc("/api/sync", server.handleSync)
	mux.HandleFunc("/api/tunnels", server.handleTunnels)
	mux.HandleFunc("/api/tunnels/down", server.handleTunnelDown)
	mux.HandleFunc("/api/namespaces/release", server.handleNamespaceRelease)
	mux.HandleFunc("/api/autostart/agent", server.handleAgentAutostart)
	mux.HandleFunc("/api/autostart/gui", server.handleGUIAutostart)
	mux.HandleFunc("/api/close", server.handleClose)
	server.server = &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}

	updateRuntimeForGUI(server.port, true)
	defer updateRuntimeForGUI(0, false)

	if openOnStart {
		go func() {
			time.Sleep(100 * time.Millisecond)
			_ = openBrowser(guiBrowserURL(server.port))
		}()
	}

	errCh := make(chan error, len(listeners))
	doneCh := make(chan struct{}, len(listeners))
	for _, listener := range listeners {
		go func(listener net.Listener) {
			if serveErr := server.server.Serve(listener); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
				errCh <- serveErr
			}
			doneCh <- struct{}{}
		}(listener)
	}

	for range listeners {
		select {
		case err := <-errCh:
			return err
		case <-doneCh:
		}
	}

	return nil
}

func guiListeners(ports []int) (int, []net.Listener, error) {
	for _, port := range ports {
		listeners, ok := guiListenersForPort(port)
		if ok {
			return port, listeners, nil
		}
	}

	return 0, nil, fmt.Errorf("unable to bind the Bore GUI to localhost on ports %d-%d", guiStartPort, guiStartPort+guiPortAttempts-1)
}

func guiListenersForPort(port int) ([]net.Listener, bool) {
	ipv4, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return nil, false
	}

	listeners := []net.Listener{ipv4}
	if ipv6, err := net.Listen("tcp", fmt.Sprintf("[::1]:%d", port)); err == nil {
		listeners = append(listeners, ipv6)
	}

	return listeners, true
}

func closeGUIListeners(listeners []net.Listener) {
	for _, listener := range listeners {
		_ = listener.Close()
	}
}

func updateRuntimeForGUI(port int, running bool) {
	runtimeState, err := loadRuntime()
	if err != nil {
		return
	}

	if running {
		runtimeState.GUIPort = port
		runtimeState.GUIPID = os.Getpid()
	} else {
		runtimeState.GUIPort = 0
		runtimeState.GUIPID = 0
	}

	_ = saveRuntime(runtimeState)
}

func randomGUISecret() string {
	var raw [16]byte
	_, _ = rand.Read(raw[:])
	return hex.EncodeToString(raw[:])
}

func (server *guiServer) shutdownSoon() {
	go func() {
		time.Sleep(50 * time.Millisecond)
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = server.server.Shutdown(ctx)
	}()
}

func decodeGUIBody(request *http.Request, target any) error {
	defer request.Body.Close()
	return json.NewDecoder(request.Body).Decode(target)
}

func requireGUIPost(w http.ResponseWriter, r *http.Request, csrf string) bool {
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return false
	}
	if r.Header.Get("X-Bore-GUI-Token") != csrf {
		respondJSON(w, http.StatusForbidden, map[string]any{"error": "Invalid Bore GUI request"})
		return false
	}
	return true
}

func respondGUIResult(w http.ResponseWriter, state GUIState, err error) {
	if err == nil {
		respondJSON(w, http.StatusOK, state)
		return
	}
	if responseErr, ok := err.(*ResponseError); ok {
		respondJSON(w, responseErr.StatusCode, map[string]any{"error": formatCLIError(responseErr)})
		return
	}
	respondJSON(w, http.StatusBadRequest, map[string]any{"error": formatCLIError(err)})
}
