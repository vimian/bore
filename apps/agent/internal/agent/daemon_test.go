package agent

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestDaemonSyncReturnsResultWhenRelayConnectionFails(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/devices/register":
			w.WriteHeader(http.StatusOK)
		case "/api/v1/tunnels/sync":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{
				"deviceId":"device-1",
				"tunnels":[
					{
						"deviceId":"device-1",
						"deviceName":"test-device",
						"hostname":"test-host",
						"platform":"windows",
						"localPort":4281,
						"subdomain":"ea",
						"publicUrl":"https://ea.bore.dk",
						"status":"offline"
					}
				],
				"reusableSubdomains":["bo"],
				"namespaces":[]
			}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	if err := saveConfig(AgentConfig{
		ServerOrigin: server.URL,
		Token:        "token",
		DeviceID:     "device-1",
		DeviceName:   "test-device",
		DesiredTunnels: []DesiredTunnelConfig{
			{
				LocalPort:          4281,
				PreferredSubdomain: "ea",
			},
		},
	}); err != nil {
		t.Fatalf("saveConfig returned error: %v", err)
	}

	instance := &daemon{
		ctx:          context.Background(),
		localSockets: map[string]*localWebSocket{},
	}

	result, err := instance.sync()
	if err != nil {
		t.Fatalf("sync returned error: %v", err)
	}
	if len(result.Tunnels) != 1 {
		t.Fatalf("expected 1 tunnel, got %d", len(result.Tunnels))
	}
	if result.Tunnels[0].Subdomain != "ea" {
		t.Fatalf("expected ea subdomain, got %q", result.Tunnels[0].Subdomain)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		runtimeState, err := loadRuntime()
		if err != nil {
			t.Fatalf("loadRuntime returned error: %v", err)
		}
		if runtimeState.LastError != "" {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}

	t.Fatal("expected relay error to be recorded asynchronously")
}

func TestDaemonSyncOnlyAdvertisesReachablePorts(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	reachableListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Listen returned error: %v", err)
	}
	defer reachableListener.Close()

	reachablePort := reachableListener.Addr().(*net.TCPAddr).Port

	unreachableListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Listen returned error: %v", err)
	}
	unreachablePort := unreachableListener.Addr().(*net.TCPAddr).Port
	_ = unreachableListener.Close()

	type syncRequest struct {
		DesiredTunnels []DesiredTunnelConfig `json:"desiredTunnels"`
	}

	requests := make(chan syncRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/devices/register":
			w.WriteHeader(http.StatusOK)
		case "/api/v1/tunnels/sync":
			body, readErr := io.ReadAll(r.Body)
			if readErr != nil {
				t.Fatalf("ReadAll returned error: %v", readErr)
			}

			var payload syncRequest
			if unmarshalErr := json.Unmarshal(body, &payload); unmarshalErr != nil {
				t.Fatalf("Unmarshal returned error: %v", unmarshalErr)
			}

			requests <- payload
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{
				"deviceId":"device-1",
				"tunnels":[
					{
						"deviceId":"device-1",
						"deviceName":"test-device",
						"hostname":"test-host",
						"platform":"windows",
						"localPort":4281,
						"subdomain":"ea",
						"publicUrl":"https://ea.bore.dk",
						"status":"active"
					}
				],
				"reusableSubdomains":[],
				"namespaces":[]
			}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	if err := saveConfig(AgentConfig{
		ServerOrigin: server.URL,
		Token:        "token",
		DeviceID:     "device-1",
		DeviceName:   "test-device",
		DesiredTunnels: []DesiredTunnelConfig{
			{
				LocalPort:          reachablePort,
				PreferredSubdomain: "ea",
			},
			{
				LocalPort:          unreachablePort,
				PreferredSubdomain: "bo",
			},
		},
	}); err != nil {
		t.Fatalf("saveConfig returned error: %v", err)
	}

	instance := &daemon{
		ctx:          context.Background(),
		localSockets: map[string]*localWebSocket{},
	}

	if _, err := instance.sync(); err != nil {
		t.Fatalf("sync returned error: %v", err)
	}

	select {
	case request := <-requests:
		if len(request.DesiredTunnels) != 1 {
			t.Fatalf("expected 1 advertised tunnel, got %d", len(request.DesiredTunnels))
		}
		if request.DesiredTunnels[0].LocalPort != reachablePort {
			t.Fatalf("expected reachable port %d, got %d", reachablePort, request.DesiredTunnels[0].LocalPort)
		}
		if request.DesiredTunnels[0].PreferredSubdomain != "ea" {
			t.Fatalf("expected reachable subdomain ea, got %q", request.DesiredTunnels[0].PreferredSubdomain)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for sync request")
	}
}
