import type { CatalogKind } from "@moya/contracts";

export interface CatalogSearchQuery {
  readonly q: string;
  readonly kind?: CatalogKind;
  readonly page: number;
  readonly pageSize: number;
}
