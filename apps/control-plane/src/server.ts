import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createServer as createHttpsServer } from "node:https";
import type { Duplex } from "node:stream";
import { URL } from "node:url";

import { WebSocketServer, type RawData, type WebSocket } from "ws";

import { getUserBySessionToken } from "./bore-db.js";
import { loadConfig } from "./config.js";
import { getClientIp, getForwardedProto, sanitizeForwardHeaders } from "./forward-headers.js";
import { diffAddedHostnames, listDevicePublicHostnames } from "./prewarm-hosts.js";
import { SessionTokenService } from "./session-tokens.js";
import { DeviceSocketRegistry } from "./device-socket-registry.js";
import { SQLiteStore, type ControlPlaneStore } from "./store.js";
import { TraefikManager } from "./traefik-manager.js";
import { TunnelCoordinator } from "./tunnel-coordinator.js";
import type {
  ClientHelloMessage,
  DesiredTunnelInput,
  RelayMessage,
  RelayResponseMessage,
  UserRecord,
  WebSocketCloseMessage,
  WebSocketConnectedMessage,
  WebSocketConnectErrorMessage,
  WebSocketDataMessage,
} from "./types.js";
import { TlsManager } from "./tls-manager.js";

interface PendingRelay {
  deviceId: string;
  resolve: (message: RelayResponseMessage) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface PendingWebSocketConnection {
  deviceId: string;
  resolve: (message: WebSocketConnectedMessage) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface ActiveTunnelWebSocket {
  deviceId: string;
  socket: WebSocket;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function prewarmHostname(host: string): Promise<void> {
  const url = `https://${host}/`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return;
    } catch {
      clearTimeout(timeout);
      await sleep(500 * (attempt + 1));
    }
  }
}

async function prewarmHostnames(hosts: string[]): Promise<void> {
  const uniqueHosts = [...new Set(hosts)].sort();
  await Promise.all(uniqueHosts.map((host) => prewarmHostname(host).catch(() => undefined)));
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body, null, 2));
}

function redirect(response: ServerResponse, location: string): void {
  response.statusCode = 302;
  response.setHeader("location", location);
  response.end();
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

function parseWebSocketProtocols(header: string | string[] | undefined): string[] {
  const value = Array.isArray(header) ? header.join(",") : header;

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
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

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  if (socket.destroyed) {
    return;
  }

  const body = Buffer.from(message, "utf8");
  socket.write(
    [
      `HTTP/1.1 ${status} ${message}`,
      "Connection: close",
      "Content-Type: text/plain; charset=utf-8",
      `Content-Length: ${body.length}`,
      "",
      message,
    ].join("\r\n"),
  );
  socket.destroy();
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function parseBearerToken(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

function matchNamespaceAccessHostPath(pathname: string): { subdomain: string } | undefined {
  const match = pathname.match(/^\/api\/v1\/namespaces\/([^/]+)\/access-hosts$/);

  if (!match?.[1]) {
    return undefined;
  }

  return {
    subdomain: decodeURIComponent(match[1]),
  };
}

function matchNamespaceTrafficPath(pathname: string): { subdomain: string } | undefined {
  const match = pathname.match(/^\/api\/v1\/namespaces\/([^/]+)\/traffic$/);

  if (!match?.[1]) {
    return undefined;
  }

  return {
    subdomain: decodeURIComponent(match[1]),
  };
}

function matchNamespacePath(pathname: string): { subdomain: string } | undefined {
  const match = pathname.match(/^\/api\/v1\/namespaces\/([^/]+)$/);

  if (!match?.[1]) {
    return undefined;
  }

  return {
    subdomain: decodeURIComponent(match[1]),
  };
}

function redirectToHttps(
  request: IncomingMessage,
  response: ServerResponse,
  httpsPort: number,
): void {
  const host = request.headers.host?.split(":")[0];

  if (!host) {
    respondJson(response, 400, { error: "Missing host" });
    return;
  }

  const location = new URL(request.url ?? "/", `https://${host}`);

  if (httpsPort !== 443) {
    location.port = String(httpsPort);
  }

  redirect(response, location.toString());
}

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const store: ControlPlaneStore = new SQLiteStore(config.dbPath);
  await store.init();
  await store.clearDeviceConnections();

  const tokens = new SessionTokenService(config.tokenSecret);
  const coordinator = new TunnelCoordinator(store, config.publicDomain);
  const tlsManager = await TlsManager.create(config);
  const traefikManager = TraefikManager.create(config);
  const sockets = new DeviceSocketRegistry<WebSocket>();
  const pendingRelays = new Map<string, PendingRelay>();
  const pendingWebSockets = new Map<string, PendingWebSocketConnection>();
  const activeWebSockets = new Map<string, ActiveTunnelWebSocket>();
  const acceptedProtocols = new WeakMap<IncomingMessage, string>();
  const wss = new WebSocketServer({ noServer: true });
  const publicWss = new WebSocketServer({
    noServer: true,
    handleProtocols: (_protocols, request) => acceptedProtocols.get(request) || false,
  });

  const resolveUser = (request: IncomingMessage): UserRecord | undefined => {
    const token = parseBearerToken(request);

    if (!token) {
      return undefined;
    }

    const payload = tokens.verify(token);

    if (!payload) {
      return getUserBySessionToken(token, config.dbPath) ?? undefined;
    }

    return store.snapshot().users[payload.sub];
  };

  const resolveBrowserUser = async (token: string): Promise<UserRecord | undefined> => {
    return getUserBySessionToken(token, config.dbPath) ?? undefined;
  };

  await Promise.all(
    coordinator.listReservedSubdomains().map((subdomain) => tlsManager?.ensureNamespace(subdomain)),
  );
  await traefikManager?.reconcile(store.snapshot());

  const requestHandler = async (request: IncomingMessage, response: ServerResponse) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", config.serverOrigin);

    if (method === "GET" && url.pathname === "/health") {
      respondJson(response, 200, { ok: true });
      return;
    }

    if (method === "GET" && url.pathname === "/auth/cli/start") {
      const callback = url.searchParams.get("callback");
      const clientState = url.searchParams.get("state") ?? "";
      const deviceName = url.searchParams.get("device_name") ?? "Bore device";

      if (!callback) {
        respondJson(response, 400, { error: "Missing callback URL" });
        return;
      }

      const callbackUrl = new URL(callback);
      const isLoopback =
        callbackUrl.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(callbackUrl.hostname);

      if (!isLoopback) {
        respondJson(response, 400, {
          error: "Callback URL must be a loopback HTTP URL",
        });
        return;
      }

      const pending = await store.createPendingCliAuth({
        callbackUrl: callback,
        clientState,
        deviceName,
      });

      const approvalUrl = new URL("/cli-auth", config.webOrigin);
      approvalUrl.searchParams.set("request", pending.id);
      redirect(response, approvalUrl.toString());

      return;
    }

    if (method === "POST" && url.pathname === "/auth/cli/complete") {
      const requestId = url.searchParams.get("requestId");
      const browserToken = parseBearerToken(request);

      if (!requestId) {
        respondJson(response, 400, { error: "Missing request ID" });
        return;
      }

      if (!browserToken) {
        respondJson(response, 401, { error: "Missing browser auth token" });
        return;
      }

      const pending = store.snapshot().pendingCliAuth[requestId];

      if (!pending || new Date(pending.expiresAt).getTime() < Date.now()) {
        respondJson(response, 400, { error: "Login session expired" });
        return;
      }

      const user = await resolveBrowserUser(browserToken);

      if (!user) {
        respondJson(response, 401, { error: "Browser session is not authorized" });
        return;
      }

      const consumed = await store.consumePendingCliAuth(requestId);

      if (!consumed || new Date(consumed.expiresAt).getTime() < Date.now()) {
        respondJson(response, 400, { error: "Login session expired" });
        return;
      }

      const callbackUrl = new URL(consumed.callbackUrl);
      callbackUrl.searchParams.set(
        "token",
        tokens.sign({ userId: user.id, email: user.email }),
      );
      callbackUrl.searchParams.set("state", consumed.clientState);
      callbackUrl.searchParams.set("email", user.email);
      respondJson(response, 200, { redirectTo: callbackUrl.toString() });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      const user = resolveUser(request);

      if (!user) {
        respondJson(response, 401, { error: "Unauthorized" });
        return;
      }

      if (method === "GET" && url.pathname === "/api/v1/me") {
        respondJson(response, 200, {
          id: user.id,
          email: user.email,
          name: user.name,
          reservationLimit: user.reservationLimit,
          accessHostLimit: user.accessHostLimit,
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/v1/devices/register") {
        const body = await readJson<{
          deviceId: string;
          name: string;
          hostname: string;
          platform: string;
          fingerprint: string;
        }>(request);
        respondJson(response, 200, await coordinator.registerDevice(user.id, body));
        return;
      }

      if (method === "POST" && url.pathname === "/api/v1/tunnels/sync") {
        const body = await readJson<{
          deviceId: string;
          desiredTunnels: DesiredTunnelInput[];
        }>(request);
        const previousDeviceHostnames = listDevicePublicHostnames(
          store.snapshot(),
          body.deviceId,
          config.publicDomain,
        );
        const syncResponse = await coordinator.syncDeviceTunnels(
          user,
          body.deviceId,
          body.desiredTunnels,
        );
        await Promise.all(
          [...new Set(syncResponse.tunnels.map((tunnel) => tunnel.subdomain))].map((subdomain) =>
            tlsManager?.ensureNamespace(subdomain),
          ),
        );
        const currentSnapshot = store.snapshot();
        await traefikManager?.reconcile(currentSnapshot);
        const syncHostnames = diffAddedHostnames(
          previousDeviceHostnames,
          listDevicePublicHostnames(currentSnapshot, body.deviceId, config.publicDomain),
        );
        await prewarmHostnames(syncHostnames);
        const namespaces = coordinator.listUserNamespaces(user);
        respondJson(response, 200, { ...syncResponse, namespaces });
        return;
      }

      if (method === "GET" && url.pathname === "/api/v1/tunnels") {
        respondJson(response, 200, {
          tunnels: await coordinator.listUserTunnels(user.id),
        });
        return;
      }

      if (method === "GET" && url.pathname === "/api/v1/namespaces") {
        respondJson(response, 200, {
          namespaces: coordinator.listUserNamespaces(user),
        });
        return;
      }

      const namespacePath = matchNamespacePath(url.pathname);
      const accessHostPath = matchNamespaceAccessHostPath(url.pathname);
      const namespaceTrafficPath = matchNamespaceTrafficPath(url.pathname);

      if (method === "DELETE" && namespacePath) {
        const released = await coordinator.releaseNamespace(user, namespacePath.subdomain);
        await traefikManager?.reconcile(store.snapshot());
        respondJson(response, 200, {
          releasedSubdomain: released.releasedSubdomain,
          removedAccessHostnames: released.removedAccessHostnames.map(
            (hostname) => `${hostname}.${config.publicDomain}`,
          ),
        });
        return;
      }

      if (method === "DELETE" && namespaceTrafficPath) {
        const body = await readJson<{ scope: "direct" | "child"; label?: string }>(request);
        await coordinator.clearTraffic(
          user,
          namespaceTrafficPath.subdomain,
          body.scope === "direct"
            ? { kind: "direct" }
            : { kind: "child", label: body.label ?? "" },
        );
        const namespace = coordinator.listUserNamespaces(user).find(
          (item) => item.subdomain === namespaceTrafficPath.subdomain,
        );
        respondJson(response, 200, {
          namespace,
        });
        return;
      }

      if (method === "POST" && accessHostPath) {
        const body = await readJson<{ label: string }>(request);
        const accessHost = await coordinator.reserveAccessHostname(
          user,
          accessHostPath.subdomain,
          body.label,
        );
        await traefikManager?.reconcile(store.snapshot());
        await prewarmHostnames([`${accessHost.hostname}.${config.publicDomain}`]);
        const namespace = coordinator.listUserNamespaces(user).find(
          (item) => item.subdomain === accessHostPath.subdomain,
        );
        respondJson(response, 200, {
          accessHost: namespace?.accessHosts.find((item) => item.hostname === accessHost.hostname),
          namespace,
        });
        return;
      }

      if (method === "DELETE" && accessHostPath) {
        const body = await readJson<{ label: string }>(request);
        const removed = await coordinator.removeAccessHostname(
          user,
          accessHostPath.subdomain,
          body.label,
        );
        await traefikManager?.reconcile(store.snapshot());
        const namespace = coordinator.listUserNamespaces(user).find(
          (item) => item.subdomain === accessHostPath.subdomain,
        );
        respondJson(response, 200, {
          removedHostname: `${removed.hostname}.${config.publicDomain}`,
          namespace,
        });
        return;
      }

      respondJson(response, 404, { error: "Not found" });
      return;
    }

    const host = request.headers.host?.split(":")[0]?.toLowerCase();

    if (!host || (host !== config.publicDomain && !host.endsWith(`.${config.publicDomain}`))) {
      respondJson(response, 404, { error: "Unknown host" });
      return;
    }

    const clientIp = getClientIp(request);

    if (clientIp) {
      await coordinator.recordHostnameRequest(host, clientIp);
    }

    const tunnel = coordinator.findActiveTunnelByHostname(host);

    if (!tunnel || !coordinator.hasLiveConnection(tunnel.deviceId)) {
      respondJson(response, 502, { error: "Tunnel is not connected" });
      return;
    }

    const socket = sockets.get(tunnel.deviceId);

    if (!socket || socket.readyState !== socket.OPEN) {
      respondJson(response, 502, { error: "Tunnel transport is unavailable" });
      return;
    }

    const requestId = randomUUID();
    const body = await readBody(request);
    const relayPromise = new Promise<RelayResponseMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRelays.delete(requestId);
        reject(new Error("Tunnel response timed out"));
      }, 30_000);

      pendingRelays.set(requestId, {
        deviceId: tunnel.deviceId,
        resolve,
        reject,
        timeout,
      });
    });

    socket.send(
      JSON.stringify({
        type: "proxy_request",
        requestId,
        localPort: tunnel.localPort,
        method,
        path: `${url.pathname}${url.search}`,
        headers: sanitizeForwardHeaders(
          request.headers,
          host,
          tunnel.subdomain,
          getForwardedProto(request),
          clientIp,
        ),
        body: body.toString("base64"),
      }),
    );

    try {
      const relayResponse = await relayPromise;
      response.statusCode = relayResponse.status;

      for (const [key, value] of Object.entries(relayResponse.headers)) {
        response.setHeader(key, value);
      }

      response.end(Buffer.from(relayResponse.body, "base64"));
    } catch (error) {
      respondJson(response, 502, {
        error: error instanceof Error ? error.message : "Tunnel request failed",
      });
    }
  };

  const server = tlsManager
    ? createHttpsServer(tlsManager.getHttpsOptions(), requestHandler)
    : createServer(requestHandler);

  wss.on("connection", (socket, request) => {
    const url = new URL(request.url ?? "/", config.serverOrigin);
    const token = url.searchParams.get("token");
    const deviceId = url.searchParams.get("deviceId");

    if (!token || !deviceId) {
      socket.close(1008, "Missing token or device ID");
      return;
    }

    const payload = tokens.verify(token);
    const device = store.snapshot().devices[deviceId];

    if (!payload || !device || device.userId !== payload.sub) {
      socket.close(1008, "Unauthorized");
      return;
    }

    sockets.attach(deviceId, socket);
    void coordinator.setDeviceConnection(deviceId, true).catch((error) => {
      console.error("Unable to persist device connection", error);
    });

    socket.on("message", (raw) => {
      let message: RelayMessage;

      try {
        message = JSON.parse(raw.toString()) as RelayMessage;
      } catch {
        socket.close(1003, "Invalid JSON");
        return;
      }

      if ((message as ClientHelloMessage).type === "hello") {
        return;
      }

      if (message.type === "proxy_response") {
        const pendingRelay = pendingRelays.get(message.requestId);

        if (!pendingRelay) {
          return;
        }

        clearTimeout(pendingRelay.timeout);
        pendingRelays.delete(message.requestId);
        pendingRelay.resolve(message);
        return;
      }

      if (message.type === "websocket_connected") {
        const pendingWebSocket = pendingWebSockets.get(message.connectionId);

        if (!pendingWebSocket) {
          return;
        }

        clearTimeout(pendingWebSocket.timeout);
        pendingWebSockets.delete(message.connectionId);
        pendingWebSocket.resolve(message);
        return;
      }

      if (message.type === "websocket_connect_error") {
        const pendingWebSocket = pendingWebSockets.get(message.connectionId);

        if (!pendingWebSocket) {
          return;
        }

        clearTimeout(pendingWebSocket.timeout);
        pendingWebSockets.delete(message.connectionId);
        pendingWebSocket.reject(new Error(message.message));
        return;
      }

      if (message.type === "websocket_data") {
        const activeWebSocket = activeWebSockets.get(message.connectionId);

        if (!activeWebSocket || activeWebSocket.socket.readyState !== activeWebSocket.socket.OPEN) {
          return;
        }

        const decoded = Buffer.from(message.data, "base64");
        activeWebSocket.socket.send(message.isBinary ? decoded : decoded.toString("utf8"), {
          binary: message.isBinary,
        });
        return;
      }

      if (message.type === "websocket_close") {
        const activeWebSocket = activeWebSockets.get(message.connectionId);

        if (!activeWebSocket) {
          return;
        }

        activeWebSockets.delete(message.connectionId);
        closeWebSocket(activeWebSocket.socket, message.code, message.reason);
      }
    });

    socket.on("close", () => {
      if (!sockets.detach(deviceId, socket)) {
        return;
      }

      for (const [requestId, pendingRelay] of pendingRelays.entries()) {
        if (pendingRelay.deviceId !== deviceId) {
          continue;
        }

        clearTimeout(pendingRelay.timeout);
        pendingRelays.delete(requestId);
        pendingRelay.reject(new Error("Tunnel transport is unavailable"));
      }

      for (const [connectionId, pendingWebSocket] of pendingWebSockets.entries()) {
        if (pendingWebSocket.deviceId !== deviceId) {
          continue;
        }

        clearTimeout(pendingWebSocket.timeout);
        pendingWebSockets.delete(connectionId);
        pendingWebSocket.reject(new Error("Tunnel transport is unavailable"));
      }

      for (const [connectionId, activeWebSocket] of activeWebSockets.entries()) {
        if (activeWebSocket.deviceId !== deviceId) {
          continue;
        }

        activeWebSockets.delete(connectionId);
        closeWebSocket(activeWebSocket.socket, 1012, "Tunnel transport is unavailable");
      }

      void coordinator.setDeviceConnection(deviceId, false).catch((error) => {
        console.error("Unable to clear device connection", error);
      });
    });
  });

  publicWss.on("connection", (socket) => {
    socket.on("error", () => {
      socket.close();
    });
  });

  server.on("upgrade", async (request, socket, head) => {
    const url = new URL(request.url ?? "/", config.serverOrigin);

    if (url.pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (websocket) => {
        wss.emit("connection", websocket, request);
      });
      return;
    }

    const host = request.headers.host?.split(":")[0]?.toLowerCase();

    if (!host || (host !== config.publicDomain && !host.endsWith(`.${config.publicDomain}`))) {
      rejectUpgrade(socket, 404, "Unknown host");
      return;
    }

    const clientIp = getClientIp(request);

    if (clientIp) {
      await coordinator.recordHostnameRequest(host, clientIp);
    }

    const tunnel = coordinator.findActiveTunnelByHostname(host);

    if (!tunnel || !coordinator.hasLiveConnection(tunnel.deviceId)) {
      rejectUpgrade(socket, 502, "Tunnel is not connected");
      return;
    }

    const relaySocket = sockets.get(tunnel.deviceId);

    if (!relaySocket || relaySocket.readyState !== relaySocket.OPEN) {
      rejectUpgrade(socket, 502, "Tunnel transport is unavailable");
      return;
    }

    const connectionId = randomUUID();
    const protocols = parseWebSocketProtocols(request.headers["sec-websocket-protocol"]);
    const connectPromise = new Promise<WebSocketConnectedMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingWebSockets.delete(connectionId);
        reject(new Error("Local websocket connection timed out"));
      }, 10_000);

      pendingWebSockets.set(connectionId, {
        deviceId: tunnel.deviceId,
        resolve,
        reject,
        timeout,
      });
    });

    relaySocket.send(
      JSON.stringify({
        type: "websocket_connect",
        connectionId,
        localPort: tunnel.localPort,
        path: `${url.pathname}${url.search}`,
        headers: sanitizeForwardHeaders(
          request.headers,
          host,
          tunnel.subdomain,
          getForwardedProto(request),
          clientIp,
        ),
        protocols,
      }),
    );

    let connected: WebSocketConnectedMessage;

    try {
      connected = await connectPromise;
    } catch (error) {
      rejectUpgrade(
        socket,
        502,
        error instanceof Error ? error.message : "Local websocket connection failed",
      );
      return;
    }

    if (connected.protocol) {
      acceptedProtocols.set(request, connected.protocol);
    }

    try {
      publicWss.handleUpgrade(request, socket, head, (websocket) => {
        acceptedProtocols.delete(request);
        activeWebSockets.set(connectionId, {
          deviceId: tunnel.deviceId,
          socket: websocket,
        });

        websocket.on("message", (data, isBinary) => {
          relaySocket.send(
            JSON.stringify({
              type: "websocket_data",
              connectionId,
              data: encodeWebSocketData(data),
              isBinary,
            }),
          );
        });

        websocket.on("close", (code, reason) => {
          activeWebSockets.delete(connectionId);
          relaySocket.send(
            JSON.stringify({
              type: "websocket_close",
              connectionId,
              code,
              reason: reason.toString("utf8"),
            }),
          );
        });

        publicWss.emit("connection", websocket, request);
      });
    } catch (error) {
      acceptedProtocols.delete(request);
      relaySocket.send(
        JSON.stringify({
          type: "websocket_close",
          connectionId,
          code: 1011,
          reason: "Public websocket upgrade failed",
        }),
      );
      rejectUpgrade(
        socket,
        500,
        error instanceof Error ? error.message : "Unable to complete websocket upgrade",
      );
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, config.host, resolve);
  });

  if (config.httpRedirectPort !== undefined) {
    const redirectServer = createServer((request, response) => {
      redirectToHttps(request, response, config.port);
    });

    await new Promise<void>((resolve) => {
      redirectServer.listen(config.httpRedirectPort, config.host, resolve);
    });
  }

  console.log(
    `bore control plane listening on ${config.host}:${config.port} (${config.serverOrigin})`,
  );
}
