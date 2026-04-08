package agent

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleUpRestoresConfigAfterSyncTunnelFailure(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	syncCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			w.WriteHeader(http.StatusOK)
		case "/sync":
			syncCalls++
			w.Header().Set("Content-Type", "application/json")
			if syncCalls == 1 {
				_, _ = w.Write([]byte(`{
					"deviceId":"device-1",
					"tunnels":[],
					"reusableSubdomains":["alpha"],
					"failedTunnels":[],
					"namespaces":[]
				}`))
				return
			}

			_, _ = w.Write([]byte(`{
				"deviceId":"device-1",
				"tunnels":[],
				"reusableSubdomains":[],
				"failedTunnels":[
					{
						"localPort":3000,
						"subdomain":"alpha",
						"code":"namespace_active_elsewhere",
						"message":"Namespace alpha is already active on macbook. Stop it there with bore down <port> before using it here."
					}
				],
				"namespaces":[]
			}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	if err := saveConfig(AgentConfig{
		ServerOrigin:       server.URL,
		Token:              "token",
		DeviceID:           "device-1",
		DeviceName:         "test-device",
		DesiredTunnels:     []DesiredTunnelConfig{},
		AutostartInstalled: true,
	}); err != nil {
		t.Fatalf("saveConfig returned error: %v", err)
	}
	if err := saveRuntime(RuntimeState{ControlPort: controlPortForTest(t, server.URL)}); err != nil {
		t.Fatalf("saveRuntime returned error: %v", err)
	}

	setTestStdin(t, "\n")
	err := handleUp([]string{"3000"})
	if err == nil {
		t.Fatal("expected handleUp to fail")
	}
	if !strings.Contains(err.Error(), "already active on macbook") {
		t.Fatalf("expected active-elsewhere guidance, got %q", err.Error())
	}

	config, loadErr := loadConfig()
	if loadErr != nil {
		t.Fatalf("loadConfig returned error: %v", loadErr)
	}
	if len(config.DesiredTunnels) != 0 {
		t.Fatalf("expected config rollback, got %#v", config.DesiredTunnels)
	}
}
