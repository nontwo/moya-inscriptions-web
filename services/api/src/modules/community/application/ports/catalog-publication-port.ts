import type { CatalogId } from "@moya/contracts";

/**
 * A comment may only attach to a currently published Catalog record. The
 * community namespace holds no cross-family foreign key, so the composition
 * root answers this from the published Catalog read side (amendment section 2).
 */
export interface CatalogPublicationPort {
  isPublished(catalogId: CatalogId): Promise<boolean>;
}
