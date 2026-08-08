import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as dataAccessRuntime from "@moya/data-access";
import type { CatalogRepository } from "@moya/data-access";
import type {
  PaginatedResponse,
  SiteDetail,
  SiteId,
  SiteListQuery,
  SiteListTransportQuery,
  SiteSearchQuery,
  SiteSearchTransportQuery,
  SiteSummary,
  SourceId,
} from "@moya/contracts";
import { describe, expect, it } from "vitest";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

const assertRepositoryTypeRelations = (
  repository: CatalogRepository,
  listQuery: SiteListQuery,
  listTransport: SiteListTransportQuery,
  searchQuery: SiteSearchQuery,
  searchTransport: SiteSearchTransportQuery,
  siteId: SiteId,
  sourceId: SourceId,
) => {
  void repository.listSites(listQuery);
  void repository.searchSites(searchQuery);
  void repository.getSiteById(siteId);

  // @ts-expect-error Repository input must be normalized, not query strings.
  void repository.listSites(listTransport);
  // @ts-expect-error Repository input must be normalized, not query strings.
  void repository.searchSites(searchTransport);
  // @ts-expect-error Provenance SourceId cannot address a platform Site.
  void repository.getSiteById(sourceId);
};

void assertRepositoryTypeRelations;

const collectFiles = async (
  directory: string,
  accept: (file: string) => boolean,
): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(target, accept)));
    } else if (accept(target)) {
      files.push(target);
    }
  }

  return files.sort();
};

describe("CatalogRepository port", () => {
  it("uses the exact normalized contract types", () => {
    const listInputIsExact: Equal<
      Parameters<CatalogRepository["listSites"]>[0],
      SiteListQuery
    > = true;
    const searchInputIsExact: Equal<
      Parameters<CatalogRepository["searchSites"]>[0],
      SiteSearchQuery
    > = true;
    const idInputIsExact: Equal<
      Parameters<CatalogRepository["getSiteById"]>[0],
      SiteId
    > = true;
    const listOutputIsExact: Equal<
      Awaited<ReturnType<CatalogRepository["listSites"]>>,
      PaginatedResponse<SiteSummary>
    > = true;
    const detailOutputIsExact: Equal<
      Awaited<ReturnType<CatalogRepository["getSiteById"]>>,
      SiteDetail | null
    > = true;

    expect([
      listInputIsExact,
      searchInputIsExact,
      idInputIsExact,
      listOutputIsExact,
      detailOutputIsExact,
    ]).toEqual([true, true, true, true, true]);
  });

  it("has an empty runtime surface and no infrastructure types", async () => {
    const packageRoot = fileURLToPath(
      new URL("../../../packages/data-access/", import.meta.url),
    );
    const files = [
      ...(await collectFiles(path.join(packageRoot, "src"), (file) =>
        /\.[cm]?tsx?$/.test(file),
      )),
      ...(await collectFiles(
        path.join(packageRoot, "dist"),
        (file) => file.endsWith(".d.ts") || file.endsWith(".js"),
      )),
    ];
    const publicSurface = (
      await Promise.all(files.map((file) => readFile(file, "utf8")))
    ).join("\n");
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; sideEffects?: boolean };

    expect(files.map((file) => path.relative(packageRoot, file))).toEqual(
      expect.arrayContaining([
        "dist/index.d.ts",
        "dist/index.js",
        "src/index.ts",
      ]),
    );
    expect(Object.keys(dataAccessRuntime)).toEqual([]);
    expect(manifest.dependencies).toEqual({
      "@moya/contracts": "workspace:*",
    });
    expect(manifest.sideEffects).toBe(false);
    expect(publicSurface).not.toMatch(/from ["'](?:pg|hono)["']/i);
    expect(publicSurface).not.toMatch(
      /\b(?:DatabaseClient|Hono|Pool|PoolClient|QueryConfig|QueryResult|Request|Response)\b/,
    );
    expect(publicSurface).not.toMatch(/DATABASE_URL|data\/catalog|\.sql\b/i);
    expect(publicSurface).not.toMatch(
      /\b(?:DELETE\s+FROM|INSERT\s+INTO|SELECT\s+.+\s+FROM|UPDATE\s+.+\s+SET)\b/i,
    );
    expect(files.map((file) => path.relative(packageRoot, file))).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/(?:database|postgres|sql)/i),
      ]),
    );
    const importSpecifiers = [
      ...publicSurface.matchAll(/from\s+["']([^"']+)["']/g),
    ].map((match) => match[1]);
    expect(importSpecifiers).toContain("@moya/contracts");
    expect(
      importSpecifiers
        .filter((specifier) => specifier?.startsWith("@moya/"))
        .every(
          (specifier) =>
            specifier === "@moya/contracts" ||
            specifier?.startsWith("@moya/contracts/") === true,
        ),
    ).toBe(true);
  });
});
