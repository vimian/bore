package agent

import "fmt"

const (
	guiHost = "gui.bore.dk"
	guiPort = 53173
)

func guiBrowserURL() string {
	return fmt.Sprintf("http://%s:%d", guiHost, guiPort)
}

func guiLocalURL() string {
	return fmt.Sprintf("http://127.0.0.1:%d", guiPort)
}

func guiHealthURL() string {
	return guiLocalURL() + "/health"
}
