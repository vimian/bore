import { NextResponse } from "next/server";

export function GET(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || request.headers.get("host")?.split(",")[0]?.trim();
  const origin = process.env.BORE_INSTALL_BASE_URL
    || (forwardedHost ? `${forwardedProto || "https"}://${forwardedHost}` : new URL(request.url).origin);

  const script = `#!/usr/bin/env bash
set -euo pipefail

BASE_URL="\${BORE_INSTALL_BASE_URL:-${origin}}"

detect_os() {
  case "$(uname -s)" in
    Linux) echo "linux" ;;
    Darwin) echo "darwin" ;;
    CYGWIN*|MINGW*|MSYS*) echo "windows" ;;
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

is_wsl() {
  grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null || grep -qi microsoft /proc/version 2>/dev/null
}

download_file() {
  local url="$1"
  local destination="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$destination"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$destination" "$url"
    return
  fi

  echo "curl or wget is required to install bore" >&2
  exit 1
}

to_posix_path() {
  local path="$1"

  if command -v wslpath >/dev/null 2>&1; then
    wslpath -u "$path"
    return
  fi

  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$path"
    return
  fi

  printf '%s\\n' "$path"
}

run_powershell() {
  powershell.exe -NoProfile -NonInteractive -Command - | tr -d '\\r'
}

windows_install_dir() {
  if [ -n "\${BORE_WINDOWS_INSTALL_DIR:-}" ]; then
    printf '%s\\n' "$BORE_WINDOWS_INSTALL_DIR"
    return
  fi

  if [ -n "\${BORE_INSTALL_DIR:-}" ]; then
    printf '%s\\n' "$BORE_INSTALL_DIR"
    return
  fi

  run_powershell <<'EOF'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Write-Output (Join-Path $env:USERPROFILE '.local\\bin')
EOF
}

install_unix_binary() {
  local install_dir="\${BORE_INSTALL_DIR:-$HOME/.local/bin}"
  local binary_path="$install_dir/bore"
  local asset="bore-$1-$2"
  local url="$BASE_URL/downloads/latest/$asset"
  local tmp_file

  tmp_file="$(mktemp)"

  mkdir -p "$install_dir"
  download_file "$url" "$tmp_file"
  chmod +x "$tmp_file"
  mv "$tmp_file" "$binary_path"
  rm -f "$tmp_file"

  echo "Installed bore to $binary_path"
  "$binary_path" version || true

  case ":$PATH:" in
    *":$install_dir:"*) ;;
    *)
      echo
      echo "Add $install_dir to your PATH if it is not already present."
      ;;
  esac
}

install_windows_binary() {
  local install_dir
  local install_dir_ps
  local binary_path_windows
  local binary_path_windows_ps
  local posix_install_dir
  local binary_path
  local asset="bore-windows-$1.exe"
  local url="$BASE_URL/downloads/latest/$asset"
  local ps_script_path
  local ps_script_windows_path
  local tmp_file

  if ! command -v powershell.exe >/dev/null 2>&1; then
    echo "powershell.exe is required to install the Windows bore client" >&2
    exit 1
  fi

  if [ "$1" != "amd64" ]; then
    echo "Unsupported Windows architecture: $1" >&2
    exit 1
  fi

  install_dir="$(windows_install_dir)"
  install_dir_ps="$(printf '%s' "$install_dir" | sed "s/'/''/g")"
  binary_path_windows="$install_dir\\bore.exe"
  binary_path_windows_ps="$(printf '%s' "$binary_path_windows" | sed "s/'/''/g")"
  posix_install_dir="$(to_posix_path "$install_dir")"
  binary_path="$posix_install_dir/bore.exe"
  tmp_file="$(mktemp)"

  mkdir -p "$posix_install_dir"
  download_file "$url" "$tmp_file"
  mv "$tmp_file" "$binary_path"
  rm -f "$tmp_file"

  ps_script_path="$(mktemp --suffix=.ps1)"
  {
    printf "\\\$installDir = '%s'\\n" "$install_dir_ps"
    printf "\\\$binaryPath = '%s'\\n" "$binary_path_windows_ps"
    cat <<'EOF'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$parts = @()
if ($userPath) {
  $parts = $userPath -split ';' | Where-Object { $_ }
}
if ($parts -notcontains $installDir) {
  $parts += $installDir
  [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')
  Add-Type -Namespace Bore -Name NativeMethods -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Auto)]
public static extern System.IntPtr SendMessageTimeout(
  System.IntPtr hWnd,
  int Msg,
  System.UIntPtr wParam,
  string lParam,
  int fuFlags,
  int uTimeout,
  out System.UIntPtr lpdwResult
);
'@
$broadcast = [UIntPtr]::Zero
[void][Bore.NativeMethods]::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, 'Environment', 0x0002, 5000, [ref]$broadcast)
}
& $binaryPath version
EOF
  } > "$ps_script_path"

  if command -v wslpath >/dev/null 2>&1; then
    ps_script_windows_path="$(wslpath -w "$ps_script_path")"
  elif command -v cygpath >/dev/null 2>&1; then
    ps_script_windows_path="$(cygpath -w "$ps_script_path")"
  else
    ps_script_windows_path="$ps_script_path"
  fi

  powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$ps_script_windows_path"
  rm -f "$ps_script_path"

  echo "Installed bore to $install_dir\\bore.exe"
  echo
  echo "Open a new Command Prompt or PowerShell window if bore is not yet on PATH."
}

OS="$(detect_os)"
ARCH="$(detect_arch)"

case "$OS" in
  linux)
    install_unix_binary "$OS" "$ARCH"
    if is_wsl; then
      echo
      echo "Detected WSL. Installing the Windows client as well."
      install_windows_binary "$ARCH"
    fi
    ;;
  darwin)
    install_unix_binary "$OS" "$ARCH"
    ;;
  windows)
    install_windows_binary "$ARCH"
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
