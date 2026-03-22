package agent

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"runtime"
)

func buildDeviceRegistration(config AgentConfig) DeviceRegistration {
	host, err := os.Hostname()
	if err != nil {
		host = "unknown-host"
	}

	sum := sha256.Sum256([]byte(config.DeviceID + ":" + host + ":" + runtime.GOOS))

	return DeviceRegistration{
		DeviceID:    config.DeviceID,
		Name:        config.DeviceName,
		Hostname:    host,
		Platform:    runtime.GOOS,
		Fingerprint: hex.EncodeToString(sum[:]),
	}
}
