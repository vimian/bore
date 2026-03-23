package agent

import (
	"encoding/json"
	"fmt"
)

type stringListMap map[string][]string

func (headers *stringListMap) UnmarshalJSON(data []byte) error {
	if len(data) == 0 || string(data) == "null" {
		*headers = nil
		return nil
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	result := make(map[string][]string, len(raw))
	for key, value := range raw {
		var list []string
		if err := json.Unmarshal(value, &list); err == nil {
			result[key] = append([]string(nil), list...)
			continue
		}

		var single string
		if err := json.Unmarshal(value, &single); err == nil {
			result[key] = []string{single}
			continue
		}

		return fmt.Errorf("unsupported header value for %s", key)
	}

	*headers = result
	return nil
}

type DesiredTunnelConfig struct {
	LocalPort            int    `json:"localPort"`
	PreferredSubdomain   string `json:"preferredSubdomain,omitempty"`
	AllocateNewSubdomain bool   `json:"allocateNewSubdomain,omitempty"`
}

type NamespaceAccessHostView struct {
	AccessHostID string `json:"accessHostId"`
	Label        string `json:"label"`
	Hostname     string `json:"hostname"`
	PublicURL    string `json:"publicUrl"`
	Kind         string `json:"kind"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
	LastSeenAt   string `json:"lastSeenAt"`
}

type NamespaceClaimView struct {
	TunnelID   string `json:"tunnelId"`
	DeviceID   string `json:"deviceId"`
	DeviceName string `json:"deviceName"`
	Hostname   string `json:"hostname"`
	Platform   string `json:"platform"`
	LocalPort  int    `json:"localPort"`
	Status     string `json:"status"`
	ClaimedAt  string `json:"claimedAt"`
	UpdatedAt  string `json:"updatedAt"`
	LastSeenAt string `json:"lastSeenAt"`
}

type NamespaceView struct {
	ReservationID string                    `json:"reservationId"`
	Subdomain     string                    `json:"subdomain"`
	PublicURL     string                    `json:"publicUrl"`
	LastUsedAt    string                    `json:"lastUsedAt"`
	Status        string                    `json:"status"`
	AccessHosts   []NamespaceAccessHostView `json:"accessHosts"`
	Claims        []NamespaceClaimView      `json:"claims"`
}

type NamespaceReleaseResponse struct {
	ReleasedSubdomain    string   `json:"releasedSubdomain"`
	RemovedAccessHostIDs []string `json:"removedAccessHostnames"`
}

type AgentConfig struct {
	ServerOrigin       string                `json:"serverOrigin"`
	Token              string                `json:"token,omitempty"`
	UserEmail          string                `json:"userEmail,omitempty"`
	DeviceID           string                `json:"deviceId"`
	DeviceName         string                `json:"deviceName"`
	DesiredTunnels     []DesiredTunnelConfig `json:"desiredTunnels"`
	AutostartInstalled bool                  `json:"autostartInstalled,omitempty"`
}

type RuntimeState struct {
	ControlPort int          `json:"controlPort,omitempty"`
	DaemonPID   int          `json:"daemonPid,omitempty"`
	LastSyncAt  string       `json:"lastSyncAt,omitempty"`
	LastError   string       `json:"lastError,omitempty"`
	Tunnels     []TunnelView `json:"tunnels,omitempty"`
}

type MeResponse struct {
	ID               string `json:"id"`
	Email            string `json:"email"`
	Name             string `json:"name"`
	ReservationLimit int    `json:"reservationLimit"`
	AccessHostLimit  int    `json:"accessHostLimit"`
}

type TunnelView struct {
	DeviceID   string `json:"deviceId"`
	DeviceName string `json:"deviceName"`
	Hostname   string `json:"hostname"`
	Platform   string `json:"platform"`
	LocalPort  int    `json:"localPort"`
	Subdomain  string `json:"subdomain"`
	PublicURL  string `json:"publicUrl"`
	Status     string `json:"status"`
	ClaimedAt  string `json:"claimedAt"`
	UpdatedAt  string `json:"updatedAt"`
	LastSeenAt string `json:"lastSeenAt"`
}

type SyncResponse struct {
	DeviceID           string          `json:"deviceId"`
	Tunnels            []TunnelView    `json:"tunnels"`
	ReusableSubdomains []string        `json:"reusableSubdomains"`
	Namespaces         []NamespaceView `json:"namespaces"`
}

type DeviceRegistration struct {
	DeviceID    string `json:"deviceId"`
	Name        string `json:"name"`
	Hostname    string `json:"hostname"`
	Platform    string `json:"platform"`
	Fingerprint string `json:"fingerprint"`
}

type proxyRequestMessage struct {
	Type      string        `json:"type"`
	RequestID string        `json:"requestId"`
	LocalPort int           `json:"localPort"`
	Method    string        `json:"method"`
	Path      string        `json:"path"`
	Headers   stringListMap `json:"headers"`
	Body      string        `json:"body"`
}

type proxyResponseMessage struct {
	Type      string              `json:"type"`
	RequestID string              `json:"requestId"`
	Status    int                 `json:"status"`
	Headers   map[string][]string `json:"headers"`
	Body      string              `json:"body"`
}

type websocketConnectMessage struct {
	Type         string        `json:"type"`
	ConnectionID string        `json:"connectionId"`
	LocalPort    int           `json:"localPort"`
	Path         string        `json:"path"`
	Headers      stringListMap `json:"headers"`
	Protocols    []string      `json:"protocols"`
}

type websocketConnectedMessage struct {
	Type         string `json:"type"`
	ConnectionID string `json:"connectionId"`
	Protocol     string `json:"protocol,omitempty"`
}

type websocketConnectErrorMessage struct {
	Type         string `json:"type"`
	ConnectionID string `json:"connectionId"`
	Message      string `json:"message"`
}

type websocketDataMessage struct {
	Type         string `json:"type"`
	ConnectionID string `json:"connectionId"`
	Data         string `json:"data"`
	IsBinary     bool   `json:"isBinary"`
}

type websocketCloseMessage struct {
	Type         string `json:"type"`
	ConnectionID string `json:"connectionId"`
	Code         int    `json:"code,omitempty"`
	Reason       string `json:"reason,omitempty"`
}

type clientHelloMessage struct {
	Type     string `json:"type"`
	DeviceID string `json:"deviceId"`
}
