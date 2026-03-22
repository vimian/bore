package agent

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"time"
)

func login(config AgentConfig) (AgentConfig, error) {
	state := newUUID()
	type result struct {
		token string
		email string
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return AgentConfig{}, err
	}
	defer listener.Close()

	resultCh := make(chan result, 1)
	errCh := make(chan error, 1)

	var server *http.Server
	server = &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			callbackURL, err := url.Parse("http://127.0.0.1")
			if err != nil {
				http.Error(w, "Invalid callback", http.StatusInternalServerError)
				return
			}

			callbackURL.Path = r.URL.Path
			callbackURL.RawQuery = r.URL.RawQuery

			if callbackURL.Path != "/callback" {
				http.NotFound(w, r)
				return
			}

			if callbackURL.Query().Get("state") != state {
				http.Error(w, "State mismatch", http.StatusBadRequest)
				return
			}

			token := callbackURL.Query().Get("token")
			if token == "" {
				http.Error(w, "Missing token", http.StatusBadRequest)
				return
			}

			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write([]byte("bore login completed. You can return to the terminal."))

			select {
			case resultCh <- result{
				token: token,
				email: callbackURL.Query().Get("email"),
			}:
			default:
			}

			go server.Shutdown(context.Background())
		}),
	}

	go func() {
		if serveErr := server.Serve(listener); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			errCh <- serveErr
		}
	}()

	callback := url.URL{
		Scheme: "http",
		Host:   listener.Addr().String(),
		Path:   "/callback",
	}

	authURL, err := url.Parse(config.ServerOrigin)
	if err != nil {
		return AgentConfig{}, err
	}

	authURL.Path = "/auth/cli/start"
	query := authURL.Query()
	query.Set("callback", callback.String())
	query.Set("state", state)
	query.Set("device_name", config.DeviceName)
	authURL.RawQuery = query.Encode()

	if err := openBrowser(authURL.String()); err != nil {
		return AgentConfig{}, err
	}

	select {
	case <-ctx.Done():
		_ = server.Shutdown(context.Background())
		return AgentConfig{}, fmt.Errorf("timed out waiting for browser sign-in")
	case err := <-errCh:
		return AgentConfig{}, err
	case callbackResult := <-resultCh:
		next := config
		next.Token = callbackResult.token
		if callbackResult.email != "" {
			next.UserEmail = callbackResult.email
		}

		if err := saveConfig(next); err != nil {
			return AgentConfig{}, err
		}

		return next, nil
	}
}
