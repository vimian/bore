import assert from "node:assert/strict";
import test from "node:test";

import {
  buildForwardedHeader,
  getClientIp,
  sanitizeForwardHeaders,
} from "../src/forward-headers.js";

test("replaces public forwarding headers with Bore-controlled values", () => {
  const forwarded = sanitizeForwardHeaders(
    {
      forwarded: 'for=198.51.100.10;proto=http;host="evil.example"',
      host: "bo.bore.dk",
      "x-custom-header": "kept",
      "x-real-ip": "198.51.100.11",
      "x-forwarded-for": "198.51.100.10, 203.0.113.5",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
    },
    "console.bo.bore.dk",
    "bo",
    "https",
    "203.0.113.44",
  );

  assert.equal(forwarded["x-custom-header"], "kept");
  assert.equal(forwarded["x-real-ip"], "203.0.113.44");
  assert.equal(forwarded["x-forwarded-for"], "203.0.113.44");
  assert.equal(forwarded["x-forwarded-host"], "console.bo.bore.dk");
  assert.equal(forwarded["x-forwarded-proto"], "https");
  assert.equal(forwarded["x-bore-original-host"], "console.bo.bore.dk");
  assert.equal(forwarded["x-bore-tunnel-root"], "bo");
  assert.equal(
    forwarded.forwarded,
    'for=203.0.113.44;host="console.bo.bore.dk";proto=https',
  );
});

test("builds a standards-style Forwarded header for IPv6 clients", () => {
  assert.equal(
    buildForwardedHeader("bo.bore.dk", "https", "2001:db8::10"),
    'for="[2001:db8::10]";host="bo.bore.dk";proto=https',
  );
});

test("prefers Traefik x-real-ip over forwarded chains for client IP", () => {
  const request = {
    headers: {
      "x-forwarded-for": "198.51.100.10, 203.0.113.20",
      "x-real-ip": "203.0.113.44",
    },
    socket: {
      remoteAddress: "172.18.0.2",
    },
  };

  assert.equal(getClientIp(request as never), "203.0.113.44");
});
