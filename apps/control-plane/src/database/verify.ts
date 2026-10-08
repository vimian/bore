import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { closeDatabase, deleteSession, listUsers, query, readState } from "@bore/database";
import type { PersistedState } from "../types.js";

const controlOrigin = `http://127.0.0.1:${process.env.PORT ?? "8787"}`;
const webOrigin = process.env.BORE_VERIFY_WEB_ORIGIN ?? "http://web:3000";
const host = process.env.BORE_PUBLIC_DOMAIN ?? "bore.dk";
const token = randomUUID();
const get = (url: string, headers: Record<string, string> = {}) =>
  new Promise<{ status: number; json(): Promise<unknown>; text(): string }>((resolve, reject) => {
    const req = request(url, { headers, signal: AbortSignal.timeout(5000) }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.once("error", reject);
      res.once("end", () => resolve({ status: res.statusCode ?? 0,
        text: () => Buffer.concat(chunks).toString("utf8"),
        json: async () => JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown }));
    });
    req.once("error", reject);
    req.end();
  });

try {
  const users = await listUsers();
  const { value } = await readState<PersistedState>();
  const roots = Object.values(value.reservations);
  const children = Object.values(value.accessHosts);
  const health = await get(`${controlOrigin}/health`, { host });
  assert.equal(health.status, 200, "Control-plane readiness failed");
  assert.equal((await get(`${webOrigin}/api/dashboard`)).status, 401);
  assert.equal((await get(`${webOrigin}/api/usage`)).status, 401);
  assert.equal((await get(`${controlOrigin}/api/v1/usage`, { host })).status, 401);
  const user = users.find((candidate) => roots.some((root) => root.userId === candidate.id)) ?? users[0];
  if (user) {
    const now = new Date().toISOString();
    // Test an imported account without knowing its password or touching existing sessions.
    await query("INSERT INTO sessions VALUES ($1,$2,$3,$4)",
      [token, user.id, new Date(Date.now() + 600_000).toISOString(), now]);
    const api = await get(`${controlOrigin}/api/v1/namespaces`, { host, authorization: `Bearer ${token}` });
    assert.equal(api.status, 200, "Authenticated control-plane read failed");
    const namespaces = (await api.json() as { namespaces: Array<{ reservationId: string }> }).namespaces;
    const expected = roots.filter((root) => root.userId === user.id).map((root) => root.id).sort();
    assert.deepEqual(namespaces.map((item) => item.reservationId).sort(), expected);
    const web = await get(`${webOrigin}/api/dashboard`, { cookie: `bore_session=${token}` });
    assert.equal(web.status, 200, "Authenticated dashboard read failed");
    const dashboard = await web.json() as { user: { id: string; reservationLimit: number; accessHostLimit: number };
      namespaces: Array<{ reservationId: string }> };
    assert.equal(dashboard.user.id, user.id);
    assert.equal(dashboard.user.reservationLimit, user.reservationLimit);
    assert.equal(dashboard.user.accessHostLimit, user.accessHostLimit);
    assert.deepEqual(dashboard.namespaces.map((item) => item.reservationId).sort(), expected);
    for (const [origin, headers] of [
      [`${controlOrigin}/api/v1/usage`, { host, authorization: `Bearer ${token}` }],
      [`${webOrigin}/api/usage`, { cookie: `bore_session=${token}` }],
    ] as const) {
      const response = await get(origin, headers);
      assert.equal(response.status, 200, "Authenticated usage read failed");
      const usage = await response.json() as { limitsEnforced: boolean; protocolSupport: { tcpTls: boolean }; totals: { month: { httpRequests: number; tcpTlsConnections: null } } };
      assert.equal(usage.limitsEnforced, false);
      assert.equal(usage.protocolSupport.tcpTls, false);
      assert.equal(usage.totals.month.tcpTlsConnections, null);
      assert.equal(typeof usage.totals.month.httpRequests, "number");
    }
    const page = await get(`${webOrigin}/dashboard`, { cookie: `bore_session=${token}` });
    assert.equal(page.status, 200, "Authenticated dashboard rendering failed");
    assert.match(page.text(), /Volume, without limits/);
  }
  const role = (await query<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>(
    "SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0]!;
  assert.deepEqual(role, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
  console.log(JSON.stringify({ verified: true, users: users.length, namespaces: roots.length,
    childHosts: children.length, authenticatedReads: Boolean(user), privateApplicationRole: true }));
} finally {
  try { await deleteSession(token); } finally { await closeDatabase(); }
}
