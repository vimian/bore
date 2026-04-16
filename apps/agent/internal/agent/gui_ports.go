package agent

const (
	guiStartPort    = 53173
	guiPortAttempts = 32
)

func guiPortCandidates() []int {
	ports := make([]int, 0, guiPortAttempts)
	for offset := 0; offset < guiPortAttempts; offset++ {
		ports = append(ports, guiStartPort+offset)
	}

	return ports
}

func guiPreferredPort(runtimeState RuntimeState) int {
	if runtimeState.GUIPort > 0 {
		return runtimeState.GUIPort
	}

	return guiStartPort
}
