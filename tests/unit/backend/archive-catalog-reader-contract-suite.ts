import type { ArchiveCatalogReader } from "@moya/data-access";
import type { ArchiveItemId, ArchiveItemListQuery } from "@moya/contracts";
import {
  archiveItemDetailSchema,
  archiveItemPageSchema,
} from "@moya/contracts/schemas";
import { describe, expect, it } from "vitest";

export interface ArchiveCatalogReaderContractFixture {
  createReader: () => ArchiveCatalogReader | Promise<ArchiveCatalogReader>;
  emptySourcesItemId: ArchiveItemId;
  expectedListTotal: number;
  missingItemId: ArchiveItemId;
  name: string;
}

const listQuery = (page: number): ArchiveItemListQuery => ({
  page,
  pageSize: 1,
});

/**
 * Reusable behavioral contract for every ArchiveCatalogReader adapter.
 *
 * Adapter tests provide isolated fictional data. Future PostgreSQL adapters
 * must pass the same suite without exposing transport or infrastructure state.
 */
export const archiveCatalogReaderContractSuite = (
  fixture: ArchiveCatalogReaderContractFixture,
): void => {
  describe(`${fixture.name} ArchiveCatalogReader contract`, () => {
    it("uses deterministic pagination and an empty out-of-range page", async () => {
      expect(fixture.expectedListTotal).toBeGreaterThanOrEqual(2);
      const reader = await fixture.createReader();
      const first = await reader.listItems(listQuery(1));
      const second = await reader.listItems(listQuery(2));
      const outOfRange = await reader.listItems(
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

    it("returns null for a missing item", async () => {
      const reader = await fixture.createReader();
      await expect(
        reader.getItemById(fixture.missingItemId),
      ).resolves.toBeNull();
    });

    it("preserves a valid empty public source collection", async () => {
      const reader = await fixture.createReader();
      const detail = await reader.getItemById(fixture.emptySourcesItemId);

      expect(detail).not.toBeNull();
      expect(archiveItemDetailSchema.parse(detail)).toEqual(detail);
      expect(detail).toMatchObject({ aliases: [], sources: [] });
    });

    it("returns only the minimized public DTO surface", async () => {
      const reader = await fixture.createReader();
      const serialized = JSON.stringify({
        page: await reader.listItems(listQuery(1)),
        detail: await reader.getItemById(fixture.emptySourcesItemId),
      });

      for (const field of [
        "lifecycleStatus",
        "createdAt",
        "updatedAt",
        "rawSource",
        "objectKey",
        "images",
        "relatedItemIds",
        "categoryIds",
        "city",
        "county",
      ]) {
        expect(serialized).not.toContain(`"${field}"`);
      }
    });

    it("returns equal results for repeated normalized queries", async () => {
      const reader = await fixture.createReader();
      const query = listQuery(1);

      await expect(reader.listItems(query)).resolves.toEqual(
        await reader.listItems(query),
      );
    });
  });
};
