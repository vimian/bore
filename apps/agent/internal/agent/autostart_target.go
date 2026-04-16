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

type autostartTarget struct {
	taskName    string
	runValue    string
	plistName   string
	label       string
	serviceName string
	description string
	args        []string
	restart     string
}

func installAutostartTarget(target autostartTarget, installed bool) (bool, error) {
	if installed {
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
		taskCommand := buildWindowsCommand(executable, target.args)
		taskErr := runWindowsCommand("schtasks", "/Create", "/SC", "ONLOGON", "/TN", target.taskName, "/TR", taskCommand, "/F")
		if taskErr == nil {
			return true, nil
		}

		regErr := runWindowsCommand(
			"reg",
			"ADD",
			`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`,
			"/V",
			target.runValue,
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
		return installLaunchAgent(target, executable)
	default:
		return installSystemdUserService(target, executable)
	}
}

func uninstallAutostartTarget(target autostartTarget) error {
	var errs []error

	switch runtime.GOOS {
	case "windows":
		if err := uninstallWindowsAutostart(target); err != nil {
			errs = append(errs, err)
		}
	case "darwin":
		if err := uninstallLaunchAgent(target); err != nil {
			errs = append(errs, err)
		}
	default:
		if err := uninstallSystemdUserService(target); err != nil {
			errs = append(errs, err)
		}
	}

	return errors.Join(errs...)
}

func buildWindowsCommand(executable string, args []string) string {
	parts := []string{quoteWindowsArgument(executable)}
	for _, arg := range args {
		parts = append(parts, quoteWindowsArgument(arg))
	}

	return strings.Join(parts, " ")
}

func installLaunchAgent(target autostartTarget, executable string) (bool, error) {
	dir := filepath.Join(getConfigDir(), "..", "Library", "LaunchAgents")
	if home, err := os.UserHomeDir(); err == nil {
		dir = filepath.Join(home, "Library", "LaunchAgents")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return false, err
	}

	plistPath := filepath.Join(dir, target.plistName)
	programArguments := []string{"<string>" + executable + "</string>"}
	for _, arg := range target.args {
		programArguments = append(programArguments, "<string>"+arg+"</string>")
	}

	content := strings.Join([]string{
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
		`<plist version="1.0"><dict>`,
		`<key>Label</key><string>` + target.label + `</string>`,
		`<key>ProgramArguments</key><array>`,
		strings.Join(programArguments, ""),
		`</array>`,
		`<key>RunAtLoad</key><true/>`,
		launchAgentKeepAliveXML(target),
		`</dict></plist>`,
	}, "")
	if err := os.WriteFile(plistPath, []byte(content), 0o644); err != nil {
		return false, err
	}
	if output, err := exec.Command("launchctl", "load", "-w", plistPath).CombinedOutput(); err != nil {
		return false, fmt.Errorf("%s", strings.TrimSpace(string(output)))
	}

	return true, nil
}

func installSystemdUserService(target autostartTarget, executable string) (bool, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return false, err
	}
	dir := filepath.Join(home, ".config", "systemd", "user")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return false, err
	}

	servicePath := filepath.Join(dir, target.serviceName)
	content := strings.Join([]string{
		"[Unit]",
		"Description=" + target.description,
		"",
		"[Service]",
		"ExecStart=" + executable + " " + strings.Join(target.args, " "),
		"Restart=" + systemdRestartPolicy(target),
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
	if output, err := exec.Command("systemctl", "--user", "enable", "--now", target.serviceName).CombinedOutput(); err != nil {
		return false, fmt.Errorf("%s", strings.TrimSpace(string(output)))
	}

	return true, nil
}

func uninstallWindowsAutostart(target autostartTarget) error {
	var errs []error

	if err := runWindowsCommand("schtasks", "/Delete", "/TN", target.taskName, "/F"); err != nil && !strings.Contains(strings.ToLower(err.Error()), "cannot find") && !strings.Contains(strings.ToLower(err.Error()), "cannot find the file") {
		errs = append(errs, err)
	}
	if err := runWindowsCommand(
		"reg",
		"DELETE",
		`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`,
		"/V",
		target.runValue,
		"/F",
	); err != nil && !strings.Contains(strings.ToLower(err.Error()), "unable to find") && !strings.Contains(strings.ToLower(err.Error()), "was unable to find") {
		errs = append(errs, err)
	}

	return errors.Join(errs...)
}

func launchAgentKeepAliveXML(target autostartTarget) string {
	if systemdRestartPolicy(target) == "always" {
		return `<key>KeepAlive</key><true/>`
	}

	return `<key>KeepAlive</key><false/>`
}

func systemdRestartPolicy(target autostartTarget) string {
	if target.restart != "" {
		return target.restart
	}

	return "always"
}

func uninstallLaunchAgent(target autostartTarget) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}

	plistPath := filepath.Join(home, "Library", "LaunchAgents", target.plistName)
	var errs []error
	if output, unloadErr := exec.Command("launchctl", "unload", "-w", plistPath).CombinedOutput(); unloadErr != nil {
		message := strings.TrimSpace(string(output))
		if message != "" && !strings.Contains(strings.ToLower(message), "could not find specified service") && !strings.Contains(strings.ToLower(message), "no such file") {
			errs = append(errs, fmt.Errorf("%s", message))
		}
	}
	if removeErr := os.Remove(plistPath); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		errs = append(errs, removeErr)
	}

	return errors.Join(errs...)
}

func uninstallSystemdUserService(target autostartTarget) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}

	servicePath := filepath.Join(home, ".config", "systemd", "user", target.serviceName)
	var errs []error
	if output, disableErr := exec.Command("systemctl", "--user", "disable", "--now", target.serviceName).CombinedOutput(); disableErr != nil {
		message := strings.TrimSpace(string(output))
		if message != "" && !strings.Contains(strings.ToLower(message), "not loaded") && !strings.Contains(strings.ToLower(message), "does not exist") && !strings.Contains(strings.ToLower(message), "not found") {
			errs = append(errs, fmt.Errorf("%s", message))
		}
	}
	if removeErr := os.Remove(servicePath); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		errs = append(errs, removeErr)
	}
	if output, reloadErr := exec.Command("systemctl", "--user", "daemon-reload").CombinedOutput(); reloadErr != nil {
		message := strings.TrimSpace(string(output))
		if message != "" && !strings.Contains(strings.ToLower(message), "failed to connect to bus") {
			errs = append(errs, fmt.Errorf("%s", message))
		}
	}

	return errors.Join(errs...)
}
