package agent

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func clearRemoteDeviceClaims(config AgentConfig) error {
	if config.Token == "" {
		return nil
	}

	client := newAPIClient(AgentConfig{
		ServerOrigin:   config.ServerOrigin,
		Token:          config.Token,
		UserEmail:      config.UserEmail,
		DeviceID:       config.DeviceID,
		DeviceName:     config.DeviceName,
		DesiredTunnels: []DesiredTunnelConfig{},
	})
	_, err := client.syncTunnels()
	return err
}

func removeConfigDir() error {
	if err := os.RemoveAll(getConfigDir()); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}

	return nil
}

func removeExecutable() (bool, error) {
	executable, err := os.Executable()
	if err != nil {
		return false, err
	}

	if executable == "" || isTemporaryExecutable(executable) {
		return false, nil
	}

	switch runtime.GOOS {
	case "windows":
		return true, scheduleWindowsSelfDelete(executable)
	default:
		if err := os.Remove(executable); err != nil && !errors.Is(err, os.ErrNotExist) {
			return false, err
		}
		return true, nil
	}
}

func scheduleWindowsSelfDelete(executable string) error {
	scriptPath := filepath.Join(os.TempDir(), "bore-uninstall.cmd")
	script := strings.Join([]string{
		"@echo off",
		"ping 127.0.0.1 -n 3 >nul",
		fmt.Sprintf(`del /f /q "%s" >nul 2>nul`, executable),
		fmt.Sprintf(`del /f /q "%s" >nul 2>nul`, scriptPath),
	}, "\r\n")
	if err := os.WriteFile(scriptPath, []byte(script), 0o600); err != nil {
		return err
	}

	cmd := exec.Command("cmd.exe", "/c", scriptPath)
	configureDetachedCommand(cmd)
	return cmd.Start()
}

func handleUninstall(args []string) error {
	if len(args) != 0 {
		return fmt.Errorf("usage: bore uninstall")
	}

	config, err := loadConfigIfPresent()
	if err != nil {
		return err
	}

	var warnings []string
	if err := stopDaemonIfRunning(); err != nil {
		warnings = append(warnings, fmt.Sprintf("unable to stop daemon: %s", err))
	}

	if config != nil {
		if err := clearRemoteDeviceClaims(*config); err != nil {
			warnings = append(warnings, fmt.Sprintf("unable to clear remote tunnel claims: %s", err))
		}
	}

	if err := uninstallAutostart(); err != nil {
		warnings = append(warnings, fmt.Sprintf("unable to remove autostart: %s", err))
	}

	if err := removeConfigDir(); err != nil {
		warnings = append(warnings, fmt.Sprintf("unable to remove %s: %s", getConfigDir(), err))
	}

	removedBinary, err := removeExecutable()
	if err != nil {
		warnings = append(warnings, fmt.Sprintf("unable to remove installed binary: %s", err))
	}

	fmt.Println("Bore local state has been removed.")
	if removedBinary {
		fmt.Println("The bore executable has been removed.")
	} else {
		fmt.Println("The current bore executable was left in place.")
	}

	if len(warnings) > 0 {
		fmt.Println("Warnings:")
		for _, warning := range warnings {
			fmt.Printf("  %s\n", warning)
		}
	}

	return nil
}
