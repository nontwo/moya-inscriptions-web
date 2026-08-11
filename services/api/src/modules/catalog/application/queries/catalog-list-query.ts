import type { CatalogKind } from "@moya/contracts";

/** Normalized application input for the base Catalog list use case. */
export interface CatalogListQuery {
  readonly kind?: CatalogKind;
  readonly page: number;
  readonly pageSize: number;
}
