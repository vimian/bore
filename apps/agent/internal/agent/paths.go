package agent

import (
	"os"
	"path/filepath"
)

func getConfigDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".bore"
	}

	return filepath.Join(home, ".bore")
}

func getConfigPath() string {
	return filepath.Join(getConfigDir(), "config.json")
}

func getRuntimePath() string {
	return filepath.Join(getConfigDir(), "runtime.json")
}
