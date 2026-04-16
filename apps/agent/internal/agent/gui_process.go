package agent

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"time"
)

func isGUIHealthy() bool {
	req, err := http.NewRequest(http.MethodGet, guiHealthURL(), nil)
	if err != nil {
		return false
	}

	res, err := localHTTPClient.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()

	return res.StatusCode >= 200 && res.StatusCode < 300
}

func ensureGUIRunning() error {
	if isGUIHealthy() {
		return nil
	}

	executable, err := os.Executable()
	if err != nil {
		return err
	}

	if isTemporaryExecutable(executable) {
		return fmt.Errorf("the current bore executable is temporary; build the Go client to a stable path before starting the GUI")
	}

	cmd := exec.Command(executable, "gui", "serve")
	configureDetachedCommand(cmd)
	if err := cmd.Start(); err != nil {
		return err
	}

	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(250 * time.Millisecond)
		if isGUIHealthy() {
			return nil
		}
	}

	return fmt.Errorf("timed out waiting for the Bore GUI to start on 127.0.0.1:%d", guiPort)
}

func stopGUI() error {
	if !isGUIHealthy() {
		return nil
	}

	if err := requestGUILocalJSON(http.MethodPost, "/stop", nil, nil); err != nil {
		return err
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(100 * time.Millisecond)
		if !isGUIHealthy() {
			return nil
		}
	}

	return fmt.Errorf("timed out waiting for the Bore GUI to stop")
}

func stopGUIIfRunning() error {
	return stopGUI()
}

func requestGUILocalJSON(method, path string, body any, target any) error {
	return requestRuntimeLocalJSON(guiPort, method, path, body, target)
}
