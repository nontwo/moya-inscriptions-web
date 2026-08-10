import type { CatalogId, CatalogKind } from "@moya/contracts";

export interface CatalogListItemProjection {
  readonly id: CatalogId;
  readonly kind: CatalogKind;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly summary?: string;
  readonly periodLabel?: string;
}

export interface CatalogSourceCitationProjection {
  readonly label: string;
  readonly citation?: string;
  readonly url?: string;
}

export interface CatalogDetailProjection extends CatalogListItemProjection {
  readonly description?: string;
  readonly sourceCitations: readonly CatalogSourceCitationProjection[];
}

export interface CatalogListPageProjection {
  readonly items: readonly CatalogListItemProjection[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}
