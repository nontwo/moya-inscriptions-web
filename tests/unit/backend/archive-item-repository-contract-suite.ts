import type { ArchiveItemRepository } from "@moya/data-access";
import type {
  ArchiveItemId,
  ArchiveItemListQuery,
  ArchiveItemSearchQuery,
  CategoryFacet,
} from "@moya/contracts";
import {
  archiveItemDetailSchema,
  archiveItemPageSchema,
  categoryFacetListSchema,
} from "@moya/contracts/schemas";
import { describe, expect, it } from "vitest";

export interface ArchiveItemRepositoryContractFixture {
  createRepository: () =>
    ArchiveItemRepository | Promise<ArchiveItemRepository>;
  emptyCollectionsItemId: ArchiveItemId;
  expectedFacets: CategoryFacet[];
  expectedListTotal: number;
  expectedSearchTotal: number;
  missingItemId: ArchiveItemId;
  name: string;
  searchKeyword: string;
}

const listQuery = (page: number): ArchiveItemListQuery => ({
  page,
  pageSize: 1,
  sortBy: "title",
  sortOrder: "asc",
});

const searchQuery = (
  keyword: string,
  page: number,
): ArchiveItemSearchQuery => ({
  keyword,
  page,
  pageSize: 1,
  sortBy: "relevance",
  sortOrder: "asc",
});

/**
 * Reusable behavioral contract for every ArchiveItemRepository adapter.
 *
 * An adapter test supplies isolated fictional data through the fixture. Future
 * in-memory and persistence adapters must pass this same suite without exposing
 * transport or infrastructure details here.
 */
export const archiveItemRepositoryContractSuite = (
  fixture: ArchiveItemRepositoryContractFixture,
): void => {
  describe(`${fixture.name} ArchiveItemRepository contract`, () => {
    it("uses deterministic list pagination and returns an empty out-of-range page", async () => {
      expect(fixture.expectedListTotal).toBeGreaterThanOrEqual(2);
      const repository = await fixture.createRepository();
      const first = await repository.listItems(listQuery(1));
      const second = await repository.listItems(listQuery(2));
      const outOfRange = await repository.listItems(
        listQuery(fixture.expectedListTotal + 1),
      );

      expect(archiveItemPageSchema.parse(first)).toEqual(first);
      expect(archiveItemPageSchema.parse(second)).toEqual(second);
      expect(archiveItemPageSchema.parse(outOfRange)).toEqual(outOfRange);
      expect(first).toMatchObject({
        total: fixture.expectedListTotal,
        page: 1,
        pageSize: 1,
        totalPages: fixture.expectedListTotal,
      });
      expect(second).toMatchObject({
        total: fixture.expectedListTotal,
        page: 2,
        pageSize: 1,
        totalPages: fixture.expectedListTotal,
      });
      expect(first.items).toHaveLength(1);
      expect(second.items).toHaveLength(1);
      expect(outOfRange).toMatchObject({
        items: [],
        total: fixture.expectedListTotal,
        page: fixture.expectedListTotal + 1,
        pageSize: 1,
        totalPages: fixture.expectedListTotal,
      });
    });

    it("uses the same deterministic pagination semantics for search", async () => {
      expect(fixture.expectedSearchTotal).toBeGreaterThanOrEqual(2);
      const repository = await fixture.createRepository();
      const first = await repository.searchItems(
        searchQuery(fixture.searchKeyword, 1),
      );
      const second = await repository.searchItems(
        searchQuery(fixture.searchKeyword, 2),
      );
      const outOfRange = await repository.searchItems(
        searchQuery(fixture.searchKeyword, fixture.expectedSearchTotal + 1),
      );

      expect(archiveItemPageSchema.parse(first)).toEqual(first);
      expect(archiveItemPageSchema.parse(second)).toEqual(second);
      expect(first.items).toHaveLength(1);
      expect(second.items).toHaveLength(1);
      expect(outOfRange).toMatchObject({
        items: [],
        total: fixture.expectedSearchTotal,
        page: fixture.expectedSearchTotal + 1,
        pageSize: 1,
        totalPages: fixture.expectedSearchTotal,
      });
    });

    it("returns null for a missing item", async () => {
      const repository = await fixture.createRepository();
      await expect(
        repository.getItemById(fixture.missingItemId),
      ).resolves.toBeNull();
    });

    it("returns deterministic schema-valid facets", async () => {
      const repository = await fixture.createRepository();
      const first = await repository.listCategoryFacets();
      const second = await repository.listCategoryFacets();

      expect(categoryFacetListSchema.parse(first)).toEqual(first);
      expect(first).toEqual(fixture.expectedFacets);
      expect(second).toEqual(first);
    });

    it("preserves valid empty public collections", async () => {
      const repository = await fixture.createRepository();
      const detail = await repository.getItemById(
        fixture.emptyCollectionsItemId,
      );

      expect(detail).not.toBeNull();
      expect(archiveItemDetailSchema.parse(detail)).toEqual(detail);
      expect(detail).toMatchObject({
        aliases: [],
        categoryIds: [],
        images: [],
        references: [],
        relatedItemIds: [],
      });
    });

    it("returns strict public DTOs without internal record state", async () => {
      const repository = await fixture.createRepository();
      const serialized = JSON.stringify({
        page: await repository.listItems(listQuery(1)),
        detail: await repository.getItemById(fixture.emptyCollectionsItemId),
      });

      for (const field of [
        "lifecycleStatus",
        "createdAt",
        "updatedAt",
        "trashedAt",
        "imageIds",
      ]) {
        expect(serialized).not.toContain(`"${field}"`);
      }
    });

    it("returns equal results when the same normalized query is repeated", async () => {
      const repository = await fixture.createRepository();
      const normalizedListQuery = listQuery(1);
      const normalizedSearchQuery = searchQuery(fixture.searchKeyword, 1);

      await expect(repository.listItems(normalizedListQuery)).resolves.toEqual(
        await repository.listItems(normalizedListQuery),
      );
      await expect(
        repository.searchItems(normalizedSearchQuery),
      ).resolves.toEqual(await repository.searchItems(normalizedSearchQuery));
    });
  });
};
