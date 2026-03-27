package agent

import (
	"encoding/base64"
	"strings"
	"testing"
	"unicode/utf16"
)

func decodePowerShellCommand(t *testing.T, encoded string) string {
	t.Helper()

	bytes, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("decode base64: %v", err)
	}
	if len(bytes)%2 != 0 {
		t.Fatalf("decoded length must be even, got %d", len(bytes))
	}

	values := make([]uint16, 0, len(bytes)/2)
	for index := 0; index < len(bytes); index += 2 {
		values = append(values, uint16(bytes[index])|uint16(bytes[index+1])<<8)
	}

	return string(utf16.Decode(values))
}

func TestWindowsAutostartCommandEncodesHiddenPowerShellLaunch(t *testing.T) {
	command := windowsAutostartCommand(`C:\Users\caspe\.local\bin\bore.exe`)
	prefix := "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand "

	if !strings.HasPrefix(command, prefix) {
		t.Fatalf("unexpected command prefix: %s", command)
	}

	encoded := strings.TrimPrefix(command, prefix)
	script := decodePowerShellCommand(t, encoded)
	expected := "& 'C:\\Users\\caspe\\.local\\bin\\bore.exe' daemon start"
	if script != expected {
		t.Fatalf("unexpected script: %q", script)
	}
}

func TestWindowsAutostartCommandEscapesSingleQuotesInPath(t *testing.T) {
	command := windowsAutostartCommand(`C:\Users\o'brian\bore.exe`)
	parts := strings.Split(command, " ")
	encoded := parts[len(parts)-1]

	script := decodePowerShellCommand(t, encoded)
	expected := "& 'C:\\Users\\o''brian\\bore.exe' daemon start"
	if script != expected {
		t.Fatalf("unexpected script: %q", script)
	}
}
