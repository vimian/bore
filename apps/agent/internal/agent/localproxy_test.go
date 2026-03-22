package agent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

func TestBuildLocalProxyHeadersUsesOriginalHost(t *testing.T) {
	headers := buildLocalProxyHeaders(map[string][]string{
		"connection":           {"keep-alive"},
		"host":                 {"localhost:3000"},
		"x-bore-original-host": {"console.bo.bore.dk"},
		"x-forwarded-host":     {"console.bo.bore.dk"},
	})

	if headers.host != "console.bo.bore.dk" {
		t.Fatalf("expected rewritten host, got %q", headers.host)
	}
	if headers.headers.Get("host") != "" {
		t.Fatalf("expected host header to be stripped")
	}
	if headers.headers.Get("x-forwarded-host") != "console.bo.bore.dk" {
		t.Fatalf("expected x-forwarded-host to be preserved")
	}
}

func TestProxyLocalRequestPreservesOriginalHost(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != "console.bo.bore.dk" {
			t.Fatalf("expected host rewrite, got %q", r.Host)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	port := strings.Split(strings.TrimPrefix(server.URL, "http://"), ":")[1]
	message := proxyRequestMessage{
		Type:      "proxy_request",
		RequestID: "req-1",
		LocalPort: mustPort(t, port),
		Method:    http.MethodGet,
		Path:      "/health",
		Headers: map[string][]string{
			"x-bore-original-host": {"console.bo.bore.dk"},
		},
	}

	response, err := proxyLocalRequest(message)
	if err != nil {
		t.Fatalf("proxyLocalRequest returned error: %v", err)
	}
	if response.Status != http.StatusNoContent {
		t.Fatalf("expected 204 response, got %d", response.Status)
	}
}

func TestBuildLocalWebSocketHeadersStripsHandshakeHeaders(t *testing.T) {
	headers := buildLocalWebSocketHeaders(map[string][]string{
		"connection":               {"Upgrade"},
		"host":                     {"localhost:3000"},
		"origin":                   {"https://console.bo.bore.dk"},
		"sec-websocket-extensions": {"permessage-deflate"},
		"sec-websocket-key":        {"abc123"},
		"sec-websocket-protocol":   {"graphql-ws"},
		"sec-websocket-version":    {"13"},
		"upgrade":                  {"websocket"},
		"x-bore-original-host":     {"console.bo.bore.dk"},
	})

	if headers.host != "console.bo.bore.dk" {
		t.Fatalf("expected rewritten host, got %q", headers.host)
	}
	if headers.headers.Get("sec-websocket-key") != "" {
		t.Fatalf("expected websocket handshake headers to be stripped")
	}
	if headers.headers.Get("origin") != "https://console.bo.bore.dk" {
		t.Fatalf("expected origin header to be preserved")
	}
}

func TestConnectLocalWebSocketPreservesHostAndProtocol(t *testing.T) {
	upgrader := websocket.Upgrader{
		Subprotocols: []string{"next-dev"},
		CheckOrigin:  func(*http.Request) bool { return true },
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		if r.Host != "console.bo.bore.dk" {
			t.Fatalf("expected host rewrite, got %q", r.Host)
		}
		if conn.Subprotocol() != "next-dev" {
			t.Fatalf("expected subprotocol preservation, got %q", conn.Subprotocol())
		}
	}))
	defer server.Close()

	port := strings.Split(strings.TrimPrefix(server.URL, "http://"), ":")[1]
	socket, protocol, err := connectLocalWebSocket(context.Background(), websocketConnectMessage{
		Type:         "websocket_connect",
		ConnectionID: "ws-1",
		LocalPort:    mustPort(t, port),
		Path:         "/_next/webpack-hmr?page=/",
		Headers: map[string][]string{
			"origin":               {"https://console.bo.bore.dk"},
			"x-bore-original-host": {"console.bo.bore.dk"},
		},
		Protocols: []string{"next-dev"},
	})
	if err != nil {
		t.Fatalf("connectLocalWebSocket returned error: %v", err)
	}
	defer socket.conn.Close()

	if protocol != "next-dev" {
		t.Fatalf("expected next-dev protocol, got %q", protocol)
	}
}

func mustPort(t *testing.T, value string) int {
	t.Helper()

	port, err := strconv.Atoi(value)
	if err != nil {
		t.Fatalf("invalid port %q: %v", value, err)
	}
	return port
}
