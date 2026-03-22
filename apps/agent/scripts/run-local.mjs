import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import process from "node:process";

const scriptDir = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const workspaceDir = dirname(scriptDir);
const exeSuffix = process.platform === "win32" ? ".exe" : "";
const binaryPath = join(workspaceDir, "dist", "local", `bore${exeSuffix}`);

const build = spawnSync("node", [join(scriptDir, "build-local.mjs")], {
  cwd: workspaceDir,
  stdio: "inherit",
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const child = spawnSync(binaryPath, process.argv.slice(2), {
  cwd: workspaceDir,
  stdio: "inherit",
});

process.exit(child.status ?? 0);
