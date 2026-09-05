import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const scopeModule = (await import(
  pathToFileURL(root + "scripts/ci-e2e-scope.mjs").href
)) as {
  classifyE2eScope: (paths: unknown, event?: string) => string;
  classifyGitDiff: (
    event: string,
    base: string,
    head: string,
    git: (...args: string[]) => unknown,
  ) => string;
};
const gateModule = (await import(
  pathToFileURL(root + "scripts/ci-e2e-gate.mjs").href
)) as {
  assertBrowserGate: (
    scope: string,
    classified: string,
    smoke: string,
    full: string,
  ) => string;
  assertSmokeReport: (
    planned: unknown,
    report: unknown,
    identity: unknown,
  ) => unknown;
};
const { classifyE2eScope: classify, classifyGitDiff } = scopeModule;
const { assertBrowserGate: gate, assertSmokeReport } = gateModule;

describe("small conservative browser selection", () => {
  it.each([
    [
      ["README.md", "docs/governance/OWNER-DEVELOPMENT-CONSTITUTION.md"],
      "none",
    ],
    [["services/catalog-importer/src/cli.ts"], "smoke"],
    [["tests/unit/backend/parser.test.ts"], "smoke"],
    [["apps/web/app/page.tsx"], "full"],
    [["packages/contracts/src/catalog.ts"], "full"],
    [["packages/ui/README.md"], "full"],
    [["docs/prototypes/mobile-preview/README.md"], "full"],
    [["docs/design-system/assets/card.svg"], "full"],
    [["pnpm-lock.yaml"], "full"],
    [[".github/workflows/ci.yml"], "full"],
    [["README.md", "services/catalog-importer/src/cli.ts"], "full"],
    [["docs/new-runtime-data.md"], "full"],
    [["unknown.ts"], "full"],
    [[], "full"],
    [["README.md", ""], "full"],
    [["../README.md"], "full"],
    [[" README.md"], "full"],
    [["docs/governance/a.md\napps/web/b.ts"], "full"],
    [null, "full"],
  ])("%j => %s for both PR and main", (paths, expected) => {
    for (const event of ["pull_request", "push"])
      expect(classify(paths, event)).toBe(expected);
  });

  it("handles NUL boundaries, renames and comparison errors without a fast fallback", () => {
    const a = "a".repeat(40),
      b = "b".repeat(40);
    const calls: string[][] = [];
    const git = (...args: string[]) => {
      calls.push(args);
      return "README.md\0";
    };
    expect(classifyGitDiff("pull_request", a, b, git)).toBe("none");
    expect(calls[0]).toEqual([
      "diff",
      "--no-renames",
      "--name-only",
      "-z",
      a + "..." + b,
      "--",
    ]);
    expect(classifyGitDiff("push", a, b, git)).toBe("none");
    expect(calls[1]).toContain(a + ".." + b);
    for (const output of [
      "",
      "README.md",
      "README.md\0apps/web/page.tsx\0",
      "README.md\0\0",
      null,
    ]) {
      expect(classifyGitDiff("push", a, b, () => output)).toBe("full");
    }
    expect(
      classifyGitDiff("push", a, b, () => {
        throw new Error("git failed");
      }),
    ).toBe("full");
    expect(classifyGitDiff("push", "0".repeat(40), b, git)).toBe("full");
    expect(classifyGitDiff("push", "--bad", b, git)).toBe("full");
    expect(classify([], "unknown")).toBe("full");
  });
});

const identity = {
  sourceHead: "a",
  checkoutSha: "b",
  tree: "c",
  runId: "1",
  runAttempt: "1",
};
const nativeReport = (list = false) => ({
  config: {
    metadata: { moyaCI: { ...identity } },
    workers: 1,
    fullyParallel: false,
    failOnFlakyTests: true,
    shard: null,
  },
  suites: [
    {
      title: "formal-web.spec.ts",
      suites: [],
      specs: [
        {
          title: "Formal root",
          file: "formal-web.spec.ts",
          tests: [
            {
              projectName: "desktop-chromium",
              expectedStatus: "passed",
              status: list ? "skipped" : "expected",
              results: list ? [] : [{ retry: 0, status: "passed", errors: [] }],
            },
          ],
        },
      ],
    },
  ],
  errors: [],
  stats: {
    expected: list ? 0 : 1,
    skipped: list ? 1 : 0,
    unexpected: 0,
    flaky: 0,
  },
});

describe("stable e2e result gate", () => {
  it("distinguishes no-browser from successfully executed browser tests", () => {
    expect(gate("none", "success", "skipped", "skipped")).toContain("NOT RUN");
    expect(gate("smoke", "success", "success", "skipped")).toContain("smoke");
    expect(gate("full", "success", "skipped", "success")).toContain("full");
  });
  it.each(["failure", "cancelled", "skipped", ""])(
    "blocks missing/failed selected execution: %s",
    (result) => {
      expect(() => gate("smoke", "success", result, "skipped")).toThrow();
      expect(() => gate("full", "success", "skipped", result)).toThrow();
      expect(() => gate("none", result, "skipped", "skipped")).toThrow();
    },
  );
  it("rejects malformed scopes and unexpected jobs", () => {
    expect(() => gate("", "success", "skipped", "skipped")).toThrow();
    expect(() => gate("none", "success", "failure", "skipped")).toThrow();
  });
  it("requires actual matching native smoke results", () => {
    expect(
      assertSmokeReport(nativeReport(true), nativeReport(), identity),
    ).toEqual({
      passed: 1,
      skipped: 0,
      total: 1,
      retries: 0,
    });
    const badReports = [
      { ...nativeReport(), suites: [] },
      { ...nativeReport(), errors: ["global failure"] },
      { ...nativeReport(), stats: { ...nativeReport().stats, flaky: 1 } },
      { ...nativeReport(), stats: { ...nativeReport().stats, expected: 2 } },
      nativeReport(true),
    ];
    for (const report of badReports)
      expect(() =>
        assertSmokeReport(nativeReport(true), report, identity),
      ).toThrow();
    for (const outcome of ["failed", "timedOut", "interrupted", "skipped"]) {
      const report = nativeReport();
      report.suites[0]!.specs[0]!.tests[0]!.results[0]!.status = outcome;
      expect(() =>
        assertSmokeReport(nativeReport(true), report, identity),
      ).toThrow();
    }
    const report = nativeReport();
    report.suites[0]!.specs[0]!.tests[0]!.projectName = "desktop-webkit";
    expect(() =>
      assertSmokeReport(nativeReport(true), report, identity),
    ).toThrow();
    expect(() =>
      assertSmokeReport(nativeReport(true), nativeReport(), {
        ...identity,
        tree: "wrong",
      }),
    ).toThrow();
    expect(() =>
      assertSmokeReport(nativeReport(true), undefined, identity),
    ).toThrow();
  });
  it("retains #92 full execution and wraps only selection", async () => {
    const workflow = await readFile(root + ".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain(
      "github.event.pull_request.number || github.run_id",
    );
    expect(workflow).toContain(
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    );
    expect(workflow).toContain("needs: [classify_e2e, e2e_smoke, e2e-shards]");
    expect(workflow).toContain("shard: [1, 2, 3]");
    expect(workflow).toContain("timeout-minutes: 30");
    expect(workflow).toContain("timeout-minutes: 22");
    for (const mode of ["prepare", "run", "merge"])
      expect(workflow).toContain("node tests/e2e/support/e2e-ci.mjs " + mode);
    expect(workflow).toContain("node scripts/ci-e2e-gate.mjs smoke");
    expect(workflow).toContain("node scripts/ci-e2e-gate.mjs gate");
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).not.toContain("continue-on-error");
    expect(workflow).not.toContain("schedule:");
  });
});
