package agent

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHandleUpRestoresConfigAfterNamespaceLimitReached(t *testing.T) {
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
					"namespaces":[]
				}`))
				return
			}

			w.WriteHeader(http.StatusConflict)
			_, _ = w.Write([]byte(`{
				"error":"You have reached your namespace limit of 1.",
				"code":"namespace_limit_reached",
				"details":{"limit":1,"currentCount":1}
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

	setTestStdin(t, "n\n")
	err := handleUp([]string{"3000"})
	if err == nil {
		t.Fatal("expected handleUp to fail")
	}
	if !strings.Contains(err.Error(), "Reuse one of your existing namespaces") {
		t.Fatalf("expected limit guidance, got %q", err.Error())
	}

	config, loadErr := loadConfig()
	if loadErr != nil {
		t.Fatalf("loadConfig returned error: %v", loadErr)
	}
	if len(config.DesiredTunnels) != 0 {
		t.Fatalf("expected config rollback, got %#v", config.DesiredTunnels)
	}
}

func TestHandleUpRepromptsForPendingGeneratedNamespace(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			w.WriteHeader(http.StatusOK)
		case "/api/v1/namespaces":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{
				"namespaces":[
					{
						"reservationId":"res-alpha",
						"subdomain":"alpha",
						"publicUrl":"https://alpha.bore.test",
						"lastUsedAt":"2026-04-07T00:00:00Z",
						"status":"available",
						"accessHosts":[],
						"claims":[]
					},
					{
						"reservationId":"res-beta",
						"subdomain":"beta",
						"publicUrl":"https://beta.bore.test",
						"lastUsedAt":"2026-04-07T00:00:00Z",
						"status":"active",
						"accessHosts":[],
						"claims":[
							{
								"tunnelId":"tunnel-beta",
								"deviceId":"device-2",
								"deviceName":"other-device",
								"hostname":"other-host",
								"platform":"linux",
								"localPort":4000,
								"status":"active",
								"claimedAt":"2026-04-07T00:00:00Z",
								"updatedAt":"2026-04-07T00:00:00Z",
								"lastSeenAt":"2026-04-07T00:00:00Z"
							}
						]
					}
				]
			}`))
		case "/sync":
			config, err := loadConfig()
			if err != nil {
				t.Fatalf("loadConfig returned error: %v", err)
			}

			w.Header().Set("Content-Type", "application/json")
			if len(config.DesiredTunnels) != 1 ||
				config.DesiredTunnels[0].PreferredSubdomain != "alpha" ||
				config.DesiredTunnels[0].AllocateNewSubdomain {
				w.WriteHeader(http.StatusConflict)
				_, _ = w.Write([]byte(`{
					"error":"You have reached your namespace limit of 1.",
					"code":"namespace_limit_reached",
					"details":{"limit":1,"currentCount":1}
				}`))
				return
			}

			_, _ = w.Write([]byte(`{
				"deviceId":"device-1",
				"tunnels":[
					{
						"deviceId":"device-1",
						"deviceName":"test-device",
						"hostname":"test-host",
						"platform":"linux",
						"localPort":3000,
						"subdomain":"alpha",
						"publicUrl":"https://alpha.bore.test",
						"status":"active",
						"claimedAt":"2026-04-07T00:00:00Z",
						"updatedAt":"2026-04-07T00:00:00Z",
						"lastSeenAt":"2026-04-07T00:00:00Z"
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
				LocalPort:            3000,
				AllocateNewSubdomain: true,
			},
		},
		AutostartInstalled: true,
	}); err != nil {
		t.Fatalf("saveConfig returned error: %v", err)
	}
	if err := saveRuntime(RuntimeState{ControlPort: controlPortForTest(t, server.URL)}); err != nil {
		t.Fatalf("saveRuntime returned error: %v", err)
	}

	setTestStdin(t, "\n")
	if err := handleUp([]string{"3000"}); err != nil {
		t.Fatalf("handleUp returned error: %v", err)
	}

	config, err := loadConfig()
	if err != nil {
		t.Fatalf("loadConfig returned error: %v", err)
	}
	if len(config.DesiredTunnels) != 1 {
		t.Fatalf("expected one desired tunnel, got %d", len(config.DesiredTunnels))
	}
	if config.DesiredTunnels[0].PreferredSubdomain != "alpha" {
		t.Fatalf("expected alpha preferred subdomain, got %q", config.DesiredTunnels[0].PreferredSubdomain)
	}
	if config.DesiredTunnels[0].AllocateNewSubdomain {
		t.Fatal("expected pending allocate-new flag to be cleared")
	}
}

func controlPortForTest(t *testing.T, rawURL string) int {
	t.Helper()

	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}

	var port int
	if _, err := fmt.Sscanf(parsed.Host, "127.0.0.1:%d", &port); err == nil {
		return port
	}
	if _, err := fmt.Sscanf(parsed.Host, "localhost:%d", &port); err == nil {
		return port
	}

	t.Fatalf("unable to parse port from %q", rawURL)
	return 0
}

func setTestStdin(t *testing.T, input string) {
	t.Helper()

	path := filepath.Join(t.TempDir(), "stdin.txt")
	if err := os.WriteFile(path, []byte(input), 0o600); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("Open returned error: %v", err)
	}

	original := os.Stdin
	os.Stdin = file
	t.Cleanup(func() {
		os.Stdin = original
		_ = file.Close()
	})
}
