import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  assertCompleteReport,
  assertSameSet,
  reportEntries,
} from "../tests/e2e/support/e2e-report-integrity.ts";

const requireCondition = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const assertBrowserGate = (scope, classification, smoke, full) => {
  requireCondition(
    classification === "success",
    "Classification did not succeed",
  );
  if (scope === "none") {
    requireCondition(
      smoke === "skipped" && full === "skipped",
      "Unexpected browser job",
    );
    return "No browser validation required — browser tests NOT RUN.";
  }
  requireCondition(
    scope === "smoke" || scope === "full",
    "Unknown browser scope",
  );
  requireCondition(
    (scope === "smoke" ? smoke : full) === "success",
    "Required browser job did not succeed",
  );
  requireCondition(
    (scope === "smoke" ? full : smoke) === "skipped",
    "Unexpected browser job",
  );
  return `Required ${scope} execution succeeded; its native report gate is required.`;
};

export const assertSmokeReport = (planned, report, identity) => {
  for (const input of [planned, report]) {
    requireCondition(
      input.errors.length === 0,
      "Smoke collection/report errors",
    );
    requireCondition(
      input.config.shard === null &&
        input.config.workers === 1 &&
        input.config.fullyParallel === false &&
        input.config.failOnFlakyTests === true,
      "Changed smoke execution policy",
    );
    for (const [key, value] of Object.entries(identity))
      requireCondition(
        typeof value === "string" &&
          value.length > 0 &&
          input.config.metadata.moyaCI?.[key] === value,
        `Smoke identity mismatch: ${key}`,
      );
    for (const [key, test] of reportEntries(input)) {
      const [, file] = JSON.parse(key);
      requireCondition(
        test.projectName === "desktop-chromium" &&
          file === "formal-web.spec.ts",
        "Unexpected smoke test/project",
      );
    }
  }
  assertSameSet(
    new Set(reportEntries(planned).keys()),
    new Set(reportEntries(report).keys()),
    "Smoke execution",
  );
  const summary = assertCompleteReport(report);
  requireCondition(
    summary.passed > 0 && summary.skipped === 0 && summary.retries === 0,
    "Smoke must actually pass without skips or retries",
  );
  return summary;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] === "smoke") {
    const git = (...args) =>
      execFileSync("git", args, { encoding: "utf8" }).trim();
    const identity = {
      sourceHead: process.env.MOYA_E2E_SOURCE_HEAD,
      checkoutSha: git("rev-parse", "HEAD"),
      tree: git("rev-parse", "HEAD^{tree}"),
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    };
    const read = (file) => JSON.parse(readFileSync(file, "utf8"));
    console.log(
      assertSmokeReport(read(process.argv[3]), read(process.argv[4]), identity),
    );
  } else if (process.argv[2] === "gate") {
    console.log(
      assertBrowserGate(
        process.env.SCOPE,
        process.env.CLASSIFY_RESULT,
        process.env.SMOKE_RESULT,
        process.env.FULL_RESULT,
      ),
    );
  } else throw new Error("Expected smoke or gate");
}
