import type { JSONReport, JSONReportTest } from "@playwright/test/reporter";

export const e2eProjects = [
  "desktop-chromium",
  "desktop-webkit",
  "mobile-webkit",
  "tablet-webkit",
  "tablet-landscape-webkit",
] as const;

export interface RunIdentity {
  sourceHead: string;
  checkoutSha: string;
  tree: string;
  runId: string;
  runAttempt: string;
}

const identityFields = [
  "sourceHead",
  "checkoutSha",
  "tree",
  "runId",
  "runAttempt",
] as const;

const requireCondition = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

export const assertRunIdentity = (identity: RunIdentity) => {
  for (const field of identityFields) {
    requireCondition(
      typeof identity[field] === "string" && identity[field].length > 0,
      `Missing identity: ${field}`,
    );
  }
};

/** Native JSON list/run/merge reports use the same semantic test/project key. */
export const reportEntries = (report: JSONReport) => {
  requireCondition(Array.isArray(report.suites), "Missing report suites");
  const entries = new Map<string, JSONReportTest>();
  const visit = (suite: JSONReport["suites"][number], parents: string[]) => {
    const titles = [...parents, suite.title];
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        const key = JSON.stringify([
          test.projectName,
          spec.file.replaceAll("\\", "/"),
          ...titles.slice(1),
          spec.title,
        ]);
        requireCondition(!entries.has(key), `Duplicate test/project: ${key}`);
        entries.set(key, test);
      }
    }
    for (const child of suite.suites ?? []) visit(child, titles);
  };
  for (const suite of report.suites) visit(suite, []);
  requireCondition(entries.size > 0, "Empty test collection");
  return entries;
};

export const assertSameSet = (
  expected: ReadonlySet<string>,
  actual: ReadonlySet<string>,
  label: string,
) => {
  requireCondition(
    expected.size === actual.size &&
      [...expected].every((key) => actual.has(key)),
    `${label}: missing or unexpected test/project combinations`,
  );
};

export const assertShardUnion = (
  full: JSONReport,
  shards: readonly JSONReport[],
) => {
  const union = new Set<string>();
  for (const report of shards) {
    for (const key of reportEntries(report).keys()) {
      requireCondition(!union.has(key), `Duplicate shard assignment: ${key}`);
      union.add(key);
    }
  }
  assertSameSet(new Set(reportEntries(full).keys()), union, "Shard union");
  return union;
};

export const assertCompleteReport = (report: JSONReport) => {
  requireCondition(
    Array.isArray(report.errors) && report.errors.length === 0,
    "Global report errors",
  );
  requireCondition(
    report.stats.unexpected === 0 && report.stats.flaky === 0,
    "Failed or flaky tests",
  );
  const entries = reportEntries(report);
  let passed = 0;
  let skipped = 0;
  let retries = 0;
  for (const [key, test] of entries) {
    requireCondition(test.results.length > 0, `Unexecuted test: ${key}`);
    const explicitSkip =
      test.expectedStatus === "skipped" && test.status === "skipped";
    requireCondition(
      explicitSkip ||
        (test.expectedStatus === "passed" && test.status === "expected"),
      `Unexpected outcome: ${key}`,
    );
    for (const [index, result] of test.results.entries()) {
      requireCondition(
        result.retry === index,
        `Incomplete retry history: ${key}`,
      );
      requireCondition(
        result.status === (explicitSkip ? "skipped" : "passed"),
        `Failed/interrupted attempt: ${key}`,
      );
      requireCondition(
        !result.error && result.errors.length === 0,
        `Attempt errors: ${key}`,
      );
      retries += result.retry > 0 ? 1 : 0;
    }
    if (explicitSkip) skipped += 1;
    else passed += 1;
  }
  requireCondition(
    passed === report.stats.expected && skipped === report.stats.skipped,
    "Report statistics do not match results",
  );
  return { passed, skipped, retries, total: entries.size };
};

export interface ShardResult {
  identity: RunIdentity;
  shard: number;
  total: number;
  completed: boolean;
  exitCode: number | null;
  full: JSONReport;
  planned: JSONReport;
  report: JSONReport;
}

export const assertAggregate = (
  jobResult: string,
  identity: RunIdentity,
  shards: readonly ShardResult[],
  merged: JSONReport,
) => {
  // This is the actual GitHub needs result, not a self-declared artifact status.
  requireCondition(
    jobResult === "success",
    `Required shard jobs: ${jobResult}`,
  );
  assertRunIdentity(identity);
  requireCondition(
    shards.length === 3 && new Set(shards.map((s) => s.shard)).size === 3,
    "Missing or duplicate shard",
  );
  const full = shards[0]!.full;
  assertSameSet(
    new Set(e2eProjects),
    new Set([...reportEntries(full).values()].map((test) => test.projectName)),
    "Collected browser projects",
  );
  for (const shard of shards) {
    requireCondition(
      [1, 2, 3].includes(shard.shard) && shard.total === 3,
      "Unexpected shard identity",
    );
    requireCondition(
      shard.completed && shard.exitCode === 0,
      "Shard did not complete successfully",
    );
    for (const field of identityFields) {
      requireCondition(
        shard.identity[field] === identity[field],
        `Mismatched ${field}`,
      );
      for (const report of [shard.full, shard.planned, shard.report]) {
        requireCondition(
          report.config.metadata.moyaCI?.[field] === identity[field],
          `Report identity mismatch: ${field}`,
        );
      }
    }
    for (const report of [shard.full, shard.planned, shard.report]) {
      assertSameSet(
        new Set(e2eProjects),
        new Set(report.config.projects.map((p) => p.name)),
        "Required browser projects",
      );
      requireCondition(
        report.config.workers === 1 && report.config.fullyParallel === false,
        "Changed worker/parallel policy",
      );
      requireCondition(
        report.config.failOnFlakyTests === true,
        "Flaky gate disabled",
      );
      requireCondition(report.errors.length === 0, "Collection/report errors");
    }
    requireCondition(
      shard.full.config.shard === null,
      "Full collection was filtered by shard",
    );
    for (const report of [shard.planned, shard.report]) {
      requireCondition(
        report.config.shard?.current === shard.shard &&
          report.config.shard.total === 3,
        "Native shard mismatch",
      );
    }
    assertSameSet(
      new Set(reportEntries(full).keys()),
      new Set(reportEntries(shard.full).keys()),
      "Full collections",
    );
    assertSameSet(
      new Set(reportEntries(shard.planned).keys()),
      new Set(reportEntries(shard.report).keys()),
      "Executed shard",
    );
    assertCompleteReport(shard.report);
  }
  const union = assertShardUnion(
    full,
    shards.map((s) => s.planned),
  );
  const mergedEntries = reportEntries(merged);
  assertSameSet(union, new Set(mergedEntries.keys()), "Merged report");
  for (const field of identityFields) {
    requireCondition(
      merged.config.metadata.moyaCI?.[field] === identity[field],
      `Merged identity mismatch: ${field}`,
    );
  }
  // Native blob merging sums workers and may repeat project declarations.
  requireCondition(
    merged.config.workers === 3 && merged.config.shard === null,
    "Unexpected merged configuration",
  );
  assertSameSet(
    new Set(e2eProjects),
    new Set(merged.config.projects.map((project) => project.name)),
    "Merged browser projects",
  );
  const outcome = (test: JSONReportTest) =>
    JSON.stringify({
      expectedStatus: test.expectedStatus,
      status: test.status,
      attempts: test.results.map(({ status, retry }) => ({ status, retry })),
    });
  for (const shard of shards) {
    for (const [key, test] of reportEntries(shard.report)) {
      requireCondition(
        outcome(test) === outcome(mergedEntries.get(key)!),
        `Merged outcome mismatch: ${key}`,
      );
    }
  }
  return assertCompleteReport(merged);
};
