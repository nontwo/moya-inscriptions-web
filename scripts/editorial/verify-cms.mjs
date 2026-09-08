import process from "node:process";
import console from "node:console";
import { Buffer } from "node:buffer";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
} from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";

export const verificationRoot = fileURLToPath(
  new URL("../../", import.meta.url),
);
export function syntheticDatabase(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SYNTHETIC_DATABASE_REQUIRED");
  }
  // node-postgres query parameters can override host/user and load TLS files.
  // A URL-hostname check alone does not constrain the actual connection target.
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.username ||
    url.pathname.length <= 1 ||
    url.search ||
    url.hash
  )
    throw new Error("SYNTHETIC_LOOPBACK_DATABASE_REQUIRED");
  return url.toString();
}

const summaryLines = (output) =>
  stripVTControlCharacters(output)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      /^(?:Test Files|Tests)\s+(?:\d+ (?:passed|failed|skipped)(?: \| )?)+\s*\(\d+\)$/.test(
        line,
      ),
    );

/** One bounded session; only its own descendant process groups may be stopped. */
export async function createVerificationSession(
  database,
  prefix,
  budgetMs = 118000,
) {
  database = syntheticDatabase(database);
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  await mkdir(path.join(directory, "media"), { mode: 0o700 });
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith("CMS_") &&
        !key.startsWith("PG") &&
        !["DATABASE_URL", "TEST_DATABASE_URL"].includes(key),
    ),
  );
  const env = {
    ...inherited,
    CMS_DATABASE_URL: database,
    CMS_TEST_DATABASE_URL: database,
    CMS_SECRET: randomBytes(48).toString("hex"),
    CMS_ENVIRONMENT: "synthetic",
    CMS_STORAGE_MODE: "local",
    CMS_MEDIA_DIR: path.join(directory, "media"),
  };
  const started = Date.now();
  const groups = new Set();
  const processes = new Set();
  const controller = new globalThis.AbortController();
  let failure;
  let abortHard;
  const captureGroups = (timeoutMs = 1000) => {
    if (!groups.size) return;
    const rows = execFileSync("ps", ["-eo", "pid=,ppid=,pgid="], {
      encoding: "utf8",
      timeout: Math.max(1, timeoutMs),
    })
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/).map(Number));
    const descendants = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (const [pid, parent, group] of rows) {
        if (
          !descendants.has(pid) &&
          (groups.has(group) || descendants.has(parent))
        ) {
          descendants.add(pid);
          groups.add(group);
          changed = true;
        }
      }
    }
  };
  const signalGroups = (signal) => {
    for (const group of groups) {
      try {
        process.kill(-group, signal);
      } catch (error) {
        if (error.code !== "ESRCH") failure ??= "PROCESS_CLEANUP_FAILED";
      }
    }
  };
  const rememberGroups = (timeoutMs = 1000) => {
    try {
      captureGroups(timeoutMs);
    } catch {
      failure ??= "PROCESS_CLEANUP_DISCOVERY_FAILED";
    }
  };
  const stop = (category) => {
    failure ??= category;
    rememberGroups();
    controller.abort();
    signalGroups("SIGTERM");
    abortHard ??= setTimeout(() => signalGroups("SIGKILL"), 8000);
  };
  const interrupt = () => stop("INTERRUPTED");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const soft = setTimeout(
    () => stop("TIME_BUDGET_EXCEEDED"),
    Math.max(1, budgetMs - 8000),
  );
  const hard = setTimeout(() => {
    failure ??= "TIME_BUDGET_EXCEEDED";
    controller.abort();
    signalGroups("SIGKILL");
  }, budgetMs);
  const monitor = setInterval(rememberGroups, 1000);
  const assertActive = () => {
    if (Date.now() - started >= budgetMs) stop("TIME_BUDGET_EXCEEDED");
    if (failure) throw new Error(failure);
  };
  const start = (args, cwd, childEnv = env, capture = true) => {
    assertActive();
    const child = spawn(process.execPath, args, {
      cwd,
      env: childEnv,
      detached: true,
      stdio: [
        "ignore",
        capture ? "pipe" : "ignore",
        capture ? "pipe" : "ignore",
      ],
    });
    if (child.pid) groups.add(child.pid);
    const chunks = [];
    let bytes = 0;
    const collect = (chunk) => {
      bytes += chunk.length;
      if (bytes <= 4 * 1024 * 1024) chunks.push(chunk);
      else stop("OUTPUT_LIMIT_EXCEEDED");
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    const closed = new Promise((resolve) => {
      child.once("error", () => resolve(1));
      child.once("close", (code) => resolve(code ?? 1));
    });
    const managed = {
      child,
      closed,
      output: () => Buffer.concat(chunks).toString("utf8"),
    };
    processes.add(managed);
    return managed;
  };
  const run = async (args, cwd, label, childEnv = env) => {
    const managed = start(args, cwd, childEnv);
    const code = await managed.closed;
    const output = managed.output();
    const lines = summaryLines(output);
    // Child diagnostics can contain credentials, URLs or response objects.
    // Persist only fixed status/count projections; never retain raw output.
    await writeFile(
      path.join(directory, `${label}.log`),
      JSON.stringify({
        stage: label,
        exitCode: code,
        category: failure ?? (code ? "CHILD_FAILED" : "PASS"),
        summaries: lines,
      }) + "\n",
      { mode: 0o600 },
    );
    assertActive();
    if (code !== 0) throw new Error("VERIFICATION_CHILD_FAILED");
    return { output, lines };
  };
  const dispose = async () => {
    const remaining = () => Math.max(0, started + budgetMs + 1000 - Date.now());
    if (remaining()) rememberGroups(Math.min(1000, remaining()));
    controller.abort();
    signalGroups("SIGTERM");
    if (remaining()) await delay(Math.min(300, remaining()));
    signalGroups("SIGKILL");
    let closeTimer;
    await Promise.race([
      Promise.all([...processes].map((item) => item.closed)),
      new Promise((resolve) => {
        closeTimer = setTimeout(resolve, Math.min(1000, remaining()));
      }),
    ]);
    clearTimeout(closeTimer);
    clearTimeout(soft);
    clearTimeout(hard);
    clearTimeout(abortHard);
    clearInterval(monitor);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  };
  return {
    directory,
    env,
    start,
    run,
    assertActive,
    dispose,
    signal: controller.signal,
    get failure() {
      return failure;
    },
    elapsed: () => Date.now() - started,
  };
}

async function main() {
  const database = syntheticDatabase(process.env.CMS_TEST_DATABASE_URL);
  const session = await createVerificationSession(database, "moya-cms-check-");
  let operationError;
  try {
    for (const [name, cwd, args] of [
      [
        "contracts-build",
        ".",
        [
          "node_modules/typescript/bin/tsc",
          "-p",
          "packages/contracts/tsconfig.json",
        ],
      ],
      [
        "api-build",
        ".",
        ["node_modules/typescript/bin/tsc", "-p", "services/api/tsconfig.json"],
      ],
      [
        "public-read-build",
        ".",
        [
          "node_modules/typescript/bin/tsc",
          "-p",
          "services/catalog-postgres/tsconfig.json",
        ],
      ],
      [
        "image-build",
        ".",
        [
          "node_modules/typescript/bin/tsc",
          "-p",
          "packages/image/tsconfig.json",
        ],
      ],
      ["migrations", "apps/admin", ["node_modules/payload/bin.js", "migrate"]],
      [
        "integration",
        "tests",
        [
          "../node_modules/vitest/vitest.mjs",
          "run",
          "cms",
          "--no-file-parallelism",
          "--testTimeout=30000",
          "--hookTimeout=60000",
        ],
      ],
    ]) {
      const result = await session.run(
        args,
        path.join(verificationRoot, cwd),
        name,
      );
      console.log(`CMS ${name}: PASS`);
      for (const line of result.lines) console.log(line);
    }
  } catch (error) {
    operationError = error;
  } finally {
    await session.dispose();
  }
  if (session.failure) throw new Error(session.failure);
  if (operationError) throw operationError;
  console.log(
    `CMS elapsed: ${session.elapsed()}ms; safe status summaries retained privately`,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  main().catch((error) => {
    const category =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "CMS_VERIFICATION_FAILED";
    console.log(JSON.stringify({ syntheticCMS: "FAIL", category }));
    process.exitCode = category === "TIME_BUDGET_EXCEEDED" ? 124 : 1;
  });
