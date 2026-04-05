package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type ResponseError struct {
	StatusCode int
	Message    string
	Code       string
	Details    map[string]any
}

func (err *ResponseError) Error() string {
	if err.Message != "" {
		return err.Message
	}

	if err.StatusCode > 0 {
		return fmt.Sprintf("%d %s", err.StatusCode, http.StatusText(err.StatusCode))
	}

	return "request failed"
}

func (err *ResponseError) IntDetail(key string) (int, bool) {
	if err == nil || err.Details == nil {
		return 0, false
	}

	value, ok := err.Details[key]
	if !ok {
		return 0, false
	}

	switch typed := value.(type) {
	case float64:
		if typed == float64(int(typed)) {
			return int(typed), true
		}
	case int:
		return typed, true
	case int32:
		return int(typed), true
	case int64:
		return int(typed), true
	case json.Number:
		number, parseErr := typed.Int64()
		if parseErr == nil {
			return int(number), true
		}
	case string:
		number, parseErr := strconv.Atoi(typed)
		if parseErr == nil {
			return number, true
		}
	}

	return 0, false
}

func decodeResponseError(statusCode int, raw []byte) error {
	trimmed := strings.TrimSpace(string(raw))

	var payload struct {
		Error   string         `json:"error"`
		Code    string         `json:"code"`
		Details map[string]any `json:"details"`
	}

	if decodeErr := json.Unmarshal(raw, &payload); decodeErr == nil {
		if payload.Error != "" || payload.Code != "" || len(payload.Details) > 0 {
			return &ResponseError{
				StatusCode: statusCode,
				Message:    payload.Error,
				Code:       payload.Code,
				Details:    payload.Details,
			}
		}
	}

	if trimmed == "" {
		trimmed = fmt.Sprintf("%d %s", statusCode, http.StatusText(statusCode))
	}

	return &ResponseError{
		StatusCode: statusCode,
		Message:    trimmed,
	}
}

func formatCLIError(err error) string {
	var responseErr *ResponseError
	if !errors.As(err, &responseErr) {
		return err.Error()
	}

	switch responseErr.Code {
	case "namespace_limit_reached":
		limit, ok := responseErr.IntDetail("limit")
		if !ok {
			return responseErr.Error()
		}

		return fmt.Sprintf(
			"Namespace limit reached: you already have %d reserved namespace%s. Reuse one with `bore ls`, stop an active claim with `bore down <port>`, or free one with `bore release <namespace>`.",
			limit,
			pluralSuffix(limit),
		)
	case "access_host_limit_reached":
		limit, ok := responseErr.IntDetail("limit")
		if !ok {
			return responseErr.Error()
		}

		return fmt.Sprintf(
			"Child hostname limit reached: you already have %d custom child hostname%s. Remove one with `bore host rm <namespace> <label>` or reuse an existing child hostname.",
			limit,
			pluralSuffix(limit),
		)
	case "namespace_has_active_claims":
		return fmt.Sprintf("%s Run `bore down <port>` for every tunnel using it, then try again.", responseErr.Error())
	default:
		return responseErr.Error()
	}
}

func explainNewNamespaceError(err error, reusableCount int) error {
	var responseErr *ResponseError
	if !errors.As(err, &responseErr) || responseErr.Code != "namespace_limit_reached" {
		return err
	}

	limit, ok := responseErr.IntDetail("limit")
	if !ok {
		return err
	}

	if reusableCount > 0 {
		return fmt.Errorf(
			"unable to create a new namespace: your account is already at its limit of %d reserved namespace%s. Reuse one of your existing namespaces instead of generating a new one.",
			limit,
			pluralSuffix(limit),
		)
	}

	return fmt.Errorf(
		"unable to create a new namespace: your account is already at its limit of %d reserved namespace%s, and none are currently reusable on this device. Stop one with `bore down <port>` or free one with `bore release <namespace>`.",
		limit,
		pluralSuffix(limit),
	)
}

func shouldShowUsage(err error) bool {
	if err == nil {
		return false
	}

	message := err.Error()
	return strings.HasPrefix(message, "usage:") || strings.HasPrefix(message, "unknown command:")
}

func pluralSuffix(count int) string {
	if count == 1 {
		return ""
	}

	return "s"
}
