import { request as httpRequest } from "node:http";

import WebSocket from "ws";

export interface ProxyRequestMessage {
  type: "proxy_request";
  requestId: string;
  localPort: number;
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  body: string;
}

export interface WebSocketConnectMessage {
  type: "websocket_connect";
  connectionId: string;
  localPort: number;
  path: string;
  headers: Record<string, string | string[]>;
  protocols: string[];
}

export interface WebSocketConnectedMessage {
  type: "websocket_connected";
  connectionId: string;
  protocol?: string;
}

export interface WebSocketConnectErrorMessage {
  type: "websocket_connect_error";
  connectionId: string;
  message: string;
}

export interface WebSocketDataMessage {
  type: "websocket_data";
  connectionId: string;
  data: string;
  isBinary: boolean;
}

export interface WebSocketCloseMessage {
  type: "websocket_close";
  connectionId: string;
  code?: number;
  reason?: string;
}

const HOP_BY_HOP_HEADERS = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const STRIPPED_WEBSOCKET_HEADERS = new Set([
  "sec-websocket-extensions",
  "sec-websocket-key",
  "sec-websocket-protocol",
  "sec-websocket-version",
]);

function readHeaderValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

export function buildLocalProxyHeaders(
  headers: Record<string, string | string[]>,
): Record<string, string> {
  const result: Record<string, string> = {};
  let originalHost: string | undefined;

  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase();

    if (normalizedKey === "x-bore-original-host") {
      const candidate = readHeaderValue(value).trim();

      if (candidate) {
        originalHost = candidate;
      }

      continue;
    }

    if (HOP_BY_HOP_HEADERS.has(normalizedKey)) {
      continue;
    }

    result[key] = readHeaderValue(value);
  }

  if (originalHost) {
    result.Host = originalHost;
  }

  return result;
}

export function buildLocalWebSocketHeaders(
  headers: Record<string, string | string[]>,
): Record<string, string> {
  const result = buildLocalProxyHeaders(headers);

  for (const key of Object.keys(result)) {
    if (STRIPPED_WEBSOCKET_HEADERS.has(key.toLowerCase())) {
      delete result[key];
    }
  }

  return result;
}

export async function connectLocalWebSocket(
  message: WebSocketConnectMessage,
): Promise<{ socket: WebSocket; protocol?: string }> {
  const target = new URL(message.path, `ws://127.0.0.1:${message.localPort}`);
  const requestedProtocols =
    message.protocols.length === 0
      ? undefined
      : message.protocols.length === 1
        ? message.protocols[0]
        : message.protocols;

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(target, requestedProtocols, {
      headers: buildLocalWebSocketHeaders(message.headers),
    });
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.off("open", handleOpen);
      socket.off("error", handleError);
      socket.off("close", handleClose);
      socket.off("unexpected-response", handleUnexpectedResponse);
      callback();
    };

    const handleOpen = () => {
      settle(() => {
        resolve({
          socket,
          protocol: socket.protocol || undefined,
        });
      });
    };

    const handleError = (error: Error) => {
      settle(() => reject(error));
    };

    const handleClose = () => {
      settle(() => reject(new Error("Local websocket closed during connect")));
    };

    const handleUnexpectedResponse = (_request: unknown, response: import("node:http").IncomingMessage) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        const detail = Buffer.concat(chunks).toString("utf8").trim();
        const statusCode = response.statusCode ?? 502;
        const suffix = detail ? `: ${detail}` : "";
        settle(() => reject(new Error(`Local websocket upgrade failed with status ${statusCode}${suffix}`)));
      });
    };

    socket.on("open", handleOpen);
    socket.on("error", handleError);
    socket.on("close", handleClose);
    socket.on("unexpected-response", handleUnexpectedResponse);
  });
}

export async function proxyLocalRequest(message: ProxyRequestMessage) {
  const body =
    message.method === "GET" || message.method === "HEAD"
      ? undefined
      : Buffer.from(message.body, "base64");

  const response = await new Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }>((resolve, reject) => {
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port: message.localPort,
        method: message.method,
        path: message.path,
        headers: buildLocalProxyHeaders(message.headers),
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const headers: Record<string, string> = {};

          for (const [key, value] of Object.entries(response.headers)) {
            if (!value || ["content-encoding", "content-length"].includes(key.toLowerCase())) {
              continue;
            }

            headers[key] = Array.isArray(value) ? value.join(", ") : value;
          }

          resolve({
            status: response.statusCode ?? 502,
            headers,
            body: Buffer.concat(chunks).toString("base64"),
          });
        });
      },
    );

    request.on("error", reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });

  return {
    type: "proxy_response" as const,
    requestId: message.requestId,
    status: response.status,
    headers: response.headers,
    body: response.body,
  };
}
