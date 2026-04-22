package agent

import (
	"fmt"
	"strings"
)

func buildGUIState() (GUIState, error) {
	config, err := loadConfig()
	if err != nil {
		return GUIState{}, err
	}

	runtimeState, err := loadRuntime()
	if err != nil {
		return GUIState{}, err
	}
	port := guiPreferredPort(runtimeState)

	state := GUIState{
		BrowserURL:     guiBrowserURL(port),
		Host:           guiHost,
		Port:           port,
		ServerOrigin:   config.ServerOrigin,
		DeviceID:       config.DeviceID,
		DeviceName:     config.DeviceName,
		UserEmail:      config.UserEmail,
		SignedIn:       config.Token != "",
		DaemonRunning:  isDaemonHealthy(),
		AgentAutostart: config.AutostartInstalled,
		GUIAutostart:   config.GUIAutostartInstalled,
		LastSyncAt:     runtimeState.LastSyncAt,
		LastError:      runtimeState.LastError,
		DesiredTunnels: append([]DesiredTunnelConfig{}, config.DesiredTunnels...),
		LocalTunnels:   []TunnelView{},
		Namespaces:     []NamespaceView{},
	}

	if !state.SignedIn {
		return state, nil
	}

	client := newAPIClient(config)
	me, meErr := client.getMe()
	if meErr == nil {
		state.ReservationLimit = me.ReservationLimit
	} else {
		state.RemoteError = meErr.Error()
	}

	tunnels, tunnelErr := client.listTunnels()
	if tunnelErr == nil {
		state.LocalTunnels = filterDeviceTunnels(tunnels, config.DeviceID)
	} else if state.RemoteError == "" {
		state.RemoteError = tunnelErr.Error()
	}

	namespaces, namespaceErr := client.listNamespaces()
	if namespaceErr == nil {
		state.Namespaces = namespaces
		if meErr == nil {
			state.RemainingNamespaceSlots = max(me.ReservationLimit-len(namespaces), 0)
		}
	} else if state.RemoteError == "" {
		state.RemoteError = namespaceErr.Error()
	}

	return state, nil
}

func guiLogin() (GUIState, error) {
	config, err := loadConfig()
	if err != nil {
		return GUIState{}, err
	}

	if _, err := login(config); err != nil {
		return GUIState{}, err
	}

	return buildGUIState()
}

func guiSignOut() (GUIState, error) {
	config, err := loadConfig()
	if err != nil {
		return GUIState{}, err
	}

	config.Token = ""
	config.UserEmail = ""
	if err := saveConfig(config); err != nil {
		return GUIState{}, err
	}
	if err := stopDaemonIfRunning(); err != nil {
		return GUIState{}, err
	}

	return buildGUIState()
}

func guiSync() (GUIState, error) {
	config, err := loadConfig()
	if err != nil {
		return GUIState{}, err
	}
	config, err = ensureLoggedIn(config)
	if err != nil {
		return GUIState{}, err
	}
	if err := ensureDaemonRunning(); err != nil {
		return GUIState{}, err
	}

	result, err := syncDaemon()
	if err != nil {
		return GUIState{}, err
	}

	config = mergeAssignedNamespaces(config, result.Tunnels, config.DeviceID)
	if err := saveConfig(config); err != nil {
		return GUIState{}, err
	}

	return buildGUIState()
}

func guiSetTunnel(input guiTunnelInput) (GUIState, error) {
	localPort := input.LocalPort
	if localPort < 1 || localPort > 65535 {
		return GUIState{}, fmt.Errorf("port must be an integer between 1 and 65535")
	}

	config, err := loadConfig()
	if err != nil {
		return GUIState{}, err
	}
	config, err = ensureLoggedIn(config)
	if err != nil {
		return GUIState{}, err
	}

	previous := append([]DesiredTunnelConfig(nil), config.DesiredTunnels...)
	config.DesiredTunnels = upsertDesiredTunnelConfig(config.DesiredTunnels, DesiredTunnelConfig{
		LocalPort:            localPort,
		PreferredSubdomain:   strings.TrimSpace(input.PreferredSubdomain),
		AllocateNewSubdomain: strings.TrimSpace(input.PreferredSubdomain) == "",
	})
	if err := saveConfig(config); err != nil {
		return GUIState{}, err
	}

	if installed, err := ensureAutostart(config); err == nil && installed {
		config.AutostartInstalled = true
		_ = saveConfig(config)
	}
	if err := ensureDaemonRunning(); err != nil {
		return GUIState{}, err
	}

	result, err := syncDaemon()
	if err != nil {
		config.DesiredTunnels = previous
		_ = saveConfig(config)
		return GUIState{}, err
	}
	if failure := findSyncTunnelFailure(result, localPort); failure != nil {
		config.DesiredTunnels = previous
		_ = saveConfig(config)
		return GUIState{}, fmt.Errorf("%s", failure.Message)
	}

	config = mergeAssignedNamespaces(config, result.Tunnels, config.DeviceID)
	if err := saveConfig(config); err != nil {
		return GUIState{}, err
	}

	return buildGUIState()
}

func guiDownTunnel(localPort int) (GUIState, error) {
	config, err := loadConfig()
	if err != nil {
		return GUIState{}, err
	}

	config.DesiredTunnels = removeDesiredTunnelConfig(config.DesiredTunnels, localPort)
	if err := saveConfig(config); err != nil {
		return GUIState{}, err
	}
	if config.Token == "" {
		return buildGUIState()
	}
	if err := ensureDaemonRunning(); err != nil {
		return GUIState{}, err
	}
	if _, err := syncDaemon(); err != nil {
		return GUIState{}, err
	}

	return buildGUIState()
}

func guiReleaseNamespace(subdomain string) (GUIState, error) {
	config, err := loadConfig()
	if err != nil {
		return GUIState{}, err
	}
	config, err = ensureLoggedIn(config)
	if err != nil {
		return GUIState{}, err
	}

	if _, err := newAPIClient(config).releaseNamespace(strings.TrimSpace(subdomain)); err != nil {
		return GUIState{}, err
	}

	return buildGUIState()
}

func guiSetAgentAutostart(enabled bool) (GUIState, error) {
	config, err := loadConfig()
	if err != nil {
		return GUIState{}, err
	}

	if enabled {
		if _, err := ensureAutostart(config); err != nil {
			return GUIState{}, err
		}
		config.AutostartInstalled = true
	} else {
		if err := uninstallAutostart(); err != nil {
			return GUIState{}, err
		}
		config.AutostartInstalled = false
	}

	if err := saveConfig(config); err != nil {
		return GUIState{}, err
	}

	return buildGUIState()
}

func guiSetGUIAutostart(enabled bool) (GUIState, error) {
	config, err := loadConfig()
	if err != nil {
		return GUIState{}, err
	}

	if enabled {
		if _, err := ensureGUIAutostart(config); err != nil {
			return GUIState{}, err
		}
		config.GUIAutostartInstalled = true
	} else {
		if err := uninstallGUIAutostart(); err != nil {
			return GUIState{}, err
		}
		config.GUIAutostartInstalled = false
	}

	if err := saveConfig(config); err != nil {
		return GUIState{}, err
	}

	return buildGUIState()
}
