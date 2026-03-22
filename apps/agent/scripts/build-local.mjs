import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const workspaceDir = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const rootDir = dirname(workspaceDir);
const outDir = join(rootDir, "dist", "local");
const exeSuffix = process.platform === "win32" ? ".exe" : "";
const outFile = join(outDir, `bore${exeSuffix}`);

mkdirSync(outDir, { recursive: true });

const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd: rootDir,
  encoding: "utf8",
});

const commitValue = commit.status === 0 ? commit.stdout.trim() : "dev";
const buildDate = new Date().toISOString();
const ldflags = [
  "-s",
  "-w",
  `-X github.com/vimian/bore/apps/agent/internal/agent.Version=dev`,
  `-X github.com/vimian/bore/apps/agent/internal/agent.Commit=${commitValue}`,
  `-X github.com/vimian/bore/apps/agent/internal/agent.BuildDate=${buildDate}`,
].join(" ");

const result = spawnSync(
  "go",
  ["build", "-trimpath", "-ldflags", ldflags, "-o", outFile, "./cmd/bore"],
  {
    cwd: rootDir,
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
