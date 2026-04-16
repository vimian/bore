package agent

import "net/http"

func (server *guiServer) handleHealth(w http.ResponseWriter, _ *http.Request) {
	respondJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (server *guiServer) handleStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}

	server.shutdownSoon()
	respondJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (server *guiServer) handleRoot(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderGUIPage(server.csrfToken)))
}

func (server *guiServer) handleState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.NotFound(w, r)
		return
	}

	state, err := buildGUIState()
	respondGUIResult(w, state, err)
}

func (server *guiServer) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !requireGUIPost(w, r, server.csrfToken) {
		return
	}
	state, err := guiLogin()
	respondGUIResult(w, state, err)
}

func (server *guiServer) handleSignOut(w http.ResponseWriter, r *http.Request) {
	if !requireGUIPost(w, r, server.csrfToken) {
		return
	}
	state, err := guiSignOut()
	respondGUIResult(w, state, err)
}

func (server *guiServer) handleSync(w http.ResponseWriter, r *http.Request) {
	if !requireGUIPost(w, r, server.csrfToken) {
		return
	}
	state, err := guiSync()
	respondGUIResult(w, state, err)
}

func (server *guiServer) handleTunnels(w http.ResponseWriter, r *http.Request) {
	if !requireGUIPost(w, r, server.csrfToken) {
		return
	}
	var input guiTunnelInput
	if err := decodeGUIBody(r, &input); err != nil {
		respondGUIResult(w, GUIState{}, err)
		return
	}
	state, err := guiSetTunnel(input)
	respondGUIResult(w, state, err)
}

func (server *guiServer) handleTunnelDown(w http.ResponseWriter, r *http.Request) {
	if !requireGUIPost(w, r, server.csrfToken) {
		return
	}
	var input guiPortInput
	if err := decodeGUIBody(r, &input); err != nil {
		respondGUIResult(w, GUIState{}, err)
		return
	}
	state, err := guiDownTunnel(input.LocalPort)
	respondGUIResult(w, state, err)
}

func (server *guiServer) handleNamespaceRelease(w http.ResponseWriter, r *http.Request) {
	if !requireGUIPost(w, r, server.csrfToken) {
		return
	}
	var input guiNamespaceInput
	if err := decodeGUIBody(r, &input); err != nil {
		respondGUIResult(w, GUIState{}, err)
		return
	}
	state, err := guiReleaseNamespace(input.Subdomain)
	respondGUIResult(w, state, err)
}

func (server *guiServer) handleAgentAutostart(w http.ResponseWriter, r *http.Request) {
	if !requireGUIPost(w, r, server.csrfToken) {
		return
	}
	var input guiBooleanInput
	if err := decodeGUIBody(r, &input); err != nil {
		respondGUIResult(w, GUIState{}, err)
		return
	}
	state, err := guiSetAgentAutostart(input.Enabled)
	respondGUIResult(w, state, err)
}

func (server *guiServer) handleGUIAutostart(w http.ResponseWriter, r *http.Request) {
	if !requireGUIPost(w, r, server.csrfToken) {
		return
	}
	var input guiBooleanInput
	if err := decodeGUIBody(r, &input); err != nil {
		respondGUIResult(w, GUIState{}, err)
		return
	}
	state, err := guiSetGUIAutostart(input.Enabled)
	respondGUIResult(w, state, err)
}

func (server *guiServer) handleClose(w http.ResponseWriter, r *http.Request) {
	if !requireGUIPost(w, r, server.csrfToken) {
		return
	}
	server.shutdownSoon()
	respondJSON(w, http.StatusOK, map[string]any{"ok": true})
}
