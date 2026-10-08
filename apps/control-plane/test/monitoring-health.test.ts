import assert from "node:assert/strict";
import test from "node:test";
import { monitoringSampleIsFresh } from "../src/monitoring/health-check.js";

test("monitoring health accepts only recent durable samples and tolerates limited clock skew", () => {
  const now = 1_000_000;
  assert.equal(monitoringSampleIsFresh(now, now), true);
  assert.equal(monitoringSampleIsFresh(now - 180_000, now), true);
  assert.equal(monitoringSampleIsFresh(now - 180_001, now), false);
  assert.equal(monitoringSampleIsFresh(null, now), false);
  assert.equal(monitoringSampleIsFresh(NaN, now), false);
  assert.equal(monitoringSampleIsFresh(now + 60_000, now), true);
  assert.equal(monitoringSampleIsFresh(now + 60_001, now), false);
});
