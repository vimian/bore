package agent

import (
	"fmt"
	"os/exec"
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

var agentAutostartTarget = autostartTarget{
	taskName:    "BoreAgent",
	runValue:    "BoreAgent",
	plistName:   "dev.bore.agent.plist",
	label:       "dev.bore.agent",
	serviceName: "bore-agent.service",
	description: "Bore Agent",
	args:        []string{"daemon", "start"},
}

func ensureAutostart(config AgentConfig) (bool, error) {
	return installAutostartTarget(agentAutostartTarget, config.AutostartInstalled)
}

func uninstallAutostart() error {
	return uninstallAutostartTarget(agentAutostartTarget)
}
