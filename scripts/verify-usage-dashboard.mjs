import assert from "node:assert/strict";
import { chromium } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { upsertUser, createSession, query, closeDatabase } from "../packages/database/src/index.js";
import { TunnelMonitoring } from "../apps/control-plane/dist/src/monitoring/recorder.js";

const origin = process.env.BORE_TEST_WEB_ORIGIN ?? "http://localhost:3307";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Use a local test web server");
assert.ok(process.env.TEST_DATABASE_URL && process.env.BORE_TEST_CHROME, "Set TEST_DATABASE_URL and BORE_TEST_CHROME");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const id = randomUUID();
const hosts = [`${id}.example.test`, `api.${id}.example.test`];
let browser;
try {
  const user = await upsertUser({ id, email: `${id}@usage-test.example`, name: "Usage Test" });
  const token = await createSession(user.id);
  const monitoring = new TunnelMonitoring("/unused", { databaseUrl: process.env.DATABASE_URL,
    resolveTarget: (host) => ({ userId: id, reservationId: id, accessHostId: host === hosts[1] ? "child" : "", namespace: "demo", host }) });
  const started = performance.now();
  for (let i = 0; i < 10000; i++) monitoring.trace(hosts[i % 2], "http").finish(200);
  const recordingMs = performance.now() - started;
  const flushStarted = performance.now();
  await monitoring.close();
  console.log(JSON.stringify({ requests: 10000, recordingMs: Math.round(recordingMs), flushMs: Math.round(performance.now() - flushStarted) }));
  browser = await chromium.launch({ executablePath: process.env.BORE_TEST_CHROME });
  for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: name === "mobile" });
    await context.addCookies([{ name: "bore_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/dashboard`);
    const panel = page.locator('[aria-labelledby="usage-title"]');
    assert.match(await panel.innerText(), /10,000/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await panel.screenshot({ path: join(tmpdir(), `bore-volume-${name}.png`) });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(JSON.stringify({ viewport: name, width, result: "usage rendered; no horizontal page overflow; 10,000 requests" }));
  }
} finally {
  await browser?.close();
  await query("DELETE FROM monitoring.requests WHERE host=ANY($1::text[])", [hosts]);
  await query("DELETE FROM monitoring.usage_counts WHERE user_id=$1", [id]);
  await query("DELETE FROM users WHERE id=$1", [id]);
  await closeDatabase();
}
