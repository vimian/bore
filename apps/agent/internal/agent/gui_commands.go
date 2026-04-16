package agent

import "fmt"

func handleGUI(args []string) error {
	if len(args) == 0 {
		port, err := ensureGUIRunning()
		if err != nil {
			return err
		}
		if err := openBrowser(guiBrowserURL(port)); err != nil {
			return err
		}
		fmt.Printf("Bore GUI running at %s\n", guiBrowserURL(port))
		return nil
	}

	switch args[0] {
	case "close":
		if len(args) != 1 {
			return fmt.Errorf("usage: bore gui\n  bore gui close")
		}
		if err := stopGUIIfRunning(); err != nil {
			return err
		}
		fmt.Println("Bore GUI stopped.")
		return nil
	case "serve":
		openOnStart := len(args) == 2 && args[1] == "--open"
		if len(args) > 2 || (len(args) == 2 && !openOnStart) {
			return fmt.Errorf("usage: bore gui\n  bore gui close")
		}
		return runGUIServer(openOnStart)
	default:
		return fmt.Errorf("usage: bore gui\n  bore gui close")
	}
}
