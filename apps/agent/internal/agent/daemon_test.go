package agent

import (
	"context"
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
