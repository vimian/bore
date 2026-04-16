package agent

import "testing"

func TestBuildGUIStateReturnsEmptySlicesWhenSignedOut(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	if err := saveConfig(AgentConfig{
		ServerOrigin:   hostedServerOrigin,
		DeviceID:       "device-1",
		DeviceName:     "test-device",
		DesiredTunnels: nil,
	}); err != nil {
		t.Fatalf("saveConfig returned error: %v", err)
	}

	if err := saveRuntime(RuntimeState{LastError: "daemon offline"}); err != nil {
		t.Fatalf("saveRuntime returned error: %v", err)
	}

	state, err := buildGUIState()
	if err != nil {
		t.Fatalf("buildGUIState returned error: %v", err)
	}

	if state.BrowserURL != "http://gui.bore.dk:53173" {
		t.Fatalf("expected browser URL %q, got %q", "http://gui.bore.dk:53173", state.BrowserURL)
	}
	if state.Port != 53173 {
		t.Fatalf("expected GUI port 53173, got %d", state.Port)
	}
	if state.SignedIn {
		t.Fatal("expected signed out state")
	}
	if state.DesiredTunnels == nil {
		t.Fatal("expected desired tunnels to be an empty slice")
	}
	if state.LocalTunnels == nil {
		t.Fatal("expected local tunnels to be an empty slice")
	}
	if state.Namespaces == nil {
		t.Fatal("expected namespaces to be an empty slice")
	}
	if len(state.DesiredTunnels) != 0 || len(state.LocalTunnels) != 0 || len(state.Namespaces) != 0 {
		t.Fatal("expected all GUI collections to be empty")
	}
	if state.LastError != "daemon offline" {
		t.Fatalf("expected last error to be preserved, got %q", state.LastError)
	}
}
