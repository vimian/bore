import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { closeDatabase, ensureSchema, getUserById, query, setUserLimit, transaction, upsertUser } from "@bore/database";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
if (enabled) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
before(async () => { if (enabled) await ensureSchema(); });
after(async () => { if (enabled) await closeDatabase(); });

test("PostgreSQL password-file authentication works with passwordless URLs and preserves connection query options", { skip: !enabled }, async () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalPasswordFile = process.env.BORE_POSTGRES_PASSWORD_FILE;
  const url = new URL(process.env.TEST_DATABASE_URL!);
  const schema = `password_${randomUUID().replaceAll("-", "")}`;
  const directory = mkdtempSync(join(tmpdir(), "bore-pg-password-"));
  const passwordFile = join(directory, "password");
  writeFileSync(passwordFile, `${decodeURIComponent(url.password)}\n`, { mode: 0o600 });
  await query(`CREATE SCHEMA "${schema}"`);
  await closeDatabase();
  url.password = "";
  url.searchParams.set("options", `-csearch_path=${schema}`);
  url.searchParams.set("application_name", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.BORE_POSTGRES_PASSWORD_FILE = passwordFile;
  try {
    const { rows } = await query<{ schema: string; application: string }>(
      "SELECT current_schema() AS schema,current_setting('application_name') AS application",
    );
    assert.equal(rows[0]?.schema, schema);
    assert.equal(rows[0]?.application, schema);
    await closeDatabase();
    url.searchParams.set("password", "incorrect-url-password");
    process.env.DATABASE_URL = url.toString();
    assert.equal((await query("SELECT 1 AS connected")).rows[0]?.connected, 1);
  } finally {
    await closeDatabase();
    process.env.DATABASE_URL = originalUrl;
    if (originalPasswordFile === undefined) delete process.env.BORE_POSTGRES_PASSWORD_FILE;
    else process.env.BORE_POSTGRES_PASSWORD_FILE = originalPasswordFile;
    await query(`DROP SCHEMA "${schema}"`);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("PostgreSQL upserts with missing IDs reuse normalized email identity and preserve quotas", { skip: !enabled }, async (t) => {
  const email = `${randomUUID()}@example.com`;
  t.after(async () => { await query("DELETE FROM users WHERE email=$1", [email]); });
  const existing = await upsertUser({ email, name: "Existing owner", reservationLimit: 40, accessHostLimit: 80 });
  const result = await upsertUser({ id: randomUUID(), email: ` ${email.toUpperCase()} `, name: "Renamed owner" });
  assert.equal(result.id, existing.id);
  assert.equal(result.createdAt, existing.createdAt);
  assert.equal(result.email, email);
  assert.equal(result.name, "Renamed owner");
  assert.equal(result.reservationLimit, 40);
  assert.equal(result.accessHostLimit, 80);
  assert.equal((await query("SELECT id FROM users WHERE email=$1", [email])).rows.length, 1);
});

test("PostgreSQL password-file credentials safely encode reserved URL characters", { skip: !enabled }, async () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalPasswordFile = process.env.BORE_POSTGRES_PASSWORD_FILE;
  const role = `password_${randomUUID().replaceAll("-", "")}`;
  const password = `${randomUUID()}%:@/?#[]=+`;
  const directory = mkdtempSync(join(tmpdir(), "bore-pg-password-"));
  const passwordFile = join(directory, "password");
  writeFileSync(passwordFile, `${password}\n`, { mode: 0o600 });
  const command = await query<{ command: string }>("SELECT format('CREATE ROLE %I LOGIN PASSWORD %L',$1::text,$2::text) AS command", [role, password]);
  await query(command.rows[0]!.command);
  await closeDatabase();
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.username = role;
  url.password = "";
  url.searchParams.delete("password");
  process.env.DATABASE_URL = url.toString();
  process.env.BORE_POSTGRES_PASSWORD_FILE = passwordFile;
  try {
    assert.equal((await query<{ role: string }>("SELECT current_user AS role")).rows[0]?.role, role);
  } finally {
    await closeDatabase();
    process.env.DATABASE_URL = originalUrl;
    if (originalPasswordFile === undefined) delete process.env.BORE_POSTGRES_PASSWORD_FILE;
    else process.env.BORE_POSTGRES_PASSWORD_FILE = originalPasswordFile;
    await query(`DROP ROLE "${role}"`);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("PostgreSQL concurrent same-email upserts return one identity and preserve explicit quotas", { skip: !enabled }, async (t) => {
  const email = `${randomUUID()}@example.com`;
  t.after(async () => { await query("DELETE FROM users WHERE email=$1", [email]); });
  const first = await upsertUser({ email, reservationLimit: 400, accessHostLimit: 800 });
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => upsertUser({
    ...(index % 2 ? { id: randomUUID() } : {}), email: index % 2 ? email.toUpperCase() : email, name: `Owner ${index}`,
  })));
  assert.ok(results.every((user) => user.id === first.id && user.reservationLimit === 400 && user.accessHostLimit === 800));
  const updated = await upsertUser({ id: randomUUID(), email, reservationLimit: 500 });
  assert.equal(updated.id, first.id);
  assert.equal(updated.reservationLimit, 500);
  assert.equal(updated.accessHostLimit, 800);
});

test("PostgreSQL concurrent new-email upserts serialize creation even with different requested IDs", { skip: !enabled }, async (t) => {
  const email = `${randomUUID()}@example.com`;
  t.after(async () => { await query("DELETE FROM users WHERE email=$1", [email]); });
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => upsertUser({
    ...(index % 2 ? { id: randomUUID() } : {}), email: ` ${email.toUpperCase()} `,
  })));
  assert.equal(new Set(results.map((user) => user.id)).size, 1);
  assert.equal((await query("SELECT id FROM users WHERE email=$1", [email])).rows.length, 1);
});

test("PostgreSQL row locking preserves independently updated quotas while identity upserts wait", { skip: !enabled }, async (t) => {
  const email = `${randomUUID()}@example.com`;
  t.after(async () => { await query("DELETE FROM users WHERE email=$1", [email]); });
  const user = await upsertUser({ email, reservationLimit: 20, accessHostLimit: 40 });
  let release!: () => void;
  let locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { locked = resolve; });
  const quotaUpdate = transaction(async (client) => {
    await client.query("UPDATE users SET reservation_limit=900,access_host_limit=1800 WHERE id=$1", [user.id]);
    locked();
    await gate;
  });
  await started;
  const pending = upsertUser({ id: user.id, email, name: "Fresh name" });
  release();
  await quotaUpdate;
  const result = await pending;
  assert.equal(result.reservationLimit, 900);
  assert.equal(result.accessHostLimit, 1800);
  await Promise.all([setUserLimit(email, "reservation_limit", 1000), upsertUser({ id: user.id, email })]);
  assert.equal((await getUserById(user.id))?.reservationLimit, 1000);
});
