import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { assertSmokeReport } from "./ci-e2e-gate.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
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
  "--global-timeout=90000",
];
console.log(`Daily browser smoke evidence: ${directory}`);
for (const list of [true, false]) {
  const result = spawnSync(
    "pnpm",
    [...test, ...(list ? ["--list", "--reporter=json"] : [])],
    {
      env: {
        ...env,
        ...(list
          ? { PLAYWRIGHT_JSON_OUTPUT_FILE: join(directory, "planned.json") }
          : {}),
      },
      stdio: "inherit",
    },
  );
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
const read = (name) => JSON.parse(readFileSync(join(directory, name), "utf8"));
console.log(
  assertSmokeReport(read("planned.json"), read("report.json"), identity),
);
