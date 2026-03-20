import { spawn } from "node:child_process";
import { platform } from "node:os";

export async function openBrowser(url: string): Promise<void> {
  const currentPlatform = platform();

  if (currentPlatform === "win32") {
    // Avoid `cmd /c start` here: unescaped `&` in auth callback URLs gets treated
    // as a command separator, which drops query params like `state`.
    spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }

  if (currentPlatform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

