import type {
  ArchiveItemDetail,
  ArchiveItemId,
  ArchiveItemListQuery,
  ArchiveItemPage,
  ArchiveItemSearchQuery,
  CategoryFacet,
} from "@moya/contracts";

/**
 * Read-only port for the published public archive.
 *
 * Implementations must exclude every record that is not publicly visible and
 * must return only public DTOs. Transport parsing and persistence details stay
 * outside this package.
 */
export interface ArchiveItemRepository {
  listItems(query: ArchiveItemListQuery): Promise<ArchiveItemPage>;

  getItemById(id: ArchiveItemId): Promise<ArchiveItemDetail | null>;

  searchItems(query: ArchiveItemSearchQuery): Promise<ArchiveItemPage>;

  listCategoryFacets(): Promise<CategoryFacet[]>;
}
