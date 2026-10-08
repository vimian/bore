import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { hydrateUserTraffic } from "../src/lib/traffic-history";

test("dashboard supports legacy databases and hydrates only the viewer's traffic", () => {
  const db = new DatabaseSync(":memory:");
  const state = { reservations: { a: { id: "a", userId: "alice", directRequestStats: undefined as unknown },
    b: { id: "b", userId: "bob", directRequestStats: undefined as unknown } },
    accessHosts: { c: { id: "c", userId: "alice", requestStats: undefined as unknown } } };
  hydrateUserTraffic(db, state, "alice");
  db.exec("CREATE TABLE traffic_history (kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id))");
  const insert = db.prepare("INSERT INTO traffic_history VALUES (?,?,?)");
  insert.run("direct", "a", '{"requestCount":4}');
  insert.run("direct", "b", '{"requestCount":9}');
  insert.run("child", "c", '{"requestCount":2}');
  hydrateUserTraffic(db, state, "alice");
  assert.deepEqual(state.reservations.a.directRequestStats, { requestCount: 4 });
  assert.equal(state.reservations.b.directRequestStats, undefined);
  assert.deepEqual(state.accessHosts.c.requestStats, { requestCount: 2 });
  db.close();
});
