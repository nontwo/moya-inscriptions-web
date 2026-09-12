import type { CatalogId } from "@moya/contracts";

/**
 * A comment may only attach to a currently published Catalog record. The
 * community namespace holds no cross-family foreign key, so the composition
 * root answers this from the published Catalog read side (amendment section 2).
 * The same boundary supplies the record title the Owner's review queue shows;
 * neither Payload nor Web ever joins community rows to Catalog rows directly.
 */
export interface CatalogPublicationPort {
  isPublished(catalogId: CatalogId): Promise<boolean>;
  /** The published title, or null when the record is not currently published. */
  readTitle(catalogId: CatalogId): Promise<string | null>;
}
