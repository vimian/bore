package agent

import (
	"fmt"
	"net"
	"testing"
)

func TestGUIListenersChoosesNextPortWhenPreferredPortIsTaken(t *testing.T) {
	blocked, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Listen returned error: %v", err)
	}
	defer blocked.Close()

	blockedPort := blocked.Addr().(*net.TCPAddr).Port
	fallbackPort := blockedPort + 1

	listeners, ok := guiListenersForPort(fallbackPort)
	if !ok {
		t.Fatalf("expected fallback port %d to be available", fallbackPort)
	}
	closeGUIListeners(listeners)

	port, listeners, err := guiListeners([]int{blockedPort, fallbackPort})
	if err != nil {
		t.Fatalf("guiListeners returned error: %v", err)
	}
	defer closeGUIListeners(listeners)

	if port != fallbackPort {
		t.Fatalf("expected fallback port %d, got %d", fallbackPort, port)
	}
}

func TestGUIListenersForPortRequiresIPv4Loopback(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Listen returned error: %v", err)
	}
	defer listener.Close()

	port := listener.Addr().(*net.TCPAddr).Port
	if listeners, ok := guiListenersForPort(port); ok {
		closeGUIListeners(listeners)
		t.Fatalf("expected port %d to be rejected when IPv4 loopback is already occupied", port)
	}
}

func TestGUIPortCandidatesStartAtFixedPort(t *testing.T) {
	ports := guiPortCandidates()
	if len(ports) != guiPortAttempts {
		t.Fatalf("expected %d candidate ports, got %d", guiPortAttempts, len(ports))
	}

	for index, port := range ports {
		expected := guiStartPort + index
		if port != expected {
			t.Fatalf("expected candidate %d to be %d, got %d", index, expected, port)
		}
	}

	if got := guiBrowserURL(guiStartPort); got != fmt.Sprintf("http://gui.bore.dk:%d", guiStartPort) {
		t.Fatalf("unexpected GUI browser URL %q", got)
	}
}
