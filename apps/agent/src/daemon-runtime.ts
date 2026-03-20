import { createServer } from "node:http";

import WebSocket, { type RawData } from "ws";

import { ApiClient } from "./api-client.js";
import {
  connectLocalWebSocket,
  proxyLocalRequest,
  type ProxyRequestMessage,
  type WebSocketCloseMessage,
  type WebSocketConnectMessage,
  type WebSocketDataMessage,
} from "./local-proxy.js";
import { loadConfig, loadRuntime, saveRuntime } from "./state.js";
import type { RuntimeState, SyncResponse } from "./types.js";

function respondJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body, null, 2));
}

function encodeWebSocketData(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(
      data.map((chunk) =>
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(new Uint8Array(chunk)),
      ),
    ).toString("base64");
  }

  return Buffer.isBuffer(data)
    ? data.toString("base64")
    : Buffer.from(new Uint8Array(data)).toString("base64");
}

function normalizeCloseCode(code: number | undefined): number | undefined {
  if (code === undefined) {
    return undefined;
  }

  if (code < 1000 || code >= 5000 || [1004, 1005, 1006, 1015].includes(code)) {
    return undefined;
  }

  return code;
}

function closeWebSocket(socket: WebSocket, code?: number, reason?: string): void {
  const normalizedCode = normalizeCloseCode(code);
  const normalizedReason = reason ? reason.slice(0, 123) : undefined;

  if (normalizedCode === undefined) {
    socket.close();
    return;
  }

  socket.close(normalizedCode, normalizedReason);
}

export async function runDaemon(): Promise<void> {
  let socket: WebSocket | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let interval: NodeJS.Timeout | undefined;
  let controlPort = 0;
  let stopping = false;
  const localWebSockets = new Map<string, WebSocket>();

  const updateRuntime = async (patch: Partial<RuntimeState>) => {
    const current = await loadRuntime();
    await saveRuntime({
      ...current,
      ...patch,
      controlPort,
      daemonPid: process.pid,
    });
  };

  const closeSocket = () => {
    for (const localSocket of localWebSockets.values()) {
      closeWebSocket(localSocket, 1012, "Tunnel relay disconnected");
    }

    localWebSockets.clear();

    if (socket) {
      socket.removeAllListeners();
      socket.close();
      socket = undefined;
    }
  };

  const connectRelay = async () => {
    const config = await loadConfig();

    if (!config.token || config.desiredTunnels.length === 0) {
      closeSocket();
      return;
    }

    const wsOrigin = config.serverOrigin.replace(/^http/, "ws");
    const url = new URL("/ws", wsOrigin);
    url.searchParams.set("token", config.token);
    url.searchParams.set("deviceId", config.deviceId);

    if (socket && socket.url === url.toString()) {
      return;
    }

    closeSocket();
    socket = new WebSocket(url);

    socket.on("open", () => {
      socket?.send(JSON.stringify({ type: "hello", deviceId: config.deviceId }));
    });

    socket.on("message", async (raw) => {
      const message = JSON.parse(raw.toString()) as
        | ProxyRequestMessage
        | WebSocketConnectMessage
        | WebSocketDataMessage
        | WebSocketCloseMessage;

      if (message.type === "proxy_request") {
        try {
          const response = await proxyLocalRequest(message);
          socket?.send(JSON.stringify(response));
        } catch (error) {
          socket?.send(
            JSON.stringify({
              type: "proxy_response",
              requestId: message.requestId,
              status: 502,
              headers: {
                "content-type": "application/json; charset=utf-8",
              },
              body: Buffer.from(
                JSON.stringify({
                  error: error instanceof Error ? error.message : "Local proxy failed",
                }),
                "utf8",
              ).toString("base64"),
            }),
          );
        }

        return;
      }

      if (message.type === "websocket_connect") {
        try {
          const { socket: localSocket, protocol } = await connectLocalWebSocket(message);
          localWebSockets.set(message.connectionId, localSocket);

          localSocket.on("message", (data, isBinary) => {
            socket?.send(
              JSON.stringify({
                type: "websocket_data",
                connectionId: message.connectionId,
                data: encodeWebSocketData(data),
                isBinary,
              }),
            );
          });

          localSocket.on("close", (code, reason) => {
            localWebSockets.delete(message.connectionId);
            socket?.send(
              JSON.stringify({
                type: "websocket_close",
                connectionId: message.connectionId,
                code,
                reason: reason.toString("utf8"),
              }),
            );
          });

          socket?.send(
            JSON.stringify({
              type: "websocket_connected",
              connectionId: message.connectionId,
              protocol,
            }),
          );
        } catch (error) {
          socket?.send(
            JSON.stringify({
              type: "websocket_connect_error",
              connectionId: message.connectionId,
              message: error instanceof Error ? error.message : "Local websocket connect failed",
            }),
          );
        }

        return;
      }

      if (message.type === "websocket_data") {
        const localSocket = localWebSockets.get(message.connectionId);

        if (!localSocket || localSocket.readyState !== WebSocket.OPEN) {
          return;
        }

        const decoded = Buffer.from(message.data, "base64");
        localSocket.send(message.isBinary ? decoded : decoded.toString("utf8"), {
          binary: message.isBinary,
        });
        return;
      }

      if (message.type === "websocket_close") {
        const localSocket = localWebSockets.get(message.connectionId);

        if (!localSocket) {
          return;
        }

        localWebSockets.delete(message.connectionId);
        closeWebSocket(localSocket, message.code, message.reason);
      }
    });

    socket.on("close", () => {
      socket = undefined;

      if (!stopping) {
        reconnectTimer = setTimeout(() => {
          void connectRelay();
        }, 2_000);
      }
    });

    socket.on("error", () => {
      socket?.close();
    });
  };

  const sync = async (): Promise<SyncResponse> => {
    const config = await loadConfig();

    if (!config.token) {
      throw new Error("Run `bore login` first");
    }

    const client = new ApiClient(config);
    await client.registerDevice();
    const result = await client.syncTunnels();

    await updateRuntime({
      lastSyncAt: new Date().toISOString(),
      lastError: undefined,
      tunnels: result.tunnels,
    });
    await connectRelay();
    return result;
  };

  const controlServer = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      respondJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && request.url === "/sync") {
      try {
        respondJson(response, 200, await sync());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to sync";
        await updateRuntime({ lastError: message });
        response.statusCode = 500;
        response.end(message);
      }

      return;
    }

    if (request.method === "POST" && request.url === "/stop") {
      stopping = true;
      clearTimeout(reconnectTimer);
      clearInterval(interval);
      closeSocket();
      await updateRuntime({ controlPort: undefined, daemonPid: undefined });
      respondJson(response, 200, { ok: true });
      controlServer.close();
      return;
    }

    response.statusCode = 404;
    response.end("Not found");
  });

  await new Promise<void>((resolve) => {
    controlServer.listen(0, "127.0.0.1", () => {
      const address = controlServer.address();

      if (!address || typeof address === "string") {
        throw new Error("Unable to bind daemon control server");
      }

      controlPort = address.port;
      resolve();
    });
  });

  await updateRuntime({ controlPort, daemonPid: process.pid });

  try {
    await sync();
  } catch (error) {
    await updateRuntime({
      lastError: error instanceof Error ? error.message : "Unable to sync",
    });
  }

  interval = setInterval(() => {
    void sync().catch(async (error) => {
      await updateRuntime({
        lastError: error instanceof Error ? error.message : "Unable to sync",
      });
    });
  }, 30_000);

  const stop = async () => {
    if (stopping) {
      return;
    }

    stopping = true;
    clearTimeout(reconnectTimer);
    clearInterval(interval);
    closeSocket();
    await updateRuntime({ controlPort: undefined, daemonPid: undefined });
    controlServer.close();
  };

  process.on("SIGINT", () => {
    void stop().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void stop().finally(() => process.exit(0));
  });
}
