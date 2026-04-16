import assert from "node:assert/strict";
import test from "node:test";

import {
  isKnownPublicHost,
  normalizeRequestHost,
  shouldHandleControlPlaneHttpRoute,
  shouldHandleControlPlaneWebSocketRoute,
} from "../src/control-plane-routing.js";

test("normalizes request hosts without ports", () => {
  assert.equal(normalizeRequestHost("bo.bore.dk:443"), "bo.bore.dk");
  assert.equal(normalizeRequestHost("BO.BORE.DK"), "bo.bore.dk");
  assert.equal(normalizeRequestHost(undefined), "");
});

test("recognizes the public domain and tunneled child hosts", () => {
  assert.equal(isKnownPublicHost("bore.dk", "bore.dk"), true);
  assert.equal(isKnownPublicHost("bo.bore.dk", "bore.dk"), true);
  assert.equal(isKnownPublicHost("l.bore.dk", "bore.dk"), true);
  assert.equal(isKnownPublicHost("bo.l.bore.dk", "bore.dk"), true);
  assert.equal(isKnownPublicHost("bo.local.bore.dk", "bore.dk"), true);
  assert.equal(isKnownPublicHost("api.bo.localhost.bore.dk", "bore.dk"), true);
  assert.equal(isKnownPublicHost("evil.example", "bore.dk"), false);
});

test("handles reserved HTTP routes only on the control-plane host", () => {
  assert.equal(shouldHandleControlPlaneHttpRoute("bore.dk", "/health", "bore.dk"), true);
  assert.equal(shouldHandleControlPlaneHttpRoute("l.bore.dk", "/health", "bore.dk"), true);
  assert.equal(shouldHandleControlPlaneHttpRoute("local.bore.dk", "/api/v1/me", "bore.dk"), true);
  assert.equal(shouldHandleControlPlaneHttpRoute("bore.dk", "/api/v1/me", "bore.dk"), true);
  assert.equal(shouldHandleControlPlaneHttpRoute("127.0.0.1:8787", "/health", "bore.dk"), true);
  assert.equal(shouldHandleControlPlaneHttpRoute("localhost:8787", "/health", "bore.dk"), true);
  assert.equal(shouldHandleControlPlaneHttpRoute("127.0.0.1:8787", "/api/v1/me", "bore.dk"), false);
  assert.equal(shouldHandleControlPlaneHttpRoute("bo.bore.dk", "/health", "bore.dk"), false);
  assert.equal(shouldHandleControlPlaneHttpRoute("bo.l.bore.dk", "/health", "bore.dk"), false);
  assert.equal(shouldHandleControlPlaneHttpRoute("bo.bore.dk", "/api/health", "bore.dk"), false);
  assert.equal(shouldHandleControlPlaneHttpRoute("api.bo.bore.dk", "/api/v1/me", "bore.dk"), false);
});

test("handles reserved websocket routes only on the control-plane host", () => {
  assert.equal(shouldHandleControlPlaneWebSocketRoute("bore.dk", "/ws", "bore.dk"), true);
  assert.equal(shouldHandleControlPlaneWebSocketRoute("localhost.bore.dk", "/ws", "bore.dk"), true);
  assert.equal(shouldHandleControlPlaneWebSocketRoute("bo.bore.dk", "/ws", "bore.dk"), false);
  assert.equal(shouldHandleControlPlaneWebSocketRoute("bo.local.bore.dk", "/ws", "bore.dk"), false);
  assert.equal(shouldHandleControlPlaneWebSocketRoute("bore.dk", "/socket", "bore.dk"), false);
});
