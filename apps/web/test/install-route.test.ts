import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GET } from "../src/app/install.sh/route";

async function getInstallScript() {
  const response = GET(
    new Request("https://bore.dk/install.sh", {
      headers: {
        host: "bore.dk",
        "x-forwarded-proto": "https",
      },
    }),
  );

  return response.text();
}

test("generated installer is valid bash", async () => {
  const script = await getInstallScript();
  const dir = mkdtempSync(join(tmpdir(), "bore-install-route-"));
  const scriptPath = join(dir, "install.sh");

  try {
    writeFileSync(scriptPath, script);
    execFileSync("bash", ["-n", scriptPath]);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("generated installer persists unix PATH updates", async () => {
  const script = await getInstallScript();

  assert.match(script, /configure_unix_path\(\) \{/);
  assert.match(script, /Added \$install_dir to PATH in \$profile/);
  assert.match(script, /BORE_INSTALL_SKIP_PATH_UPDATE/);
  assert.match(script, /configure_unix_path "\$install_dir"/);
});
