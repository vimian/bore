package agent

var guiAutostartTarget = autostartTarget{
	taskName:    "BoreGUI",
	runValue:    "BoreGUI",
	plistName:   "dev.bore.gui.plist",
	label:       "dev.bore.gui",
	serviceName: "bore-gui.service",
	description: "Bore GUI",
	args:        []string{"gui", "serve", "--open"},
	restart:     "on-failure",
}

func ensureGUIAutostart(config AgentConfig) (bool, error) {
	return installAutostartTarget(guiAutostartTarget, config.GUIAutostartInstalled)
}

func uninstallGUIAutostart() error {
	return uninstallAutostartTarget(guiAutostartTarget)
}
