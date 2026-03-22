package agent

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

var hopByHopHeaders = map[string]struct{}{
	"accept-encoding":   {},
	"connection":        {},
	"content-length":    {},
	"host":              {},
	"keep-alive":        {},
	"proxy-connection":  {},
	"te":                {},
	"trailer":           {},
	"transfer-encoding": {},
	"upgrade":           {},
}

var strippedWebSocketHeaders = map[string]struct{}{
	"sec-websocket-extensions": {},
	"sec-websocket-key":        {},
	"sec-websocket-protocol":   {},
	"sec-websocket-version":    {},
}

type proxyHeaders struct {
	headers http.Header
	host    string
}

type localWebSocket struct {
	conn      *websocket.Conn
	writeLock chan struct{}
}

func newLocalWebSocket(conn *websocket.Conn) *localWebSocket {
	lock := make(chan struct{}, 1)
	lock <- struct{}{}
	return &localWebSocket{conn: conn, writeLock: lock}
}

func (socket *localWebSocket) write(messageType int, payload []byte) error {
	<-socket.writeLock
	defer func() {
		socket.writeLock <- struct{}{}
	}()

	return socket.conn.WriteMessage(messageType, payload)
}

func (socket *localWebSocket) close(code int, reason string) error {
	<-socket.writeLock
	defer func() {
		socket.writeLock <- struct{}{}
	}()

	if code == 0 {
		return socket.conn.Close()
	}

	message := websocket.FormatCloseMessage(code, trimCloseReason(reason))
	return socket.conn.WriteControl(websocket.CloseMessage, message, time.Now().Add(time.Second))
}

func trimCloseReason(reason string) string {
	if len(reason) > 123 {
		return reason[:123]
	}
	return reason
}

func buildLocalProxyHeaders(headers map[string][]string) proxyHeaders {
	result := make(http.Header)
	var originalHost string

	for key, values := range headers {
		normalized := strings.ToLower(key)

		if normalized == "x-bore-original-host" {
			if len(values) > 0 {
				originalHost = strings.TrimSpace(values[0])
			}
			continue
		}

		if _, blocked := hopByHopHeaders[normalized]; blocked {
			continue
		}

		for _, value := range values {
			result.Add(key, value)
		}
	}

	return proxyHeaders{
		headers: result,
		host:    originalHost,
	}
}

func buildLocalWebSocketHeaders(headers map[string][]string) proxyHeaders {
	result := buildLocalProxyHeaders(headers)

	for key := range result.headers {
		if _, blocked := strippedWebSocketHeaders[strings.ToLower(key)]; blocked {
			result.headers.Del(key)
		}
	}

	return result
}

func proxyLocalRequest(message proxyRequestMessage) (proxyResponseMessage, error) {
	target := &url.URL{
		Scheme: "http",
		Host:   fmt.Sprintf("127.0.0.1:%d", message.LocalPort),
		Path:   "/",
	}

	parsedPath, err := url.Parse(message.Path)
	if err != nil {
		return proxyResponseMessage{}, err
	}

	target.Path = parsedPath.Path
	target.RawPath = parsedPath.RawPath
	target.RawQuery = parsedPath.RawQuery

	var body io.Reader
	if message.Method != http.MethodGet && message.Method != http.MethodHead && message.Body != "" {
		decoded, err := base64.StdEncoding.DecodeString(message.Body)
		if err != nil {
			return proxyResponseMessage{}, err
		}
		body = bytes.NewReader(decoded)
	}

	req, err := http.NewRequest(message.Method, target.String(), body)
	if err != nil {
		return proxyResponseMessage{}, err
	}

	headers := buildLocalProxyHeaders(message.Headers)
	req.Header = headers.headers
	if headers.host != "" {
		req.Host = headers.host
	}

	res, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return proxyResponseMessage{}, err
	}
	defer res.Body.Close()

	responseBody, err := io.ReadAll(res.Body)
	if err != nil {
		return proxyResponseMessage{}, err
	}

	responseHeaders := make(map[string][]string)
	for key, values := range res.Header {
		switch strings.ToLower(key) {
		case "content-encoding", "content-length":
			continue
		}

		responseHeaders[key] = append([]string(nil), values...)
	}

	return proxyResponseMessage{
		Type:      "proxy_response",
		RequestID: message.RequestID,
		Status:    res.StatusCode,
		Headers:   responseHeaders,
		Body:      base64.StdEncoding.EncodeToString(responseBody),
	}, nil
}

func connectLocalWebSocket(ctx context.Context, message websocketConnectMessage) (*localWebSocket, string, error) {
	target := &url.URL{
		Scheme: "ws",
		Host:   fmt.Sprintf("127.0.0.1:%d", message.LocalPort),
		Path:   "/",
	}

	parsedPath, err := url.Parse(message.Path)
	if err != nil {
		return nil, "", err
	}

	target.Path = parsedPath.Path
	target.RawPath = parsedPath.RawPath
	target.RawQuery = parsedPath.RawQuery

	headers := buildLocalWebSocketHeaders(message.Headers)
	if headers.host != "" {
		headers.headers.Set("Host", headers.host)
	}

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		Subprotocols:     message.Protocols,
	}

	conn, response, err := dialer.DialContext(ctx, target.String(), headers.headers)
	if err != nil {
		if response != nil && response.Body != nil {
			detail, _ := io.ReadAll(response.Body)
			_ = response.Body.Close()
			suffix := strings.TrimSpace(string(detail))
			if suffix != "" {
				return nil, "", fmt.Errorf("local websocket upgrade failed with status %d: %s", response.StatusCode, suffix)
			}
			return nil, "", fmt.Errorf("local websocket upgrade failed with status %d", response.StatusCode)
		}

		return nil, "", err
	}

	return newLocalWebSocket(conn), conn.Subprotocol(), nil
}
