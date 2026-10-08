import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const script = fileURLToPath(new URL("../../../scripts/backup-postgres.sh", import.meta.url));

function fixture(failure: string) {
  const directory = mkdtempSync(join(tmpdir(), "bore-backup-"));
  const bin = join(directory, "bin");
  const output = join(directory, "backups");
  const secret = join(directory, "password");
  mkdirSync(bin);
  writeFileSync(secret, "fixture-secret", { mode: 0o600 });
  writeFileSync(join(bin, "pg_dump"), `#!/bin/sh
for arg in "$@"; do case "$arg" in --file=*) target=\${arg#--file=} ;; esac; done
printf dump > "$target"
exit ${failure === "dump" ? 1 : 0}
`, { mode: 0o755 });
  writeFileSync(join(bin, "pg_restore"), `#!/bin/sh\nexit ${failure === "restore" ? 1 : 0}\n`, { mode: 0o755 });
  writeFileSync(join(bin, "sleep"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  writeFileSync(join(bin, "date"), "#!/bin/sh\nprintf '20261008T000000Z\\n'\n", { mode: 0o755 });
  return { output, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BORE_BACKUP_DIRECTORY: output,
    BORE_BACKUP_PASSWORD_FILE: secret }, close: () => rmSync(directory, { recursive: true, force: true }) };
}

for (const failure of ["none", "dump", "restore"]) {
  for (const mode of failure === "none" ? ["once"] : ["once", "loop"]) {
    test(`backup ${mode} publication is atomic and reports ${failure === "none" ? "success" : `${failure} failure`}`, () => {
      const files = fixture(failure);
      try {
        const result = spawnSync("sh", [script, mode], { encoding: "utf8", env: files.env });
        assert.equal(result.status, failure === "none" ? 0 : 1);
        assert.equal(result.stdout.includes("backup completed"), failure === "none");
        assert.equal(readdirSync(files.output).length, failure === "none" ? 1 : 0);
        assert.ok(!result.stdout.includes("fixture-secret"));
      } finally { files.close(); }
    });
  }
}

test("simultaneous backups in the same second publish distinct complete dumps", async () => {
  const files = fixture("none");
  try {
    await Promise.all([1, 2].map(() => promisify(execFile)("sh", [script, "once"], { env: files.env })));
    const dumps = readdirSync(files.output);
    assert.equal(dumps.length, 2);
    assert.ok(dumps.every((name) => name.endsWith(".dump")));
  } finally { files.close(); }
});
