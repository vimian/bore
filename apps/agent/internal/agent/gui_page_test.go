package agent

import (
	"strings"
	"testing"
)

func TestRenderGUIPageUsesPlainNumericPortAndNamespaceSelect(t *testing.T) {
	page := renderGUIPage("csrf-token")

	if strings.Contains(page, `id="local-port" type="number"`) {
		t.Fatal("expected local port to avoid browser number stepper controls")
	}
	if !strings.Contains(page, `id="local-port" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5"`) {
		t.Fatal("expected local port to render as a plain numeric text input")
	}
	if !strings.Contains(page, `<label><span>Preferred Namespace</span><select id="namespace"></select></label>`) {
		t.Fatal("expected preferred namespace to render as a select")
	}
	if !strings.Contains(page, `"Generate a new namespace"`) {
		t.Fatal("expected namespace select to include a generate-new option")
	}
}
