package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

var localHTTPClient = &http.Client{Timeout: 10 * time.Second}

func requestLocalJSON(method, path string, body any, target any) error {
	runtimeState, err := loadRuntime()
	if err != nil {
		return err
	}

	if runtimeState.ControlPort == 0 {
		return fmt.Errorf("bore daemon is not running")
	}

	var payload io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		payload = bytes.NewReader(raw)
	}

	req, err := http.NewRequest(method, fmt.Sprintf("http://127.0.0.1:%d%s", runtimeState.ControlPort, path), payload)
	if err != nil {
		return err
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	res, err := localHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		message, _ := io.ReadAll(res.Body)
		return fmt.Errorf("%s", bytes.TrimSpace(message))
	}

	if target == nil {
		io.Copy(io.Discard, res.Body)
		return nil
	}

	return json.NewDecoder(res.Body).Decode(target)
}

func isDaemonHealthy() bool {
	return requestLocalJSON(http.MethodGet, "/health", nil, nil) == nil
}

func syncDaemon() (SyncResponse, error) {
	var response SyncResponse
	err := requestLocalJSON(http.MethodPost, "/sync", nil, &response)
	return response, err
}

func stopDaemon() error {
	return requestLocalJSON(http.MethodPost, "/stop", nil, nil)
}
