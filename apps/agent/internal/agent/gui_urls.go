package agent

import "fmt"

const guiHost = "gui.bore.dk"

func guiBrowserURL(port int) string {
	return fmt.Sprintf("http://%s:%d", guiHost, port)
}

func guiLocalURL(port int) string {
	return fmt.Sprintf("http://127.0.0.1:%d", port)
}

func guiHealthURL(port int) string {
	return guiLocalURL(port) + "/health"
}
