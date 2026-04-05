package agent

import (
	"errors"
	"strings"
	"testing"
)

func TestDecodeResponseErrorParsesStructuredBody(t *testing.T) {
	err := decodeResponseError(409, []byte(`{
		"error": "You have reached your namespace limit of 1.",
		"code": "namespace_limit_reached",
		"details": {
			"limit": 1,
			"currentCount": 1
		}
	}`))

	var responseErr *ResponseError
	if !errors.As(err, &responseErr) {
		t.Fatalf("expected ResponseError, got %T", err)
	}

	if responseErr.Code != "namespace_limit_reached" {
		t.Fatalf("expected namespace_limit_reached code, got %q", responseErr.Code)
	}

	if limit, ok := responseErr.IntDetail("limit"); !ok || limit != 1 {
		t.Fatalf("expected limit detail 1, got %v, %v", limit, ok)
	}
}

func TestExplainNewNamespaceErrorWithoutReusableNamespaces(t *testing.T) {
	err := explainNewNamespaceError(
		&ResponseError{
			StatusCode: 409,
			Message:    "limit reached",
			Code:       "namespace_limit_reached",
			Details: map[string]any{
				"limit":        float64(2),
				"currentCount": float64(2),
			},
		},
		0,
	)

	if !strings.Contains(err.Error(), "none are currently reusable on this device") {
		t.Fatalf("expected no-reusable guidance, got %q", err.Error())
	}
}

func TestShouldShowUsageOnlyForUsageErrors(t *testing.T) {
	if !shouldShowUsage(errors.New("usage: bore up <port>")) {
		t.Fatal("expected usage error to show usage output")
	}

	if shouldShowUsage(errors.New("Namespace limit reached")) {
		t.Fatal("did not expect runtime error to show usage output")
	}
}
