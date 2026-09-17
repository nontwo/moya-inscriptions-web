import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import console from "node:console";
import { performance } from "node:perf_hooks";
import { setTimeout, clearTimeout } from "node:timers";
import { pathToFileURL } from "node:url";
import {
  VALIDATION_PROFILES,
  REMAINING_MS_TOKEN,
  effectiveCeiling,
  takeProfileOptions,
  withRemaining,
} from "./validation-profiles.mjs";

// The public command's deadline includes pnpm/Node startup; the runner keeps
// this margin so the sequence itself fits the selected profile ceiling.
export const STARTUP_MARGIN_MS = 1_000;
// Cleanup grace reserved inside the budget between the soft stop (SIGINT) and
// the hard stop (SIGKILL). A ceiling that leaves no time beyond the margin and
// this grace cannot run anything and fails fast instead of spawning.
export const GRACE_MS = 8_000;

/** True when a public ceiling leaves time for at least one command. */
export function viableCeiling(ceilingMs, graceMs = GRACE_MS) {
  return ceilingMs - STARTUP_MARGIN_MS > graceMs;
}

// One deadline for the entire sequence, including startup and teardown. The
// default is the quick ceiling minus the startup margin; every selected
// profile passes its own ceiling explicitly. A command containing
// REMAINING_MS_TOKEN receives the time left before this runner's soft stop, so
// a nested plan can only lower its own ceiling, never renew it.
export async function runWithinBudget(
  commands,
  {
    budgetMs = VALIDATION_PROFILES.webQuick.totalMs - STARTUP_MARGIN_MS,
    graceMs = GRACE_MS,
    stdio = "inherit",
  } = {},
) {
  // A negative budget would arm timers in the past; nothing is ever renewed.
  budgetMs = Math.max(0, budgetMs);
  // No time before the soft stop means nothing can run and be stopped cleanly:
  // nothing is spawned and the ceiling is reported failed at once.
  if (budgetMs <= graceMs)
    return { code: 124, durationMs: 0, budgetMs, executed: [] };
  const started = performance.now();
  const groups = new Set();
  const executed = [];
  let stopped = false;
  let interruptionTimer;
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
    if (interruptionTimer) return;
    stop();
    // A task-owned child (for example the Apple validator) must get the same
    // bounded cleanup grace on Ctrl-C/CI cancellation as on a soft timeout.
    // Repeated signals cannot extend the original sequence deadline.
    interruptionTimer = setTimeout(
      () => finish(130),
      Math.max(0, Math.min(graceMs, budgetMs - (performance.now() - started))),
    );
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const execute = async () => {
    for (const planned of commands) {
      if (stopped) return;
      const elapsed = performance.now() - started;
      // The exact integer the child receives is the one recorded.
      const remainingMs = Math.max(1, Math.floor(budgetMs - graceMs - elapsed));
      const [command, ...args] = withRemaining(planned, remainingMs);
      const record = {
        command: [command, ...args],
        startedAtMs: Math.round(elapsed),
        remainingMs,
        durationMs: null,
        code: null,
      };
      executed.push(record);
      const child = spawn(command, args, { detached: true, stdio });
      if (child.pid) groups.add(child.pid);
      const code = await new Promise((resolve) => {
        child.once("error", () => resolve(1));
        child.once("close", (exitCode) => resolve(exitCode ?? 1));
      });
      record.durationMs = Math.round(performance.now() - started - elapsed);
      record.code = code;
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
  clearTimeout(interruptionTimer);
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  if (code !== 0) signalGroups("SIGKILL");
  return {
    code,
    durationMs: Math.round(performance.now() - started),
    budgetMs,
    executed,
  };
}

// Explicit WEB COMPLETE / BROWSER SMOKE profiles per stage. `quick` is the
// existing, already-adequate 120 s cap for an unflagged run in a prepared
// workspace (an ordinary acceptance check, not the FEEDBACK plan); `complete`
// is the explicitly selected complete profile. `all` is a serial combination
// of the complete Web checks, so its complete profile is the LOCAL FULL
// COMBINED ceiling, not one 300 s stage.
export const WEB_VERIFICATION_PROFILES = Object.freeze({
  all: Object.freeze({
    quick: VALIDATION_PROFILES.webQuick,
    complete: VALIDATION_PROFILES.localCombined,
  }),
  lint: Object.freeze({
    quick: VALIDATION_PROFILES.webQuick,
    complete: VALIDATION_PROFILES.webComplete,
  }),
  typecheck: Object.freeze({
    quick: VALIDATION_PROFILES.webQuick,
    complete: VALIDATION_PROFILES.webComplete,
  }),
  test: Object.freeze({
    quick: VALIDATION_PROFILES.webQuick,
    complete: VALIDATION_PROFILES.webComplete,
  }),
  build: Object.freeze({
    quick: VALIDATION_PROFILES.webQuick,
    complete: VALIDATION_PROFILES.webComplete,
  }),
  e2e: Object.freeze({
    quick: VALIDATION_PROFILES.browserSmokeWarm,
    complete: VALIDATION_PROFILES.browserSmokeCold,
  }),
});

/**
 * Resolve the stage's profile and effective ceiling from its flags. No flag
 * keeps the quick profile. `--profile complete` selects the explicit complete
 * profile. `--ci-milestone` is the existing complete CI test milestone and
 * still requires GitHub Actions test mode with an explicit test database.
 * `--remaining-ms <n>` is a parent's remaining time: a ceiling, never a grant.
 */
export function verificationPlan(mode, flags = [], env = {}) {
  const stage = WEB_VERIFICATION_PROFILES[mode];
  if (!stage) throw new Error(`Unknown verification mode: ${mode}`);
  const options = takeProfileOptions(flags, { quick: true, complete: true });
  let milestone = false;
  for (const flag of options.rest) {
    if (flag === "--ci-milestone" && !milestone) milestone = true;
    else throw new Error(`Unknown verification flag: ${flag}`);
  }
  if (milestone) {
    if (
      options.profile !== null ||
      mode !== "test" ||
      env.GITHUB_ACTIONS !== "true" ||
      !env.TEST_DATABASE_URL
    )
      throw new Error(
        "The CI milestone flag requires GitHub Actions test mode and an explicit test database",
      );
    options.profile = "complete";
  }
  const selected = options.profile ?? "quick";
  return {
    mode,
    selection: selected,
    milestone,
    ...effectiveCeiling(stage[selected], options.remainingMs),
  };
}

/** Effective public ceiling of one stage invocation, in milliseconds. */
export function verificationBudgetMs(mode, flags = [], env = {}) {
  return verificationPlan(mode, flags, env).ceilingMs;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = process.argv[2] ?? "all";
  const plan = verificationPlan(mode, process.argv.slice(3), process.env);
  const publicBudgetMs = plan.ceilingMs;
  // Migration and integration tests must use the same explicitly supplied test
  // database, even when the developer also has an ordinary DATABASE_URL set.
  if (["all", "test"].includes(mode) && process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.MOYA_CONTENT_SOURCE = "legacy";
    // The migration entry below must itself refuse anything but a marked
    // disposable target; see scripts/disposable-test-target.mjs.
    process.env.MOYA_EXPECT_DISPOSABLE_TARGET = "1";
  }
  const pnpm = (...args) => ["pnpm", ...args];
  const smoke = [process.execPath, "scripts/ci-e2e-smoke.mjs"];
  // The smoke child owns its BROWSER SMOKE profile (warm for quick, cold for
  // complete) under this stage's remaining time, never a fresh allowance.
  const bounded = (command) => [
    ...command,
    "--profile",
    plan.selection === "complete" ? "cold" : "warm",
    "--remaining-ms",
    REMAINING_MS_TOKEN,
  ];
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
    // Refuse an unmarked or misnamed target before any migration or DELETE.
    [process.execPath, "scripts/test-target.mjs", "check", "TEST_DATABASE_URL"],
    pnpm("db:migrate"),
    pnpm("test:postgres"),
  ];
  const plans = {
    all: [
      pnpm("format:check"),
      pnpm("exec", "turbo", "run", "lint", "typecheck", "test", "build"),
      ...(process.env.TEST_DATABASE_URL ? postgres : []),
      bounded(smoke),
    ],
    lint: [pnpm("format:check"), pnpm("lint")],
    typecheck: [pnpm("typecheck")],
    test: [...(process.env.TEST_DATABASE_URL ? postgres : []), pnpm("test")],
    build: [pnpm("build")],
    e2e: [bounded(smoke)],
  };
  if (!Object.hasOwn(plans, mode))
    throw new Error(`Unknown verification mode: ${mode}`);
  const ceiling =
    plan.ceilingSource === "parent-remaining"
      ? `${publicBudgetMs}ms ceiling from parent remaining; profile ${plan.profile} ${plan.totalMs}ms`
      : `${publicBudgetMs}ms profile ${plan.profile}`;
  if (!viableCeiling(publicBudgetMs)) {
    // A parent's remaining time that leaves nothing beyond startup and
    // cleanup grace is a failed ceiling, reported before anything is spawned.
    console.log(`Acceptance ${mode}: INSUFFICIENT_REMAINING_TIME (${ceiling})`);
    process.exitCode = 124;
  } else {
    // The quick profile is the runner's default budget; an explicitly
    // selected or parent-bounded ceiling is passed through. tests/unit/
    // architecture/ci-e2e-policy.test.ts pins the bare
    // `runWithinBudget(plans[mode])` form.
    const result =
      publicBudgetMs === VALIDATION_PROFILES.webQuick.totalMs
        ? await runWithinBudget(plans[mode])
        : await runWithinBudget(plans[mode], {
            budgetMs: publicBudgetMs - STARTUP_MARGIN_MS,
          });
    console.log(
      `Acceptance ${mode}: ${result.code === 0 ? "PASS" : result.code === 124 ? "TIME BUDGET EXCEEDED" : "FAIL"} (${result.durationMs}ms / ${ceiling})`,
    );
    process.exitCode = result.code;
  }
}
