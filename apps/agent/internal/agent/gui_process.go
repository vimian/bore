package agent

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"time"
)

type guiHealthResponse struct {
	OK      bool   `json:"ok"`
	Service string `json:"service"`
}

func isGUIHealthyOnPort(port int) bool {
	req, err := http.NewRequest(http.MethodGet, guiHealthURL(port), nil)
	if err != nil {
		return false
	}

	res, err := localHTTPClient.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return false
	}

	var health guiHealthResponse
	if err := json.NewDecoder(res.Body).Decode(&health); err != nil {
		return false
	}

	return health.OK && health.Service == "bore-gui"
}

func guiRunningPort() int {
	runtimeState, err := loadRuntime()
	if err == nil && isGUIHealthyOnPort(runtimeState.GUIPort) {
		return runtimeState.GUIPort
	}

	for _, port := range guiPortCandidates() {
		if port == runtimeState.GUIPort {
			continue
		}
		if isGUIHealthyOnPort(port) {
			return port
		}
	}

	return 0
}

func ensureGUIRunning() (int, error) {
	if port := guiRunningPort(); port != 0 {
		return port, nil
	}

	executable, err := os.Executable()
	if err != nil {
		return 0, err
	}

	if isTemporaryExecutable(executable) {
		return 0, fmt.Errorf("the current bore executable is temporary; build the Go client to a stable path before starting the GUI")
	}

	cmd := exec.Command(executable, "gui", "serve")
	configureDetachedCommand(cmd)
	if err := cmd.Start(); err != nil {
		return 0, err
	}

	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(250 * time.Millisecond)
		if port := guiRunningPort(); port != 0 {
			return port, nil
		}
	}

	return 0, fmt.Errorf("timed out waiting for the Bore GUI to start on localhost")
}

func stopGUI() error {
	port := guiRunningPort()
	if port == 0 {
		return nil
	}

	if err := requestGUILocalJSON(http.MethodPost, "/stop", nil, nil); err != nil {
		return err
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(100 * time.Millisecond)
		if !isGUIHealthyOnPort(port) {
			return nil
		}
	}

	return fmt.Errorf("timed out waiting for the Bore GUI to stop")
}

func stopGUIIfRunning() error {
	return stopGUI()
}

func requestGUILocalJSON(method, path string, body any, target any) error {
	port := guiRunningPort()
	if port == 0 {
		return fmt.Errorf("bore gui is not running")
	}

	return requestRuntimeLocalJSON(port, method, path, body, target)
}
