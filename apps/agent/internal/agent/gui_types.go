package agent

type GUIState struct {
	BrowserURL     string                `json:"browserUrl"`
	Host           string                `json:"host"`
	Port           int                   `json:"port"`
	ServerOrigin   string                `json:"serverOrigin"`
	DeviceName     string                `json:"deviceName"`
	UserEmail      string                `json:"userEmail,omitempty"`
	SignedIn       bool                  `json:"signedIn"`
	DaemonRunning  bool                  `json:"daemonRunning"`
	AgentAutostart bool                  `json:"agentAutostart"`
	GUIAutostart   bool                  `json:"guiAutostart"`
	LastSyncAt     string                `json:"lastSyncAt,omitempty"`
	LastError      string                `json:"lastError,omitempty"`
	RemoteError    string                `json:"remoteError,omitempty"`
	DesiredTunnels []DesiredTunnelConfig `json:"desiredTunnels"`
	LocalTunnels   []TunnelView          `json:"localTunnels"`
	Namespaces     []NamespaceView       `json:"namespaces"`
}

type guiTunnelInput struct {
	LocalPort          int    `json:"localPort"`
	PreferredSubdomain string `json:"preferredSubdomain"`
}

type guiPortInput struct {
	LocalPort int `json:"localPort"`
}

type guiBooleanInput struct {
	Enabled bool `json:"enabled"`
}

type guiNamespaceInput struct {
	Subdomain string `json:"subdomain"`
}
