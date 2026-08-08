import type { CatalogRepository } from "@moya/data-access";
import type { SiteId } from "@moya/contracts";
import {
  categoryFacetSchema,
  regionFacetSchema,
  siteDetailSchema,
  sitePageSchema,
} from "@moya/contracts/schemas";
import { describe, expect, it } from "vitest";

export interface CatalogRepositoryContractFixture {
  createRepository(): CatalogRepository | Promise<CatalogRepository>;
  existingSiteId: SiteId;
  missingSiteId: SiteId;
}

const internalOnlyFields = [
  "auditMetadata",
  "candidate",
  "evidence",
  "internalEvidence",
  "needsReview",
  "rawSource",
  "regionCandidates",
  "reviewNotes",
  "selectedCandidateIndex",
] as const;

/**
 * Reusable behavior contract for every CatalogRepository adapter.
 *
 * The in-memory adapter runs it in T04.0. Future PostgreSQL adapters must run
 * this same suite with isolated adapter setup and teardown.
 */
export const runCatalogRepositoryContractSuite = (
  adapterName: string,
  fixture: CatalogRepositoryContractFixture,
): void => {
  describe(`${adapterName} CatalogRepository contract`, () => {
    it("returns schema-valid pages using normalized numeric pagination", async () => {
      const repository = await fixture.createRepository();
      const firstPage = await repository.listSites({ page: 1, pageSize: 2 });
      const secondPage = await repository.listSites({ page: 2, pageSize: 2 });

      expect(sitePageSchema.parse(firstPage)).toEqual(firstPage);
      expect(firstPage).toMatchObject({
        page: 1,
        pageSize: 2,
        total: 3,
        totalPages: 2,
      });
      expect(firstPage.items).toHaveLength(2);
      expect(secondPage.items).toHaveLength(1);
    });

    it("returns an empty items array for an out-of-range page", async () => {
      const repository = await fixture.createRepository();
      const page = await repository.listSites({ page: 99, pageSize: 20 });

      expect(sitePageSchema.parse(page)).toEqual(page);
      expect(page).toEqual({
        total: 3,
        page: 99,
        pageSize: 20,
        totalPages: 1,
        items: [],
      });
    });

    it("uses the same pagination contract for search results", async () => {
      const repository = await fixture.createRepository();
      const page = await repository.searchSites({
        keyword: "摩崖",
        page: 1,
        pageSize: 1,
        sortBy: "relevance",
      });

      expect(sitePageSchema.parse(page)).toEqual(page);
      expect(page).toMatchObject({
        page: 1,
        pageSize: 1,
        total: 2,
        totalPages: 2,
      });
      expect(page.items).toHaveLength(1);
    });

    it("returns null for a missing SiteId", async () => {
      const repository = await fixture.createRepository();

      await expect(
        repository.getSiteById(fixture.missingSiteId),
      ).resolves.toBeNull();
    });

    it("allows empty public image, category, and reference collections", async () => {
      const repository = await fixture.createRepository();
      const detail = await repository.getSiteById(fixture.existingSiteId);

      expect(detail).not.toBeNull();
      expect(siteDetailSchema.parse(detail)).toEqual(detail);
      expect(detail).toMatchObject({
        categoryIds: [],
        imageIds: [],
        images: [],
        references: [],
      });
    });

    it("returns province-only region facets and permits no approved taxonomy", async () => {
      const repository = await fixture.createRepository();
      const regionFacets = await repository.listRegionFacets();
      const categoryFacets = await repository.listCategoryFacets();

      expect(
        regionFacets.map((facet) => regionFacetSchema.parse(facet)),
      ).toEqual(regionFacets);
      expect(regionFacets).toEqual([
        { province: "浙江省", count: 2 },
        { province: "重庆市", count: 1 },
      ]);
      expect(
        categoryFacets.map((facet) => categoryFacetSchema.parse(facet)),
      ).toEqual([]);
    });

    it("does not leak source, candidate, audit, or driver fields", async () => {
      const repository = await fixture.createRepository();
      const page = await repository.listSites({ page: 1, pageSize: 20 });
      const detail = await repository.getSiteById(fixture.existingSiteId);
      const serialized = JSON.stringify({ detail, page });

      for (const field of internalOnlyFields) {
        expect(serialized).not.toContain(`"${field}"`);
      }
      expect(serialized).not.toMatch(
        /(?:DATABASE_URL|PoolClient|QueryResult|connectionString|driver stack|SELECT\s)/i,
      );
    });
  });
};
