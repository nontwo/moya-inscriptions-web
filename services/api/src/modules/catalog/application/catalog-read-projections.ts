import type { CatalogId, CatalogKind, MediaId } from "@moya/contracts";

export interface CatalogMediaProjection {
  readonly id: MediaId;
  readonly position: number;
  readonly isRepresentative: boolean;
  readonly kind: "image";
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly objectKey: string;
}

export interface CatalogListItemProjection {
  readonly id: CatalogId;
  readonly kind: CatalogKind;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly summary?: string;
  readonly periodLabel?: string;
  readonly representativeMedia?: CatalogMediaProjection;
}

export interface CatalogSourceCitationProjection {
  readonly label: string;
  readonly citation?: string;
  readonly url?: string;
}

export interface CatalogDetailProjection extends CatalogListItemProjection {
  readonly description?: string;
  readonly sourceCitations: readonly CatalogSourceCitationProjection[];
  readonly media: readonly CatalogMediaProjection[];
}

export interface CatalogListPageProjection {
  readonly items: readonly CatalogListItemProjection[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}
