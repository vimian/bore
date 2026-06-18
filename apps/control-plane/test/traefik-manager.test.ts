import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { emptyState } from "../src/state-model.js";
import { TraefikManager } from "../src/traefik-manager.js";
import type { PersistedState } from "../src/types.js";

async function withTempDir(task: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "bore-traefik-"));

  try {
    await task(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function buildState(accessHost?: string): PersistedState {
  const state = emptyState();
  state.reservations["reservation-1"] = {
    id: "reservation-1",
    userId: "user-1",
    subdomain: "bo",
    createdAt: "2026-06-18T10:00:00.000Z",
    updatedAt: "2026-06-18T10:00:00.000Z",
    lastUsedAt: "2026-06-18T10:00:00.000Z",
  };

  if (accessHost) {
    state.accessHosts["access-host-1"] = {
      id: "access-host-1",
      userId: "user-1",
      reservationId: "reservation-1",
      hostname: accessHost,
      kind: "custom",
      createdAt: "2026-06-18T10:00:00.000Z",
      updatedAt: "2026-06-18T10:00:00.000Z",
      lastSeenAt: "2026-06-18T10:00:00.000Z",
    };
  }

  return state;
}

test("serializes concurrent Traefik reconciles and keeps the last requested state", async () => {
  await withTempDir(async (dir) => {
    const manager = new TraefikManager(dir, "bore-control-plane", "letsencrypt", "example.com");

    await Promise.all([
      manager.reconcile(buildState()),
      manager.reconcile(buildState("api.bo")),
    ]);

    const contents = await readFile(join(dir, "managed-bo.yml"), "utf8");
    assert.match(contents, /Host\(`bo\.example\.com`\)/);
    assert.match(contents, /Host\(`api\.bo\.example\.com`\)/);
    assert.deepEqual(
      (await readdir(dir)).filter((entry) => entry.includes(".tmp")),
      [],
    );
  });
});

test("removes stale managed Traefik config files", async () => {
  await withTempDir(async (dir) => {
    const manager = new TraefikManager(dir, "bore-control-plane", "letsencrypt", "example.com");
    const state = buildState();

    await manager.reconcile(state);
    delete state.reservations["reservation-1"];
    await manager.reconcile(state);

    assert.deepEqual(await readdir(dir), []);
  });
});
