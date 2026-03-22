package agent

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"runtime"
)

const hostedServerOrigin = "https://bore.dk"

func newUUID() string {
	var bytes [16]byte
	_, _ = rand.Read(bytes[:])
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80

	return hex.EncodeToString(bytes[0:4]) + "-" +
		hex.EncodeToString(bytes[4:6]) + "-" +
		hex.EncodeToString(bytes[6:8]) + "-" +
		hex.EncodeToString(bytes[8:10]) + "-" +
		hex.EncodeToString(bytes[10:16])
}

func defaultServerOrigin() string {
	if value := os.Getenv("BORE_SERVER_ORIGIN"); value != "" {
		return value
	}

	return hostedServerOrigin
}

func getDefaultDeviceName() string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return runtime.GOOS
	}

	return name
}

func ensureConfigDir() error {
	return os.MkdirAll(getConfigDir(), 0o755)
}

func loadConfigIfPresent() (*AgentConfig, error) {
	raw, err := os.ReadFile(getConfigPath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}

		return nil, err
	}

	var parsed AgentConfig
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}

	if parsed.ServerOrigin == "" || os.Getenv("BORE_SERVER_ORIGIN") != "" {
		parsed.ServerOrigin = defaultServerOrigin()
	}

	if parsed.DeviceID == "" {
		parsed.DeviceID = newUUID()
	}

	if parsed.DeviceName == "" {
		parsed.DeviceName = getDefaultDeviceName()
	}

	if parsed.DesiredTunnels == nil {
		parsed.DesiredTunnels = []DesiredTunnelConfig{}
	}

	return &parsed, nil
}

func loadConfig() (AgentConfig, error) {
	if err := ensureConfigDir(); err != nil {
		return AgentConfig{}, err
	}

	parsed, err := loadConfigIfPresent()
	if err != nil {
		return AgentConfig{}, err
	}

	if parsed == nil {
		config := AgentConfig{
			ServerOrigin:   defaultServerOrigin(),
			DeviceID:       newUUID(),
			DeviceName:     getDefaultDeviceName(),
			DesiredTunnels: []DesiredTunnelConfig{},
		}

		if err := saveConfig(config); err != nil {
			return AgentConfig{}, err
		}

		return config, nil
	}

	return *parsed, nil
}

func saveConfig(config AgentConfig) error {
	if err := ensureConfigDir(); err != nil {
		return err
	}

	raw, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(getConfigPath(), raw, 0o600)
}

func loadRuntime() (RuntimeState, error) {
	if err := ensureConfigDir(); err != nil {
		return RuntimeState{}, err
	}

	state, err := loadRuntimeIfPresent()
	if err != nil {
		return RuntimeState{}, err
	}

	if state == nil {
		return RuntimeState{}, nil
	}

	return *state, nil
}

func loadRuntimeIfPresent() (*RuntimeState, error) {
	raw, err := os.ReadFile(getRuntimePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}

		return nil, err
	}

	var state RuntimeState
	if err := json.Unmarshal(raw, &state); err != nil {
		return nil, err
	}

	return &state, nil
}

func saveRuntime(state RuntimeState) error {
	if err := ensureConfigDir(); err != nil {
		return err
	}

	raw, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(getRuntimePath(), raw, 0o600)
}
