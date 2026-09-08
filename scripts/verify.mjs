import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

// One deadline for the entire sequence, including startup and teardown. Leave
// one second for pnpm/Node startup so the public command fits the 120s budget.
export async function runWithinBudget(
  commands,
  { budgetMs = 119_000, graceMs = 8_000, stdio = "inherit" } = {},
) {
  const started = performance.now();
  const groups = new Set();
  let stopped = false;
  let finish;
  const result = new Promise((resolve) => {
    finish = resolve;
  });
  const captureDescendantGroups = () => {
    // Playwright creates separate browser/server process groups. Capture only
    // this command's descendants before interrupting their parents, so the hard
    // fallback can still stop them if a parent exits before graceful cleanup.
    const rows = execFileSync("ps", ["-eo", "pid=,ppid=,pgid="], {
      encoding: "utf8",
      timeout: 1_000,
    })
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/u).map(Number));
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
    for (const pid of groups) {
      try {
        process.kill(-pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  };
  const stop = () => {
    stopped = true;
    try {
      captureDescendantGroups();
    } catch (error) {
      console.error("Could not capture browser cleanup groups:", error.message);
    }
    // Playwright's runner handles SIGINT; SIGTERM bypasses its server teardown.
    signalGroups("SIGINT");
  };
  const softTimer = setTimeout(stop, Math.max(0, budgetMs - graceMs));
  const hardTimer = setTimeout(() => {
    signalGroups("SIGKILL");
    groups.clear();
    finish(124);
  }, budgetMs);
  const interrupt = () => {
    stop();
    finish(130);
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const execute = async () => {
    for (const [command, ...args] of commands) {
      if (stopped) return;
      const child = spawn(command, args, { detached: true, stdio });
      if (child.pid) groups.add(child.pid);
      const code = await new Promise((resolve) => {
        child.once("error", () => resolve(1));
        child.once("close", (exitCode) => resolve(exitCode ?? 1));
      });
      // Keep timed-out groups until the hard deadline even if parents exit.
      if (stopped) return;
      if (code !== 0) {
        finish(code);
        return;
      }
      groups.delete(child.pid);
    }
    finish(0);
  };
  void execute().catch(() => {
    stop();
    finish(1);
  });
  const code = await result;
  clearTimeout(softTimer);
  clearTimeout(hardTimer);
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  if (code !== 0) signalGroups("SIGKILL");
  return { code, durationMs: Math.round(performance.now() - started) };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = process.argv[2] ?? "all";
  // Migration and integration tests must use the same explicitly supplied test
  // database, even when the developer also has an ordinary DATABASE_URL set.
  if (["all", "test"].includes(mode) && process.env.TEST_DATABASE_URL)
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const pnpm = (...args) => ["pnpm", ...args];
  const smoke = [process.execPath, "scripts/ci-e2e-smoke.mjs"];
  const postgres = [
    // Use the same content-hashed build tasks as the later test phase. All
    // preparation stays inside this run's deadline; only identical library
    // outputs can be reused.
    pnpm(
      "exec",
      "turbo",
      "run",
      "build",
      "--filter=@moya/backend-production...",
      "--filter=@moya/catalog-importer...",
    ),
    pnpm("db:migrate"),
    pnpm("test:postgres"),
  ];
  const plans = {
    all: [
      pnpm("format:check"),
      pnpm("exec", "turbo", "run", "lint", "typecheck", "test", "build"),
      ...(process.env.TEST_DATABASE_URL ? postgres : []),
      smoke,
    ],
    lint: [pnpm("format:check"), pnpm("lint")],
    typecheck: [pnpm("typecheck")],
    test: [...(process.env.TEST_DATABASE_URL ? postgres : []), pnpm("test")],
    build: [pnpm("build")],
    e2e: [smoke],
  };
  if (!Object.hasOwn(plans, mode))
    throw new Error(`Unknown verification mode: ${mode}`);
  const result = await runWithinBudget(plans[mode]);
  console.log(
    `Acceptance ${mode}: ${result.code === 0 ? "PASS" : result.code === 124 ? "TIME BUDGET EXCEEDED" : "FAIL"} (${result.durationMs}ms / 120000ms)`,
  );
  process.exitCode = result.code;
}
