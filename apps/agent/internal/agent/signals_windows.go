//go:build windows

package agent

import "os"

func daemonSignals() []os.Signal {
	return []os.Signal{os.Interrupt}
}
