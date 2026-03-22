import { NextResponse } from "next/server";

export function GET(request: Request) {
  const origin = process.env.BORE_INSTALL_BASE_URL || new URL(request.url).origin;
  const installDir = "${BORE_INSTALL_DIR:-$HOME/.local/bin}";

  const script = `#!/usr/bin/env bash
set -euo pipefail

BASE_URL="\${BORE_INSTALL_BASE_URL:-${origin}}"
INSTALL_DIR="${installDir}"
BINARY_PATH="$INSTALL_DIR/bore"

detect_os() {
  case "$(uname -s)" in
    Linux) echo "linux" ;;
    Darwin) echo "darwin" ;;
    *) echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    arm64|aarch64) echo "arm64" ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
}

OS="$(detect_os)"
ARCH="$(detect_arch)"
ASSET="bore-$OS-$ARCH"
URL="$BASE_URL/downloads/latest/$ASSET"
TMP_FILE="$(mktemp)"

cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

mkdir -p "$INSTALL_DIR"
curl -fsSL "$URL" -o "$TMP_FILE"
chmod +x "$TMP_FILE"
mv "$TMP_FILE" "$BINARY_PATH"

echo "Installed bore to $BINARY_PATH"
"$BINARY_PATH" version || true

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo
    echo "Add $INSTALL_DIR to your PATH if it is not already present."
    ;;
esac
`;

  return new NextResponse(script, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
