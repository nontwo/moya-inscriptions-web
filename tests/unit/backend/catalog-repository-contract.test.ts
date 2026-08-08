import { readFile } from "node:fs/promises";

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
    const source = await readFile(
      new URL("../../../packages/data-access/src/index.ts", import.meta.url),
      "utf8",
    );
    const declaration = await readFile(
      new URL("../../../packages/data-access/dist/index.d.ts", import.meta.url),
      "utf8",
    );
    const manifest = JSON.parse(
      await readFile(
        new URL("../../../packages/data-access/package.json", import.meta.url),
        "utf8",
      ),
    ) as { dependencies?: Record<string, string>; sideEffects?: boolean };
    const publicSurface = `${source}\n${declaration}`;

    expect(Object.keys(dataAccessRuntime)).toEqual([]);
    expect(manifest.dependencies).toEqual({
      "@moya/contracts": "workspace:*",
    });
    expect(manifest.sideEffects).toBe(false);
    expect(publicSurface).not.toMatch(/from ["'](?:pg|hono)["']/i);
    expect(publicSurface).not.toMatch(
      /\b(?:Pool|PoolClient|QueryResult|Request|Response)\b/,
    );
    expect(publicSurface).not.toMatch(/DATABASE_URL|data\/catalog|\.sql\b/i);
  });
});
