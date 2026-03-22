package agent

import (
	"bufio"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

func usage() string {
	return strings.Join([]string{
		"Usage:",
		"  bore login [--server <origin>]",
		"  bore whoami",
		"  bore up <port>",
		"  bore down <port>",
		"  bore release <namespace>",
		"  bore reassign <port>",
		"  bore host add <namespace> <label>",
		"  bore host rm <namespace> <label>",
		"  bore ps",
		"  bore ls",
		"  bore uninstall",
		"  bore self-update",
		"  bore version",
	}, "\n")
}

func Run(args []string) error {
	if len(args) == 0 {
		fmt.Println(usage())
		return nil
	}

	command := args[0]
	rest := args[1:]

	var err error
	switch command {
	case "login":
		err = handleLogin(rest)
	case "whoami":
		err = handleWhoAmI()
	case "up":
		err = handleUp(rest)
	case "down":
		err = handleDown(rest)
	case "release":
		err = handleRelease(rest)
	case "reassign":
		err = handleReassign(rest)
	case "host":
		err = handleHost(rest)
	case "ps":
		err = handlePs()
	case "ls":
		err = handleLs()
	case "uninstall":
		err = handleUninstall(rest)
	case "daemon":
		err = handleDaemon(rest)
	case "self-update":
		err = selfUpdate()
	case "version", "--version", "-v":
		fmt.Printf("bore %s (%s, %s)\n", Version, Commit, BuildDate)
		return nil
	case "help", "--help", "-h":
		fmt.Println(usage())
		return nil
	default:
		err = fmt.Errorf("unknown command: %s", command)
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		fmt.Println(usage())
	}

	return err
}

func parseServerOrigin(value string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return "", fmt.Errorf("missing value for --server")
	}

	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil {
		return "", fmt.Errorf("invalid server origin: %s", value)
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("server origin must use http or https")
	}

	parsed.Path = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/"), nil
}

func consumeServerOriginFlag(args []string) ([]string, string, error) {
	var serverOrigin string
	var remaining []string

	for index := 0; index < len(args); index++ {
		arg := args[index]
		if arg != "--server" {
			remaining = append(remaining, arg)
			continue
		}

		if index+1 >= len(args) {
			return nil, "", fmt.Errorf("missing value for --server")
		}

		value, err := parseServerOrigin(args[index+1])
		if err != nil {
			return nil, "", err
		}
		serverOrigin = value
		index++
	}

	return remaining, serverOrigin, nil
}

func parsePort(value string) (int, error) {
	port, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || port < 1 || port > 65535 {
		return 0, fmt.Errorf("port must be an integer between 1 and 65535")
	}
	return port, nil
}

func ensureLoggedIn(config AgentConfig) (AgentConfig, error) {
	if config.Token != "" {
		return config, nil
	}

	return login(config)
}

func handleLogin(args []string) error {
	remaining, serverOrigin, err := consumeServerOriginFlag(args)
	if err != nil {
		return err
	}
	if len(remaining) != 0 {
		return fmt.Errorf("usage: bore login [--server <origin>]")
	}

	config, err := loadConfig()
	if err != nil {
		return err
	}
	if serverOrigin != "" {
		config.ServerOrigin = serverOrigin
	}

	next, err := login(config)
	if err != nil {
		return err
	}

	email := next.UserEmail
	if email == "" {
		email = "unknown user"
	}
	fmt.Printf("Logged in as %s.\n", email)
	return nil
}

func handleWhoAmI() error {
	config, err := loadConfig()
	if err != nil {
		return err
	}

	config, err = ensureLoggedIn(config)
	if err != nil {
		return err
	}

	me, err := newAPIClient(config).getMe()
	if err != nil {
		return err
	}

	fmt.Printf("%s (%s)\n", me.Email, me.Name)
	return nil
}

func handleUp(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: bore up <port>")
	}

	port, err := parsePort(args[0])
	if err != nil {
		return err
	}

	for _, arg := range args[1:] {
		if arg == "--subdomain" {
			return fmt.Errorf("custom subdomains are no longer supported. The server assigns one automatically")
		}
	}

	config, err := loadConfig()
	if err != nil {
		return err
	}
	config, err = ensureLoggedIn(config)
	if err != nil {
		return err
	}

	var preferredSubdomain string
	var allocateNewSubdomain bool
	existingIndex := -1
	for index, tunnel := range config.DesiredTunnels {
		if tunnel.LocalPort == port {
			existingIndex = index
			preferredSubdomain = tunnel.PreferredSubdomain
			allocateNewSubdomain = tunnel.AllocateNewSubdomain
			break
		}
	}

	if existingIndex == -1 {
		if err := ensureDaemonRunning(); err != nil {
			return err
		}
		current, err := syncDaemon()
		if err != nil {
			return err
		}

		preferredSubdomain, err = promptNamespaceChoice(current.ReusableSubdomains, "")
		if err != nil {
			return err
		}
		allocateNewSubdomain = preferredSubdomain == ""
	}

	nextTunnels := make([]DesiredTunnelConfig, 0, len(config.DesiredTunnels)+1)
	for _, tunnel := range config.DesiredTunnels {
		if tunnel.LocalPort != port {
			nextTunnels = append(nextTunnels, tunnel)
		}
	}
	nextTunnels = append(nextTunnels, DesiredTunnelConfig{
		LocalPort:            port,
		PreferredSubdomain:   preferredSubdomain,
		AllocateNewSubdomain: allocateNewSubdomain,
	})
	config.DesiredTunnels = nextTunnels
	if err := saveConfig(config); err != nil {
		return err
	}

	if installed, err := ensureAutostart(config); err == nil && installed {
		config.AutostartInstalled = true
		_ = saveConfig(config)
	} else if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: unable to install autostart: %s\n", err)
	}

	if err := ensureDaemonRunning(); err != nil {
		return err
	}

	result, err := syncDaemon()
	if err != nil {
		return err
	}

	config = mergeAssignedNamespaces(config, result.Tunnels, config.DeviceID)
	if err := saveConfig(config); err != nil {
		return err
	}

	tunnel := findTunnel(result.Tunnels, config.DeviceID, port)
	tunnel, err = waitForTunnelStatus(config, port, tunnel)
	if err != nil {
		return err
	}
	if tunnel == nil {
		return fmt.Errorf("the daemon synced, but the tunnel was not returned")
	}

	fmt.Printf("%s -> localhost:%d (%s)\n", tunnel.PublicURL, port, tunnel.Status)
	for _, namespace := range result.Namespaces {
		if namespace.Subdomain != tunnel.Subdomain {
			continue
		}
		for _, accessHost := range namespace.AccessHosts {
			fmt.Printf("%s -> localhost:%d (%s)\n", accessHost.PublicURL, port, accessHost.Kind)
		}
	}

	if len(result.ReusableSubdomains) > 0 {
		fmt.Printf("Available reserved namespaces: %s\n", strings.Join(result.ReusableSubdomains, ", "))
	}
	return nil
}

func handleDown(args []string) error {
	if len(args) != 1 {
		return fmt.Errorf("usage: bore down <port>")
	}

	port, err := parsePort(args[0])
	if err != nil {
		return err
	}

	config, err := loadConfig()
	if err != nil {
		return err
	}

	next := config
	next.DesiredTunnels = make([]DesiredTunnelConfig, 0, len(config.DesiredTunnels))
	for _, tunnel := range config.DesiredTunnels {
		if tunnel.LocalPort != port {
			next.DesiredTunnels = append(next.DesiredTunnels, tunnel)
		}
	}

	if err := saveConfig(next); err != nil {
		return err
	}
	if err := ensureDaemonRunning(); err != nil {
		return err
	}
	if _, err := syncDaemon(); err != nil {
		return err
	}

	fmt.Printf("Stopped tunnel for localhost:%d. The subdomain reservation is still kept.\n", port)
	return nil
}

func handleRelease(args []string) error {
	if len(args) != 1 || strings.TrimSpace(args[0]) == "" {
		return fmt.Errorf("usage: bore release <namespace>")
	}

	config, err := loadConfig()
	if err != nil {
		return err
	}
	config, err = ensureLoggedIn(config)
	if err != nil {
		return err
	}

	result, err := newAPIClient(config).releaseNamespace(strings.TrimSpace(args[0]))
	if err != nil {
		return err
	}

	fmt.Printf("Released namespace %s.\n", result.ReleasedSubdomain)
	if len(result.RemovedAccessHostIDs) == 0 {
		fmt.Println("Removed child hosts: none")
		return nil
	}

	fmt.Println("Removed child hosts:")
	for _, hostname := range result.RemovedAccessHostIDs {
		fmt.Printf("  %s\n", hostname)
	}
	return nil
}

func handleReassign(args []string) error {
	if len(args) != 1 {
		return fmt.Errorf("usage: bore reassign <port>")
	}

	port, err := parsePort(args[0])
	if err != nil {
		return err
	}

	config, err := loadConfig()
	if err != nil {
		return err
	}
	config, err = ensureLoggedIn(config)
	if err != nil {
		return err
	}

	existingIndex := -1
	for index, tunnel := range config.DesiredTunnels {
		if tunnel.LocalPort == port {
			existingIndex = index
			break
		}
	}
	if existingIndex == -1 {
		return fmt.Errorf("no configured tunnel for localhost:%d", port)
	}

	if err := ensureDaemonRunning(); err != nil {
		return err
	}
	current, err := syncDaemon()
	if err != nil {
		return err
	}

	currentAssigned := config.DesiredTunnels[existingIndex].PreferredSubdomain
	if tunnel := findTunnel(current.Tunnels, config.DeviceID, port); tunnel != nil {
		currentAssigned = tunnel.Subdomain
	}

	selected, err := promptNamespaceChoice(current.ReusableSubdomains, currentAssigned)
	if err != nil {
		return err
	}

	config.DesiredTunnels[existingIndex].PreferredSubdomain = selected
	config.DesiredTunnels[existingIndex].AllocateNewSubdomain = selected == ""
	if err := saveConfig(config); err != nil {
		return err
	}

	result, err := syncDaemon()
	if err != nil {
		return err
	}

	config = mergeAssignedNamespaces(config, result.Tunnels, config.DeviceID)
	if err := saveConfig(config); err != nil {
		return err
	}

	tunnel := findTunnel(result.Tunnels, config.DeviceID, port)
	if tunnel == nil {
		return fmt.Errorf("the daemon synced, but the tunnel was not returned")
	}

	fmt.Printf("Reassigned localhost:%d to %s (%s)\n", port, tunnel.PublicURL, tunnel.Status)
	return nil
}

func handlePs() error {
	config, err := loadConfig()
	if err != nil {
		return err
	}
	config, err = ensureLoggedIn(config)
	if err != nil {
		return err
	}

	tunnels, err := newAPIClient(config).listTunnels()
	if err != nil {
		return err
	}

	printTunnels(tunnels)
	return nil
}

func handleLs() error {
	config, err := loadConfig()
	if err != nil {
		return err
	}
	config, err = ensureLoggedIn(config)
	if err != nil {
		return err
	}

	namespaces, err := newAPIClient(config).listNamespaces()
	if err != nil {
		return err
	}

	printNamespaces(namespaces)
	return nil
}

func handleHost(args []string) error {
	if len(args) != 3 {
		return fmt.Errorf("usage: bore host add <namespace> <label>\n  bore host rm <namespace> <label>")
	}

	config, err := loadConfig()
	if err != nil {
		return err
	}
	config, err = ensureLoggedIn(config)
	if err != nil {
		return err
	}

	client := newAPIClient(config)
	switch args[0] {
	case "add":
		accessHost, namespace, err := client.createAccessHost(args[1], args[2])
		if err != nil {
			return err
		}
		if accessHost.PublicURL == "" {
			return fmt.Errorf("the server reserved the child host, but did not return its public URL")
		}
		fmt.Printf("Reserved %s\n", accessHost.PublicURL)
		if namespace != nil {
			fmt.Printf("Namespace %s now has:\n", namespace.Subdomain)
			for _, item := range namespace.AccessHosts {
				fmt.Printf("  %s (%s)\n", item.PublicURL, item.Kind)
			}
		}
		return nil
	case "rm":
		removedHostname, namespace, err := client.removeAccessHost(args[1], args[2])
		if err != nil {
			return err
		}
		fmt.Printf("Removed %s\n", removedHostname)
		if namespace != nil {
			fmt.Printf("Namespace %s now has:\n", namespace.Subdomain)
			if len(namespace.AccessHosts) == 0 {
				fmt.Println("  no child hosts")
			} else {
				for _, item := range namespace.AccessHosts {
					fmt.Printf("  %s (%s)\n", item.PublicURL, item.Kind)
				}
			}
		}
		return nil
	default:
		return fmt.Errorf("usage: bore host add <namespace> <label>\n  bore host rm <namespace> <label>")
	}
}

func handleDaemon(args []string) error {
	if len(args) != 1 || args[0] != "start" {
		return fmt.Errorf("usage: bore daemon start")
	}
	return runDaemon()
}

func formatTable(rows [][]string) string {
	if len(rows) == 0 {
		return ""
	}

	widths := make([]int, len(rows[0]))
	for _, row := range rows {
		for index, cell := range row {
			if len(cell) > widths[index] {
				widths[index] = len(cell)
			}
		}
	}

	lines := make([]string, 0, len(rows))
	for _, row := range rows {
		cells := make([]string, len(row))
		for index, cell := range row {
			cells[index] = fmt.Sprintf("%-*s", widths[index], cell)
		}
		lines = append(lines, strings.TrimRight(strings.Join(cells, "  "), " "))
	}

	return strings.Join(lines, "\n")
}

func printTunnels(tunnels []TunnelView) {
	if len(tunnels) == 0 {
		fmt.Println("No tunnels found.")
		return
	}

	rows := [][]string{{"status", "subdomain", "port", "device", "hostname", "url"}}
	for _, tunnel := range tunnels {
		rows = append(rows, []string{
			tunnel.Status,
			tunnel.Subdomain,
			strconv.Itoa(tunnel.LocalPort),
			tunnel.DeviceName,
			tunnel.Hostname,
			tunnel.PublicURL,
		})
	}
	fmt.Println(formatTable(rows))
}

func printNamespaces(namespaces []NamespaceView) {
	if len(namespaces) == 0 {
		fmt.Println("No namespaces found.")
		return
	}

	for _, namespace := range namespaces {
		fmt.Printf("%s (%s)\n", namespace.Subdomain, namespace.Status)
		fmt.Printf("  root: %s\n", namespace.PublicURL)
		if len(namespace.AccessHosts) == 0 {
			fmt.Println("  child hosts: none")
		} else {
			parts := make([]string, 0, len(namespace.AccessHosts))
			for _, accessHost := range namespace.AccessHosts {
				parts = append(parts, fmt.Sprintf("%s [%s]", accessHost.Label, accessHost.Kind))
			}
			fmt.Printf("  child hosts: %s\n", strings.Join(parts, ", "))
			for _, accessHost := range namespace.AccessHosts {
				fmt.Printf("    %s\n", accessHost.PublicURL)
			}
		}

		if len(namespace.Claims) == 0 {
			fmt.Println("  claims: none")
		} else {
			for _, claim := range namespace.Claims {
				fmt.Printf("  claim: %s localhost:%d on %s (%s)\n", claim.Status, claim.LocalPort, claim.DeviceName, claim.Hostname)
			}
		}
	}
}

func promptNamespaceChoice(reusableSubdomains []string, currentSubdomain string) (string, error) {
	reusable := make([]string, 0, len(reusableSubdomains))
	for _, subdomain := range reusableSubdomains {
		if subdomain != currentSubdomain {
			reusable = append(reusable, subdomain)
		}
	}

	if len(reusable) == 0 {
		return "", nil
	}

	reader := bufio.NewReader(os.Stdin)
	if len(reusable) == 1 {
		fmt.Printf("Reuse reserved namespace *.%s? [Y/n]: ", reusable[0])
		answer, _ := reader.ReadString('\n')
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(answer)), "n") {
			return "", nil
		}
		return reusable[0], nil
	}

	fmt.Println("Choose a reserved namespace to reuse, or generate a new one:")
	for index, subdomain := range reusable {
		fmt.Printf("  %d. *.%s\n", index+1, subdomain)
	}
	fmt.Println("  0. Generate a new namespace")

	for {
		fmt.Print("Selection: ")
		answer, _ := reader.ReadString('\n')
		selection, err := strconv.Atoi(strings.TrimSpace(answer))
		if err == nil && selection >= 0 && selection <= len(reusable) {
			if selection == 0 {
				return "", nil
			}
			return reusable[selection-1], nil
		}
	}
}

func mergeAssignedNamespaces(config AgentConfig, tunnels []TunnelView, deviceID string) AgentConfig {
	next := config
	next.DesiredTunnels = make([]DesiredTunnelConfig, 0, len(config.DesiredTunnels))
	for _, desired := range config.DesiredTunnels {
		updated := desired
		for _, tunnel := range tunnels {
			if tunnel.DeviceID == deviceID && tunnel.LocalPort == desired.LocalPort {
				updated.PreferredSubdomain = tunnel.Subdomain
				updated.AllocateNewSubdomain = false
				break
			}
		}
		next.DesiredTunnels = append(next.DesiredTunnels, updated)
	}
	return next
}

func waitForTunnelStatus(config AgentConfig, port int, initialTunnel *TunnelView) (*TunnelView, error) {
	if initialTunnel == nil || initialTunnel.Status != "offline" {
		return initialTunnel, nil
	}

	client := newAPIClient(config)
	for range 10 {
		time.Sleep(500 * time.Millisecond)
		tunnels, err := client.listTunnels()
		if err != nil {
			return nil, err
		}
		tunnel := findTunnel(tunnels, config.DeviceID, port)
		if tunnel == nil || tunnel.Status != "offline" {
			return tunnel, nil
		}
	}

	return initialTunnel, nil
}

func findTunnel(tunnels []TunnelView, deviceID string, port int) *TunnelView {
	for _, tunnel := range tunnels {
		if tunnel.DeviceID == deviceID && tunnel.LocalPort == port {
			copy := tunnel
			return &copy
		}
	}
	return nil
}
