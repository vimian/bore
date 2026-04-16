package agent

import "fmt"

func handleGUI(args []string) error {
	if len(args) == 0 {
		if err := ensureGUIRunning(); err != nil {
			return err
		}
		if err := openBrowser(guiBrowserURL()); err != nil {
			return err
		}
		fmt.Printf("Bore GUI running at %s\n", guiBrowserURL())
		return nil
	}

	if len(args) != 1 {
		return fmt.Errorf("usage: bore gui\n  bore gui close")
	}

	switch args[0] {
	case "close":
		if err := stopGUIIfRunning(); err != nil {
			return err
		}
		fmt.Println("Bore GUI stopped.")
		return nil
	case "serve":
		return runGUIServer()
	default:
		return fmt.Errorf("usage: bore gui\n  bore gui close")
	}
}
