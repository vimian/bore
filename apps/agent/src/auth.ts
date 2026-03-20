import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { URL } from "node:url";

import { openBrowser } from "./browser.js";
import { saveConfig } from "./state.js";
import type { AgentConfig } from "./types.js";

export async function login(config: AgentConfig): Promise<AgentConfig> {
  const state = randomUUID();
  const callbackResult = await new Promise<{
    token: string;
    email?: string;
  }>((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (url.pathname !== "/callback") {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }

      if (url.searchParams.get("state") !== state) {
        response.statusCode = 400;
        response.end("State mismatch");
        return;
      }

      const token = url.searchParams.get("token");

      if (!token) {
        response.statusCode = 400;
        response.end("Missing token");
        return;
      }

      response.statusCode = 200;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("bore login completed. You can return to the terminal.");
      server.close();
      resolve({ token, email: url.searchParams.get("email") ?? undefined });
    });

    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Unable to create a loopback callback server"));
        return;
      }

      const callback = new URL(`http://127.0.0.1:${address.port}/callback`);
      const authUrl = new URL("/auth/cli/start", config.serverOrigin);
      authUrl.searchParams.set("callback", callback.toString());
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("device_name", config.deviceName);

      try {
        await openBrowser(authUrl.toString());
      } catch (error) {
        reject(error as Error);
      }
    });

    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for browser sign-in"));
      server.close();
    }, 2 * 60 * 1000);

    void once(server, "close").finally(() => clearTimeout(timeout));
  });

  const nextConfig: AgentConfig = {
    ...config,
    token: callbackResult.token,
    userEmail: callbackResult.email ?? config.userEmail,
  };

  await saveConfig(nextConfig);
  return nextConfig;
}
