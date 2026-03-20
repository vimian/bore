import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { WebSocketServer } from "ws";

import {
  buildLocalProxyHeaders,
  buildLocalWebSocketHeaders,
  connectLocalWebSocket,
  proxyLocalRequest,
} from "../src/local-proxy.js";

test("rewrites the local Host header from the Bore internal host field", () => {
  const headers = buildLocalProxyHeaders({
    connection: "keep-alive",
    host: "localhost:3000",
    "x-bore-original-host": "console.bo.bore.dk",
    "x-forwarded-host": "console.bo.bore.dk",
  });

  assert.equal(headers.Host, "console.bo.bore.dk");
  assert.equal(headers.host, undefined);
  assert.equal(headers["x-bore-original-host"], undefined);
  assert.equal(headers["x-forwarded-host"], "console.bo.bore.dk");
});

test("proxies over loopback while preserving the original public Host", async () => {
  const seen = await new Promise<{
    address: string | undefined;
    host: string | undefined;
  }>((resolve, reject) => {
    const server = createServer((request, response) => {
      response.statusCode = 204;
      response.end();
      server.close();
      resolve({
        address: request.socket.remoteAddress,
        host: request.headers.host,
      });
    });

    server.on("error", reject);

    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Expected a TCP server address"));
        return;
      }

      try {
        await proxyLocalRequest({
          type: "proxy_request",
          requestId: "req-1",
          localPort: address.port,
          method: "GET",
          path: "/health",
          headers: {
            "x-bore-original-host": "console.bo.bore.dk",
          },
          body: "",
        });
      } catch (error) {
        server.close();
        reject(error);
      }
    });
  });

  assert.equal(seen.host, "console.bo.bore.dk");
  assert.ok(["127.0.0.1", "::ffff:127.0.0.1"].includes(seen.address ?? ""));
});

test("removes browser websocket handshake headers before dialing loopback", () => {
  const headers = buildLocalWebSocketHeaders({
    connection: "Upgrade",
    host: "localhost:3000",
    origin: "https://console.bo.bore.dk",
    "sec-websocket-extensions": "permessage-deflate",
    "sec-websocket-key": "abc123",
    "sec-websocket-protocol": "graphql-ws",
    "sec-websocket-version": "13",
    upgrade: "websocket",
    "x-bore-original-host": "console.bo.bore.dk",
  });

  assert.equal(headers.Host, "console.bo.bore.dk");
  assert.equal(headers.origin, "https://console.bo.bore.dk");
  assert.equal(headers["sec-websocket-extensions"], undefined);
  assert.equal(headers["sec-websocket-key"], undefined);
  assert.equal(headers["sec-websocket-protocol"], undefined);
  assert.equal(headers["sec-websocket-version"], undefined);
});

test("connects a local websocket while preserving host and subprotocols", async () => {
  const seen = await new Promise<{
    host: string | undefined;
    protocol: string | undefined;
  }>((resolve, reject) => {
    const server = createServer();
    const websocketServer = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => protocols.has("next-dev") ? "next-dev" : false,
    });

    server.on("upgrade", (request, socket, head) => {
      websocketServer.handleUpgrade(request, socket, head, (websocket) => {
        resolve({
          host: request.headers.host,
          protocol: websocket.protocol || undefined,
        });
        websocket.close();
        server.close();
      });
    });

    server.on("error", reject);
    websocketServer.on("error", reject);

    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Expected a TCP server address"));
        return;
      }

      try {
        const { socket, protocol } = await connectLocalWebSocket({
          type: "websocket_connect",
          connectionId: "ws-1",
          localPort: address.port,
          path: "/_next/webpack-hmr?page=/",
          headers: {
            origin: "https://console.bo.bore.dk",
            "x-bore-original-host": "console.bo.bore.dk",
          },
          protocols: ["next-dev"],
        });

        assert.equal(protocol, "next-dev");
        socket.close();
      } catch (error) {
        server.close();
        reject(error);
      }
    });
  });

  assert.equal(seen.host, "console.bo.bore.dk");
  assert.equal(seen.protocol, "next-dev");
});
