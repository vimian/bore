import assert from "node:assert/strict";
import test from "node:test";

import { getControlPlaneOrigin } from "../src/lib/env";

const originalEnv = { ...process.env };
const mutableEnv = process.env as Record<string, string | undefined>;

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete mutableEnv[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    mutableEnv[key] = value;
  }
}

test.afterEach(() => {
  restoreEnv();
});

test.after(() => {
  restoreEnv();
});

test("uses the local control-plane origin by default in development", () => {
  mutableEnv.NODE_ENV = "development";
  delete mutableEnv.BORE_CONTROL_PLANE_ORIGIN;
  delete mutableEnv.BORE_SITE_ORIGIN;

  assert.equal(getControlPlaneOrigin(), "http://localhost:8787");
});

test("falls back to the public site origin when production config points at an internal host", () => {
  mutableEnv.NODE_ENV = "production";
  mutableEnv.BORE_CONTROL_PLANE_ORIGIN = "http://bore-control-plane:8787/";
  mutableEnv.BORE_SITE_ORIGIN = "https://bore.dk/";

  assert.equal(getControlPlaneOrigin(), "https://bore.dk");
});

test("keeps an explicit public control-plane origin in production", () => {
  mutableEnv.NODE_ENV = "production";
  mutableEnv.BORE_CONTROL_PLANE_ORIGIN = "https://api.bore.dk/";
  mutableEnv.BORE_SITE_ORIGIN = "https://bore.dk";

  assert.equal(getControlPlaneOrigin(), "https://api.bore.dk");
});
