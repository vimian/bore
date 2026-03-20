import assert from "node:assert/strict";
import test from "node:test";

import { DeviceSocketRegistry } from "../src/device-socket-registry.js";

class FakeSocket {
  closeCalls: Array<{ code?: number; data?: string }> = [];

  close(code?: number, data?: string): void {
    this.closeCalls.push({ code, data });
  }
}

test("replacing a device socket closes the older socket", () => {
  const registry = new DeviceSocketRegistry<FakeSocket>();
  const firstSocket = new FakeSocket();
  const secondSocket = new FakeSocket();

  registry.attach("device-one", firstSocket);
  registry.attach("device-one", secondSocket);

  assert.deepEqual(firstSocket.closeCalls, [
    { code: 1000, data: "Replaced by a newer connection" },
  ]);
  assert.equal(registry.get("device-one"), secondSocket);
});

test("a stale socket close does not clear the current device socket", () => {
  const registry = new DeviceSocketRegistry<FakeSocket>();
  const firstSocket = new FakeSocket();
  const secondSocket = new FakeSocket();

  registry.attach("device-one", firstSocket);
  registry.attach("device-one", secondSocket);

  assert.equal(registry.detach("device-one", firstSocket), false);
  assert.equal(registry.get("device-one"), secondSocket);
  assert.equal(registry.detach("device-one", secondSocket), true);
  assert.equal(registry.get("device-one"), undefined);
});
