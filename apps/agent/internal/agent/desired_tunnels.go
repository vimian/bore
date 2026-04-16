package agent

func upsertDesiredTunnelConfig(
	existing []DesiredTunnelConfig,
	next DesiredTunnelConfig,
) []DesiredTunnelConfig {
	updated := make([]DesiredTunnelConfig, 0, len(existing)+1)
	for _, tunnel := range existing {
		if tunnel.LocalPort != next.LocalPort {
			updated = append(updated, tunnel)
		}
	}

	return append(updated, next)
}

func removeDesiredTunnelConfig(existing []DesiredTunnelConfig, localPort int) []DesiredTunnelConfig {
	updated := make([]DesiredTunnelConfig, 0, len(existing))
	for _, tunnel := range existing {
		if tunnel.LocalPort != localPort {
			updated = append(updated, tunnel)
		}
	}

	return updated
}

func filterDeviceTunnels(tunnels []TunnelView, deviceID string) []TunnelView {
	filtered := make([]TunnelView, 0, len(tunnels))
	for _, tunnel := range tunnels {
		if tunnel.DeviceID == deviceID {
			filtered = append(filtered, tunnel)
		}
	}

	return filtered
}
