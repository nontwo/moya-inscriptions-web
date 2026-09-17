import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { assertSmokeReport } from "./ci-e2e-gate.mjs";
import {
  VALIDATION_PROFILES,
  effectiveCeiling,
  takeProfileOptions,
} from "./validation-profiles.mjs";

// BROWSER SMOKE profiles. `warm` is the prepared feedback path (dependencies
// and Chromium installed, fixtures built); `cold` is the complete smoke
// including fixture server startup, the checks and cleanup. `reserveMs` is
// kept out of Playwright's global timeout for the planned-list step, report
// assertion and process cleanup; `webServerMs` caps fixture startup so the
// server timeout can never outlive the run it serves.
export const SMOKE_PROFILES = Object.freeze({
  warm: Object.freeze({
    ...VALIDATION_PROFILES.browserSmokeWarm,
    reserveMs: 10_000,
    webServerMs: 60_000,
    minimumMs: 30_000,
  }),
  cold: Object.freeze({
    ...VALIDATION_PROFILES.browserSmokeCold,
    reserveMs: 20_000,
    webServerMs: 120_000,
    minimumMs: 60_000,
  }),
});

// Time the Formal Web fixture must keep after startup for the actual checks.
const CHECK_FLOOR_MS = 20_000;

export function smokeOptions(argv) {
  const options = takeProfileOptions(argv, SMOKE_PROFILES);
  if (options.rest.length) throw new Error("INVALID_SMOKE_ARGUMENTS");
  return {
    profile: options.profile ?? "warm",
    remainingMs: options.remainingMs,
  };
}

/**
 * One deadline for list, run, report assertion and cleanup. Playwright's
 * global timeout and the fixture webServer timeout are derived from the time
 * left when the run starts, so they always fit inside this ceiling and inside
 * a parent's remaining time.
 */
export function smokeBudget(profileName, remainingMs = null, elapsedMs = 0) {
  const profile = SMOKE_PROFILES[profileName];
  const ceiling = effectiveCeiling(profile, remainingMs);
  const globalTimeoutMs = Math.max(
    0,
    ceiling.ceilingMs - profile.reserveMs - elapsedMs,
  );
  return {
    ...ceiling,
    reserveMs: profile.reserveMs,
    minimumMs: profile.minimumMs,
    viable: ceiling.ceilingMs >= profile.minimumMs,
    globalTimeoutMs,
    webServerTimeoutMs: Math.max(
      1,
      Math.min(profile.webServerMs, globalTimeoutMs - CHECK_FLOOR_MS),
    ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const started = Date.now();
  const options = smokeOptions(process.argv.slice(2));
  const budget = smokeBudget(options.profile, options.remainingMs);
  const describe = () =>
    `profile ${budget.profile} ${budget.totalMs}ms, ceiling ${budget.ceilingMs}ms (${budget.ceilingSource})`;
  if (!budget.viable) {
    console.log(
      `Browser smoke INSUFFICIENT_REMAINING_TIME: ${describe()}, minimum ${budget.minimumMs}ms`,
    );
    process.exit(124);
  }
  const deadline = started + budget.ceilingMs;
  const git = (...args) =>
    execFileSync("git", args, {
      encoding: "utf8",
      timeout: Math.max(1, deadline - Date.now()),
    }).trim();
  const root = resolve(".local/e2e-ci");
  mkdirSync(root, { recursive: true });
  const directory =
    process.env.MOYA_E2E_ARTIFACT_DIR ?? mkdtempSync(join(root, "smoke-"));
  mkdirSync(directory, { recursive: true });
  const identity = {
    sourceHead: process.env.MOYA_E2E_SOURCE_HEAD ?? git("rev-parse", "HEAD"),
    checkoutSha: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    runId: process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "1",
  };
  const env = {
    ...process.env,
    CI: "true",
    MOYA_E2E_ARTIFACT_DIR: directory,
    MOYA_E2E_SOURCE_HEAD: identity.sourceHead,
    MOYA_E2E_CHECKOUT_SHA: identity.checkoutSha,
    MOYA_E2E_CHECKOUT_TREE: identity.tree,
    GITHUB_RUN_ID: identity.runId,
    GITHUB_RUN_ATTEMPT: identity.runAttempt,
  };
  const test = [
    "--filter",
    "@moya/tests",
    "exec",
    "playwright",
    "test",
    "--config",
    "e2e/playwright.config.ts",
    "formal-web.spec.ts",
    "--project=desktop-chromium",
    "--workers=1",
    "--retries=0",
    "--max-failures=1",
  ];
  console.log(`Browser smoke evidence: ${directory}; ${describe()}`);
  for (const list of [true, false]) {
    // Derive the run's Playwright global timeout and fixture startup timeout
    // from the time actually left; the planned-list step already consumed
    // part of the ceiling.
    const current = smokeBudget(
      options.profile,
      options.remainingMs,
      Date.now() - started,
    );
    if (current.globalTimeoutMs <= 0) {
      console.log(
        `Browser smoke TIME BUDGET EXCEEDED before ${list ? "list" : "run"}`,
      );
      process.exit(124);
    }
    if (!list)
      console.log(
        `Browser smoke run: global timeout ${current.globalTimeoutMs}ms, fixture startup timeout ${current.webServerTimeoutMs}ms`,
      );
    const result = spawnSync(
      "pnpm",
      [
        ...test,
        `--global-timeout=${current.globalTimeoutMs}`,
        ...(list ? ["--list", "--reporter=json"] : []),
      ],
      {
        env: {
          ...env,
          MOYA_E2E_WEBSERVER_TIMEOUT_MS: String(current.webServerTimeoutMs),
          ...(list
            ? { PLAYWRIGHT_JSON_OUTPUT_FILE: join(directory, "planned.json") }
            : {}),
        },
        stdio: "inherit",
        timeout: Math.max(1, deadline - Date.now()),
        killSignal: "SIGKILL",
      },
    );
    if (result.error?.code === "ETIMEDOUT") {
      console.log(`Browser smoke TIME BUDGET EXCEEDED (${describe()})`);
      process.exit(124);
    }
    if (result.error || result.status !== 0) process.exit(result.status || 1);
  }
  const read = (name) =>
    JSON.parse(readFileSync(join(directory, name), "utf8"));
  console.log(
    assertSmokeReport(read("planned.json"), read("report.json"), identity),
  );
  console.log(
    `Browser smoke elapsed ${Date.now() - started}ms of ${budget.ceilingMs}ms (${budget.profile})`,
  );
}
