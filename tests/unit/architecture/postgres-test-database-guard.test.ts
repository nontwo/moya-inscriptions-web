import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";

import { describe, expect, it } from "vitest";

import {
  assertSyntheticTestDatabaseUrl,
  isSyntheticTestDatabaseName,
  requireSyntheticTestDatabaseUrl,
  SYNTHETIC_TEST_DATABASE_NAME,
} from "../../integration/postgres/synthetic-test-database.js";
import { repositoryRoot } from "./workspace-scanner.js";

const url = (database: string, query = ""): string =>
  `postgresql://synthetic_role@127.0.0.1:54329/${database}${query}`;
const suiteDirectory = path.join(repositoryRoot, "tests/integration/postgres");

describe("PostgreSQL synthetic test database guard", () => {
  it("accepts the canonical database and names with a whole test or synthetic segment", () => {
    for (const name of [
      SYNTHETIC_TEST_DATABASE_NAME,
      "moya_test",
      "MOYA_TEST",
      "test",
      "synthetic",
      "test_moya",
      "moya_synthetic",
      "p204_cms_synthetic_test",
    ]) {
      expect(isSyntheticTestDatabaseName(name), name).toBe(true);
      expect(assertSyntheticTestDatabaseUrl(url(name)), name).toBe(name);
    }
  });

  it("refuses yoyi_dev by name and every name without such a segment", () => {
    for (const name of [
      "yoyi_dev",
      "YOYI_DEV",
      "yoyi",
      "moya",
      "production",
      "cms_qa",
      "testing",
      "moya_tests",
      "contest",
      "synthetics",
      "moya-test",
      "pilot_ops_1_abcdef123456",
    ]) {
      expect(isSyntheticTestDatabaseName(name), name).toBe(false);
      expect(() => assertSyntheticTestDatabaseUrl(url(name)), name).toThrow(
        `TEST_DATABASE_URL points at`,
      );
    }
  });

  it("judges the database name alone, not markers in the role or query", () => {
    expect(() =>
      assertSyntheticTestDatabaseUrl(
        "postgresql://synthetic_test_role@127.0.0.1:54330/yoyi_dev?options=-c%20search_path%3Dtest",
      ),
    ).toThrow('points at "yoyi_dev", the live local Development database');
    expect(
      assertSyntheticTestDatabaseUrl(
        url("moya_test", "?options=-c%20search_path%3Dp203_search_v1"),
      ),
    ).toBe("moya_test");
  });

  it("names the variable, the offending database and the remedy", () => {
    expect(() => assertSyntheticTestDatabaseUrl(url("yoyi_dev"))).toThrow(
      'TEST_DATABASE_URL points at "yoyi_dev", the live local Development database, which is refused by name. The PostgreSQL suites DELETE and TRUNCATE rows in their target. Point TEST_DATABASE_URL at a disposable synthetic database such as "moya_synthetic_test" (see infra/env/test.env.example) or one whose name carries a whole "test" or "synthetic" segment, for example "moya_test".',
    );
    expect(() =>
      assertSyntheticTestDatabaseUrl(url("cms_qa"), "CMS_TEST_DATABASE_URL"),
    ).toThrow(
      'CMS_TEST_DATABASE_URL points at database "cms_qa", whose name carries no whole "test" or "synthetic" segment. The PostgreSQL suites DELETE and TRUNCATE rows in their target. Point CMS_TEST_DATABASE_URL at a disposable synthetic database such as "moya_synthetic_test" (see infra/env/test.env.example) or one whose name carries a whole "test" or "synthetic" segment, for example "moya_test".',
    );
  });

  it("reads the database the way node-postgres does and refuses URLs naming none", () => {
    expect(assertSyntheticTestDatabaseUrl(url("moya%5Ftest"))).toBe(
      "moya_test",
    );
    for (const value of [
      "postgresql://synthetic_role@127.0.0.1:54329",
      "postgresql://synthetic_role@127.0.0.1:54329/",
    ]) {
      expect(() => assertSyntheticTestDatabaseUrl(value), value).toThrow(
        "TEST_DATABASE_URL names no database.",
      );
    }
    for (const value of ["", "moya_test", "127.0.0.1:54329/moya_test"]) {
      expect(() => assertSyntheticTestDatabaseUrl(value), value).toThrow(
        "TEST_DATABASE_URL must be a PostgreSQL URL naming a disposable synthetic database",
      );
    }
    expect(() =>
      assertSyntheticTestDatabaseUrl(url("moya_test_/yoyi_dev")),
    ).toThrow("TEST_DATABASE_URL points at");
  });

  it("keeps the suites' missing-variable error and returns a passing URL unchanged", () => {
    expect(() => requireSyntheticTestDatabaseUrl({})).toThrow(
      "TEST_DATABASE_URL is required for PostgreSQL tests",
    );
    expect(() =>
      requireSyntheticTestDatabaseUrl({ TEST_DATABASE_URL: url("yoyi_dev") }),
    ).toThrow("refused by name");
    const passing = url(SYNTHETIC_TEST_DATABASE_NAME);
    expect(
      requireSyntheticTestDatabaseUrl({ TEST_DATABASE_URL: passing }),
    ).toBe(passing);
  });

  it("accepts the tracked test template and every CI TEST_DATABASE_URL", async () => {
    const template = parseEnv(
      await readFile(
        path.join(repositoryRoot, "infra/env/test.env.example"),
        "utf8",
      ),
    );
    expect(assertSyntheticTestDatabaseUrl(template.TEST_DATABASE_URL!)).toBe(
      SYNTHETIC_TEST_DATABASE_NAME,
    );
    expect(
      assertSyntheticTestDatabaseUrl(
        template.CMS_TEST_DATABASE_URL!,
        "CMS_TEST_DATABASE_URL",
      ),
    ).toBe("p204_cms_synthetic_test");
    const workflow = await readFile(
      path.join(repositoryRoot, ".github/workflows/ci.yml"),
      "utf8",
    );
    const ciUrls = [
      ...workflow.matchAll(/^\s*TEST_DATABASE_URL:\s*(\S+)\s*$/gm),
    ].map((match) => match[1]!);
    expect(ciUrls).not.toHaveLength(0);
    for (const value of ciUrls) {
      expect(assertSyntheticTestDatabaseUrl(value), value).toBe("moya_test");
    }
  });

  it("guards every PostgreSQL integration suite before it touches a database", async () => {
    const suites = (await readdir(suiteDirectory))
      .filter((file) => file.endsWith(".test.ts"))
      .sort();
    expect(suites).toContain("community-postgres.test.ts");
    for (const suite of suites) {
      const source = await readFile(path.join(suiteDirectory, suite), "utf8");
      const guard = source.search(
        /\b(requireSyntheticTestDatabaseUrl|assertSyntheticTestDatabaseUrl)\(/,
      );
      // A pool is not the only way in: the CMS preflight suite connects
      // through the verification runner, so the guard must precede the first
      // of these calls. (runner.syntheticDatabase is pure URL validation and
      // is deliberately not listed.)
      const access = [
        /\bcreatePostgresPool\(/,
        /\brunner\.verifyRemoteSyntheticDatabase\(/,
      ]
        .map((pattern) => source.search(pattern))
        .filter((index) => index > -1);
      expect(source, suite).toContain('from "./synthetic-test-database.js"');
      expect(guard, suite).toBeGreaterThan(-1);
      expect(access, suite).not.toHaveLength(0);
      expect(guard, suite).toBeLessThan(Math.min(...access));
    }
  });
});
