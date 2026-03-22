package agent

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func isTemporaryExecutable(path string) bool {
	tempDir := filepath.Clean(os.TempDir())
	cleanPath := filepath.Clean(path)
	return strings.HasPrefix(strings.ToLower(cleanPath), strings.ToLower(tempDir))
}

func ensureDaemonRunning() error {
	if isDaemonHealthy() {
		return nil
	}

	executable, err := os.Executable()
	if err != nil {
		return err
	}

	if isTemporaryExecutable(executable) {
		return fmt.Errorf("the current bore executable is temporary; build the Go client to a stable path before starting the daemon")
	}

	cmd := exec.Command(executable, "daemon", "start")
	configureDetachedCommand(cmd)
	if err := cmd.Start(); err != nil {
		return err
	}

	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(250 * time.Millisecond)
		if isDaemonHealthy() {
			return nil
		}
	}

	return fmt.Errorf("timed out waiting for the bore daemon to start")
}
