import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const supportRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(supportRoot, "../../..");
const sourceWebRoot = join(repositoryRoot, "apps/web");

const typescriptCli = join(repositoryRoot, "node_modules/typescript/bin/tsc");
const uiBuild = spawnSync(
  process.execPath,
  [typescriptCli, "-p", join(repositoryRoot, "packages/ui/tsconfig.json")],
  {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  },
);

if (uiBuild.error) throw uiBuild.error;
if (uiBuild.status !== 0) {
  throw new Error(
    `Failed to build @moya/ui for Formal Web E2E (exit ${uiBuild.status ?? "unknown"}).`,
  );
}

const temporaryRepositoryRoot = mkdtempSync(
  join(tmpdir(), "moya-t02p01-formal-web-"),
);
const temporaryWebRoot = join(temporaryRepositoryRoot, "apps/web");

const excludedWebEntries = new Set([
  ".next",
  ".turbo",
  "AGENTS.md",
  "CLAUDE.md",
  "node_modules",
  "tsconfig.tsbuildinfo",
]);

const cleanup = () => {
  rmSync(temporaryRepositoryRoot, { force: true, recursive: true });
};

try {
  mkdirSync(join(temporaryRepositoryRoot, "apps"), { recursive: true });
  cpSync(
    join(repositoryRoot, "tsconfig.base.json"),
    join(temporaryRepositoryRoot, "tsconfig.base.json"),
  );
  cpSync(sourceWebRoot, temporaryWebRoot, {
    filter: (source) => {
      const pathFromWebRoot = relative(sourceWebRoot, source);
      const topLevelEntry = pathFromWebRoot.split(sep)[0] ?? "";
      return !excludedWebEntries.has(topLevelEntry);
    },
    recursive: true,
  });
  symlinkSync(
    join(repositoryRoot, "docs"),
    join(temporaryRepositoryRoot, "docs"),
    "dir",
  );
  symlinkSync(
    join(repositoryRoot, "packages"),
    join(temporaryRepositoryRoot, "packages"),
    "dir",
  );
  symlinkSync(
    join(sourceWebRoot, "node_modules"),
    join(temporaryWebRoot, "node_modules"),
    "dir",
  );
} catch (error) {
  cleanup();
  throw error;
}

const nextCli = join(sourceWebRoot, "node_modules/next/dist/bin/next");
const nextProcess = spawn(
  process.execPath,
  [nextCli, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3100"],
  {
    cwd: temporaryWebRoot,
    env: process.env,
    stdio: "inherit",
  },
);

let shuttingDown = false;

const stop = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  nextProcess.kill(signal);
};

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

nextProcess.on("error", (error) => {
  cleanup();
  throw error;
});

nextProcess.on("exit", (code) => {
  cleanup();
  process.exit(code ?? (shuttingDown ? 0 : 1));
});
