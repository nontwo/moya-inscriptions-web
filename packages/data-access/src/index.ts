import type {
  ArchiveItemDetail,
  ArchiveItemId,
  ArchiveItemListQuery,
  ArchiveItemPage,
} from "@moya/contracts";

/**
 * Read-only query port for the published public archive catalogue.
 *
 * Implementations must exclude every item that is not publicly visible and
 * must return only public DTOs. Transport parsing, persistence models and
 * infrastructure details stay outside this package.
 */
export interface ArchiveCatalogReader {
  listItems(query: ArchiveItemListQuery): Promise<ArchiveItemPage>;

  getItemById(id: ArchiveItemId): Promise<ArchiveItemDetail | null>;
}
