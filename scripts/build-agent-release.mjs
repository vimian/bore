import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const repoDir = process.cwd();
const agentDir = join(repoDir, "apps", "agent");
const outputDir = join(repoDir, "apps", "web", "public", "downloads", "latest");

const targets = [
  { os: "linux", arch: "amd64" },
  { os: "linux", arch: "arm64" },
  { os: "darwin", arch: "amd64" },
  { os: "darwin", arch: "arm64" },
  { os: "windows", arch: "amd64" },
];

const commit = runText("git", ["rev-parse", "HEAD"]).trim();
const shortCommit = runText("git", ["rev-parse", "--short", "HEAD"]).trim();
const buildDate = new Date().toISOString();
const version = process.env.BORE_CLIENT_VERSION || shortCommit;

mkdirSync(outputDir, { recursive: true });
for (const entry of readdirSync(outputDir)) {
  rmSync(join(outputDir, entry), { recursive: true, force: true });
}

const manifest = {
  version,
  commit,
  generatedAt: buildDate,
  assets: {},
};

const checksums = [];

for (const target of targets) {
  const targetName = `${target.os}-${target.arch}`;
  const isWindows = target.os === "windows";
  const fileName = isWindows ? `bore-${targetName}.exe` : `bore-${targetName}`;
  const filePath = join(outputDir, fileName);
  const ldflags = [
    "-s",
    "-w",
    `-X github.com/vimian/bore/apps/agent/internal/agent.Version=${version}`,
    `-X github.com/vimian/bore/apps/agent/internal/agent.Commit=${commit}`,
    `-X github.com/vimian/bore/apps/agent/internal/agent.BuildDate=${buildDate}`,
  ].join(" ");

  run("go", ["build", "-trimpath", "-ldflags", ldflags, "-o", filePath, "./cmd/bore"], {
    cwd: agentDir,
    env: {
      ...process.env,
      CGO_ENABLED: "0",
      GOOS: target.os,
      GOARCH: target.arch,
    },
  });

  const checksum = createHash("sha256").update(readFileSync(filePath)).digest("hex");
  manifest.assets[targetName] = {
    path: fileName,
    sha256: checksum,
    size: statSync(filePath).size,
  };
  checksums.push(`${checksum}  ${fileName}`);
}

writeFileSync(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(outputDir, "version.txt"), version + "\n");
writeFileSync(join(outputDir, "checksums.txt"), checksums.join("\n") + "\n");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runText(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}
