import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ensureSchema,query,closeDatabase,authenticateUser,getUserBySessionToken,getUserById,setUserLimit } from "@bore/database";
import { importSqlite } from "../src/database/sqlite-import.js";
import { SQLiteStore } from "../src/store.js";
import { createUserAccount,createSession,setUserReservationLimitByEmail } from "../src/sqlite-db.js";
import { openMonitoringDb,saveRequests } from "../src/monitoring/storage.js";

async function isolatedDatabase() {
  const original = process.env.DATABASE_URL;
  const url = new URL(process.env.TEST_DATABASE_URL!);
  process.env.DATABASE_URL = url.toString();
  const name = `bore_import_${randomUUID().replaceAll("-","")}`;
  await query(`CREATE DATABASE "${name}"`);
  await closeDatabase();
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  return async () => {
    await closeDatabase();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await closeDatabase();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  };
}

async function legacyFixture() {
  const directory = mkdtempSync(join(tmpdir(),"bore-import-"));
  const appPath = join(directory,"bore.sqlite");
  const monitoringPath = join(directory,"monitoring.sqlite");
  const user = createUserAccount({email:"migration@example.com",password:"preserved-password",name:"Legacy owner"},appPath);
  setUserReservationLimitByEmail(user.email,40,appPath);
  const session = createSession(user.id,appPath);
  const store = new SQLiteStore(appPath);
  await store.init();
  const now = new Date().toISOString();
  const stats = {requestCount:2345,firstRequestAt:now,lastRequestAt:now,
    ipAddresses:{"203.0.113.1":{ipAddress:"203.0.113.1",requestCount:2345,firstSeenAt:now,lastSeenAt:now}}};
  await store.update((state) => {
    state.reservations.root = {id:"root",userId:user.id,subdomain:"migration",createdAt:now,updatedAt:now,lastUsedAt:now,directRequestStats:stats};
    state.accessHosts.child = {id:"child",userId:user.id,reservationId:"root",hostname:"api.migration",kind:"custom",createdAt:now,updatedAt:now,lastSeenAt:now,requestStats:stats};
  });
  const metrics = openMonitoringDb(monitoringPath);
  saveRequests(metrics,[{minute:Math.floor(Date.now()/60_000)*60_000,host:"migration.example.com",protocol:"http",outcome:"completed",status:200,count:12,totalMs:120,maxMs:10,
    routingMs:12,relayMs:100,bytes:2500,histogram:[12,0,0,0,0,0,0,0,0],localMs:80,localCount:12}]);
  metrics.prepare("INSERT INTO samples VALUES (?,?,?)").run(Date.now(),"control-plane",JSON.stringify({cpuPercent:0.3,heapUsed:12345}));
  metrics.prepare("INSERT INTO probes VALUES (?,?,?,?,?)").run(Date.now(),"migration.example.com",200,10,JSON.stringify({expectedConnected:true,error:""}));
  metrics.prepare("INSERT INTO device_events VALUES (?,?,?,?,?)").run(Date.now(),"device", "connected",0,3);
  metrics.close();
  return {directory,appPath,monitoringPath,user,session,stats};
}

test("SQLite import verifies every row, preserves passwords/sessions/quotas/history, and never replays over live PostgreSQL", {skip:!process.env.TEST_DATABASE_URL},async () => {
  const close = await isolatedDatabase();
  try {
    const fixture = await legacyFixture();
    await assert.rejects(importSqlite(fixture.appPath,fixture.monitoringPath),/explicit migration approval/);
    const result = await importSqlite(fixture.appPath,fixture.monitoringPath,true);
    const counts = result.counts as Record<string,number>;
    assert.equal(counts.users,1);
    assert.equal(counts.user_credentials,1);
    assert.equal(counts.sessions,1);
    assert.equal(counts.traffic_history,2);
    assert.equal(counts["monitoring.requests"],1);
    assert.equal(counts["monitoring.samples"],1);
    assert.equal(counts["monitoring.probes"],1);
    assert.equal(counts["monitoring.device_events"],1);
    assert.equal((await authenticateUser(fixture.user.email,"preserved-password"))?.id,fixture.user.id);
    assert.equal(await authenticateUser(fixture.user.email,"wrong-password"),null);
    assert.equal((await getUserBySessionToken(fixture.session))?.id,fixture.user.id);
    assert.equal((await getUserById(fixture.user.id))?.reservationLimit,40);
    const history = await query<{value:unknown}>("SELECT value FROM traffic_history WHERE kind='direct' AND id='root'");
    assert.deepEqual(history.rows[0]?.value,fixture.stats);
    const state = await query<{value:{reservations:Record<string,{userId:string;directRequestStats?:unknown}>}}>("SELECT value FROM app_state");
    assert.equal(state.rows[0]?.value.reservations.root?.userId,fixture.user.id);
    assert.equal(state.rows[0]?.value.reservations.root?.directRequestStats,undefined);
    await setUserLimit(fixture.user.email,"reservation_limit",99);
    assert.equal((await importSqlite(fixture.appPath,fixture.monitoringPath)).skipped,true);
    assert.equal((await getUserById(fixture.user.id))?.reservationLimit,99);
  } finally { await close(); }
});

test("failed import rolls back all identity/state/history writes and leaves SQLite intact", {skip:!process.env.TEST_DATABASE_URL},async () => {
  const close = await isolatedDatabase();
  try {
    const fixture = await legacyFixture();
    const db = new DatabaseSync(fixture.appPath);
    db.exec("PRAGMA foreign_keys=OFF");
    db.prepare("INSERT INTO user_credentials VALUES (?,?,?,?)").run("missing-owner","hash","salt",new Date().toISOString());
    db.close();
    await assert.rejects(importSqlite(fixture.appPath,fixture.monitoringPath,true),/foreign key constraint/);
    assert.equal((await query("SELECT * FROM users")).rows.length,0);
    assert.equal((await query("SELECT * FROM traffic_history")).rows.length,0);
    assert.equal((await query("SELECT * FROM migrations")).rows.length,0);
    const source = new DatabaseSync(fixture.appPath,{readOnly:true});
    assert.equal(source.prepare("SELECT count(*) n FROM users").get()?.n,1);
    source.close();
  } finally { await close(); }
});

test("missing sources and already-populated targets cannot silently replace production data", {skip:!process.env.TEST_DATABASE_URL},async () => {
  const close = await isolatedDatabase();
  try {
    const fixture = await legacyFixture();
    await assert.rejects(importSqlite(join(fixture.directory,"missing.sqlite"),fixture.monitoringPath,true),/database is missing/);
    await ensureSchema();
    await query("INSERT INTO users VALUES ('existing','existing@example.com','Existing',2,5,'now','now')");
    await assert.rejects(importSqlite(fixture.appPath,fixture.monitoringPath,true),/refusing to overwrite/);
    assert.equal((await getUserById("existing"))?.email,"existing@example.com");
  } finally { await close(); }
});
