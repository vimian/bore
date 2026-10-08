package agent

import "context"

func (d *daemon) startLocalWebSocket(socket *relaySocket, message websocketConnectMessage) {
	parent := socket.ctx
	if parent == nil {
		parent = d.ctx
	}
	ctx, cancel := context.WithCancel(parent)
	d.localSocketsMu.Lock()
	if len(d.pendingLocalSockets) >= 128 {
		d.localSocketsMu.Unlock()
		cancel()
		socket.sendJSON(websocketConnectErrorMessage{Type: "websocket_connect_error", ConnectionID: message.ConnectionID, Message: "Too many pending local WebSocket handshakes"})
		return
	}
	if d.pendingLocalSockets == nil {
		d.pendingLocalSockets = map[string]context.CancelFunc{}
	}
	d.pendingLocalSockets[message.ConnectionID] = cancel
	d.localSocketsMu.Unlock()
	// Local handshakes must not block HTTP dispatch or relay ping/pong handling.
	go d.connectLocalWebSocket(ctx, cancel, socket, message)
}

func (d *daemon) connectLocalWebSocket(ctx context.Context, cancel context.CancelFunc, socket *relaySocket, message websocketConnectMessage) {
	defer cancel()
	local, protocol, err := connectLocalWebSocket(ctx, message)
	d.relayMu.Lock()
	d.localSocketsMu.Lock()
	delete(d.pendingLocalSockets, message.ConnectionID)
	active := d.relay == socket && ctx.Err() == nil
	if err == nil && active {
		d.localSockets[message.ConnectionID] = local
	}
	d.localSocketsMu.Unlock()
	d.relayMu.Unlock()
	if !active {
		if local != nil {
			local.conn.Close()
		}
		return
	}
	if err != nil {
		socket.sendJSON(websocketConnectErrorMessage{Type: "websocket_connect_error", ConnectionID: message.ConnectionID, Message: err.Error()})
		return
	}
	if err := socket.sendJSON(websocketConnectedMessage{Type: "websocket_connected", ConnectionID: message.ConnectionID, Protocol: protocol}); err != nil {
		d.removeLocalSocket(message.ConnectionID)
		return
	}
	go d.readLocalWebSocket(socket, message.ConnectionID, local)
}

func (d *daemon) cancelLocalWebSocketConnect(id string) {
	d.localSocketsMu.Lock()
	if cancel := d.pendingLocalSockets[id]; cancel != nil {
		cancel()
		delete(d.pendingLocalSockets, id)
	}
	d.localSocketsMu.Unlock()
}
