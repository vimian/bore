package agent

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func quoteWindowsArgument(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `\"`) + `"`
}

func runWindowsCommand(command string, args ...string) error {
	cmd := exec.Command(command, args...)
	output, err := cmd.CombinedOutput()
	if err == nil {
		return nil
	}

	message := strings.TrimSpace(string(output))
	if message == "" {
		message = err.Error()
	}
	return fmt.Errorf("%s", message)
}

func ensureAutostart(config AgentConfig) (bool, error) {
	if config.AutostartInstalled {
		return false, nil
	}

	executable, err := os.Executable()
	if err != nil {
		return false, err
	}

	if isTemporaryExecutable(executable) {
		return false, fmt.Errorf("refusing to install autostart for a temporary executable")
	}

	switch runtime.GOOS {
	case "windows":
		taskCommand := quoteWindowsArgument(executable) + ` daemon start`
		taskErr := runWindowsCommand("schtasks", "/Create", "/SC", "ONLOGON", "/TN", "BoreAgent", "/TR", taskCommand, "/F")
		if taskErr == nil {
			return true, nil
		}

		regErr := runWindowsCommand(
			"reg",
			"ADD",
			`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`,
			"/V",
			"BoreAgent",
			"/T",
			"REG_SZ",
			"/D",
			taskCommand,
			"/F",
		)
		if regErr != nil {
			return false, fmt.Errorf("unable to install Windows autostart. Task Scheduler: %v. Registry fallback: %v", taskErr, regErr)
		}
		return true, nil
	case "darwin":
		dir := filepath.Join(getConfigDir(), "..", "Library", "LaunchAgents")
		if home, err := os.UserHomeDir(); err == nil {
			dir = filepath.Join(home, "Library", "LaunchAgents")
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return false, err
		}

		plistPath := filepath.Join(dir, "dev.bore.agent.plist")
		content := strings.Join([]string{
			`<?xml version="1.0" encoding="UTF-8"?>`,
			`<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
			`<plist version="1.0"><dict>`,
			`<key>Label</key><string>dev.bore.agent</string>`,
			`<key>ProgramArguments</key><array>`,
			`<string>` + executable + `</string>`,
			`<string>daemon</string>`,
			`<string>start</string>`,
			`</array>`,
			`<key>RunAtLoad</key><true/>`,
			`<key>KeepAlive</key><true/>`,
			`</dict></plist>`,
		}, "")
		if err := os.WriteFile(plistPath, []byte(content), 0o644); err != nil {
			return false, err
		}
		if output, err := exec.Command("launchctl", "load", "-w", plistPath).CombinedOutput(); err != nil {
			return false, fmt.Errorf("%s", strings.TrimSpace(string(output)))
		}
		return true, nil
	default:
		home, err := os.UserHomeDir()
		if err != nil {
			return false, err
		}
		dir := filepath.Join(home, ".config", "systemd", "user")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return false, err
		}

		servicePath := filepath.Join(dir, "bore-agent.service")
		content := strings.Join([]string{
			"[Unit]",
			"Description=Bore Agent",
			"",
			"[Service]",
			"ExecStart=" + executable + " daemon start",
			"Restart=always",
			"",
			"[Install]",
			"WantedBy=default.target",
			"",
		}, "\n")
		if err := os.WriteFile(servicePath, []byte(content), 0o644); err != nil {
			return false, err
		}

		if output, err := exec.Command("systemctl", "--user", "daemon-reload").CombinedOutput(); err != nil {
			return false, fmt.Errorf("%s", strings.TrimSpace(string(output)))
		}
		if output, err := exec.Command("systemctl", "--user", "enable", "--now", "bore-agent.service").CombinedOutput(); err != nil {
			return false, fmt.Errorf("%s", strings.TrimSpace(string(output)))
		}
		return true, nil
	}
}
