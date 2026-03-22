package agent

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type updateManifest struct {
	Version     string                 `json:"version"`
	Commit      string                 `json:"commit"`
	GeneratedAt string                 `json:"generatedAt"`
	Assets      map[string]updateAsset `json:"assets"`
}

type updateAsset struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

func updateBaseURL(config AgentConfig) string {
	if value := os.Getenv("BORE_UPDATE_BASE_URL"); value != "" {
		return strings.TrimRight(value, "/")
	}

	if config.ServerOrigin != "" {
		return strings.TrimRight(config.ServerOrigin, "/") + "/downloads/latest"
	}

	return hostedServerOrigin + "/downloads/latest"
}

func currentUpdateTarget() string {
	return runtime.GOOS + "-" + runtime.GOARCH
}

func selfUpdate() error {
	config, _ := loadConfig()
	baseURL := updateBaseURL(config)

	manifestURL := baseURL + "/manifest.json"
	res, err := (&http.Client{Timeout: 30 * time.Second}).Get(manifestURL)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body, _ := io.ReadAll(res.Body)
		return fmt.Errorf("unable to fetch update manifest: %s", strings.TrimSpace(string(body)))
	}

	var manifest updateManifest
	if err := json.NewDecoder(res.Body).Decode(&manifest); err != nil {
		return err
	}

	target := currentUpdateTarget()
	asset, ok := manifest.Assets[target]
	if !ok {
		return fmt.Errorf("no update asset published for %s", target)
	}

	if manifest.Version == Version && Version != "dev" {
		fmt.Printf("bore is already up to date (%s)\n", Version)
		return nil
	}

	executable, err := os.Executable()
	if err != nil {
		return err
	}

	wasRunning := isDaemonHealthy()
	if wasRunning {
		_ = stopDaemon()
	}

	assetURL := baseURL + "/" + strings.TrimLeft(asset.Path, "/")
	tmpPath := executable + ".download"
	if runtime.GOOS == "windows" {
		tmpPath = executable + ".new"
	}

	if err := downloadAndVerify(assetURL, asset.SHA256, tmpPath); err != nil {
		return err
	}

	if runtime.GOOS != "windows" {
		if err := os.Chmod(tmpPath, 0o755); err != nil {
			return err
		}
		if err := os.Rename(tmpPath, executable); err != nil {
			return err
		}
		if wasRunning {
			return ensureDaemonRunning()
		}
		fmt.Printf("Updated bore to %s\n", manifest.Version)
		return nil
	}

	restartCommand := ""
	if wasRunning {
		restartCommand = fmt.Sprintf(` & start "" "%s" daemon start`, executable)
	}

	scriptPath := executable + ".update.cmd"
	script := strings.Join([]string{
		"@echo off",
		"ping 127.0.0.1 -n 2 >nul",
		fmt.Sprintf(`move /Y "%s" "%s" >nul`, tmpPath, executable),
		restartCommand,
		fmt.Sprintf(`del "%s" >nul 2>nul`, scriptPath),
	}, "\r\n")
	if err := os.WriteFile(scriptPath, []byte(script), 0o600); err != nil {
		return err
	}

	cmd := exec.Command("cmd.exe", "/c", scriptPath)
	configureDetachedCommand(cmd)
	if err := cmd.Start(); err != nil {
		return err
	}

	fmt.Printf("Downloaded bore %s. The new binary will replace the current executable after this process exits.\n", manifest.Version)
	return nil
}

func downloadAndVerify(assetURL, expectedSHA, destination string) error {
	res, err := (&http.Client{Timeout: 2 * time.Minute}).Get(assetURL)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body, _ := io.ReadAll(res.Body)
		return fmt.Errorf("unable to download update asset: %s", strings.TrimSpace(string(body)))
	}

	tempFile, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer tempFile.Close()

	hash := sha256.New()
	if _, err := io.Copy(io.MultiWriter(tempFile, hash), res.Body); err != nil {
		return err
	}

	actualSHA := hex.EncodeToString(hash.Sum(nil))
	if expectedSHA != "" && !strings.EqualFold(actualSHA, expectedSHA) {
		return fmt.Errorf("update checksum mismatch: expected %s, got %s", expectedSHA, actualSHA)
	}

	return nil
}

func installerBaseURL(requestURL *url.URL) string {
	if value := os.Getenv("BORE_INSTALL_BASE_URL"); value != "" {
		return strings.TrimRight(value, "/")
	}

	if requestURL != nil {
		requestURL = cloneURL(requestURL)
		requestURL.Path = ""
		requestURL.RawQuery = ""
		requestURL.Fragment = ""
		return strings.TrimRight(requestURL.String(), "/")
	}

	return strings.TrimRight(hostedServerOrigin, "/")
}

func cloneURL(value *url.URL) *url.URL {
	clone := *value
	return &clone
}

func outputBinaryName() string {
	if runtime.GOOS == "windows" {
		return "bore.exe"
	}
	return "bore"
}

func outputAssetFileName(target string) string {
	if strings.HasPrefix(target, "windows-") {
		return "bore-" + target + ".exe"
	}
	return "bore-" + target
}

func defaultInstallDir() string {
	if value := os.Getenv("BORE_INSTALL_DIR"); value != "" {
		return value
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "$HOME/.local/bin"
	}

	return filepath.Join(home, ".local", "bin")
}
