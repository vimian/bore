import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DnsAutomation } from "../src/dns-automation.js";

async function withTempDir(task: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "bore-dns-"));

  try {
    await task(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

test("runs DNS automation commands with Bore DNS environment", async () => {
  await withTempDir(async (dir) => {
    const outputPath = join(dir, "dns-calls.log");
    const scriptPath = join(dir, "dns-hook.sh");
    await writeFile(
      scriptPath,
      [
        "#!/bin/sh",
        "printf '%s %s %s %s %s\\n' \"$BORE_DNS_ACTION\" \"$BORE_DNS_NAME\" \"$BORE_DNS_TYPE\" \"$BORE_DNS_VALUE\" \"$BORE_DNS_TTL\" >> \"$1\"",
        "",
      ].join("\n"),
      "utf8",
    );
    await chmod(scriptPath, 0o755);

    const dns = new DnsAutomation(`${scriptPath} ${outputPath}`);
    await dns.upsertRecord({
      name: "bo.example.com",
      type: "CNAME",
      value: "bore.example.com",
      ttl: 60,
    });
    await dns.deleteRecord({
      name: "_acme-challenge.bo.example.com",
      type: "TXT",
      value: "challenge",
      ttl: 30,
    });

    assert.equal(
      await readFile(outputPath, "utf8"),
      [
        "UPSERT bo.example.com CNAME bore.example.com 60",
        "DELETE _acme-challenge.bo.example.com TXT challenge 30",
        "",
      ].join("\n"),
    );
  });
});

test("surfaces DNS automation command failures", async () => {
  const dns = new DnsAutomation("sh -c 'echo failed >&2; exit 7'");

  await assert.rejects(
    dns.upsertRecord({
      name: "bo.example.com",
      type: "A",
      value: "192.0.2.10",
      ttl: 60,
    }),
    /DNS command exited with code 7: failed/,
  );
});
