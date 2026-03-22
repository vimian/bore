package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type apiClient struct {
	config     AgentConfig
	httpClient *http.Client
}

func newAPIClient(config AgentConfig) *apiClient {
	return &apiClient{
		config: config,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *apiClient) getMe() (MeResponse, error) {
	var result MeResponse
	err := c.requestJSON(http.MethodGet, "/api/v1/me", nil, &result)
	return result, err
}

func (c *apiClient) registerDevice() error {
	body := buildDeviceRegistration(c.config)
	return c.requestJSON(http.MethodPost, "/api/v1/devices/register", body, nil)
}

func (c *apiClient) syncTunnels() (SyncResponse, error) {
	var result SyncResponse
	body := map[string]any{
		"deviceId":       c.config.DeviceID,
		"desiredTunnels": c.config.DesiredTunnels,
	}
	err := c.requestJSON(http.MethodPost, "/api/v1/tunnels/sync", body, &result)
	return result, err
}

func (c *apiClient) listTunnels() ([]TunnelView, error) {
	var result struct {
		Tunnels []TunnelView `json:"tunnels"`
	}
	err := c.requestJSON(http.MethodGet, "/api/v1/tunnels", nil, &result)
	return result.Tunnels, err
}

func (c *apiClient) listNamespaces() ([]NamespaceView, error) {
	var result struct {
		Namespaces []NamespaceView `json:"namespaces"`
	}
	err := c.requestJSON(http.MethodGet, "/api/v1/namespaces", nil, &result)
	return result.Namespaces, err
}

func (c *apiClient) releaseNamespace(subdomain string) (NamespaceReleaseResponse, error) {
	var result NamespaceReleaseResponse
	err := c.requestJSON(http.MethodDelete, "/api/v1/namespaces/"+url.PathEscape(subdomain), nil, &result)
	return result, err
}

func (c *apiClient) createAccessHost(subdomain, label string) (NamespaceAccessHostView, *NamespaceView, error) {
	var result struct {
		AccessHost NamespaceAccessHostView `json:"accessHost"`
		Namespace  *NamespaceView          `json:"namespace"`
	}
	err := c.requestJSON(http.MethodPost, "/api/v1/namespaces/"+url.PathEscape(subdomain)+"/access-hosts", map[string]string{
		"label": label,
	}, &result)
	return result.AccessHost, result.Namespace, err
}

func (c *apiClient) removeAccessHost(subdomain, label string) (string, *NamespaceView, error) {
	var result struct {
		RemovedHostname string         `json:"removedHostname"`
		Namespace       *NamespaceView `json:"namespace"`
	}
	err := c.requestJSON(http.MethodDelete, "/api/v1/namespaces/"+url.PathEscape(subdomain)+"/access-hosts", map[string]string{
		"label": label,
	}, &result)
	return result.RemovedHostname, result.Namespace, err
}

func (c *apiClient) requestJSON(method, requestPath string, body any, target any) error {
	u, err := url.Parse(c.config.ServerOrigin)
	if err != nil {
		return err
	}

	u.Path = strings.TrimRight(u.Path, "/") + requestPath

	var payload io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}

		payload = bytes.NewReader(raw)
	}

	req, err := http.NewRequest(method, u.String(), payload)
	if err != nil {
		return err
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	if c.config.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.config.Token)
	}

	res, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		message, _ := io.ReadAll(res.Body)
		text := strings.TrimSpace(string(message))
		if text == "" {
			text = fmt.Sprintf("%d %s", res.StatusCode, res.Status)
		}

		return fmt.Errorf("%s", text)
	}

	if target == nil {
		io.Copy(io.Discard, res.Body)
		return nil
	}

	return json.NewDecoder(res.Body).Decode(target)
}
