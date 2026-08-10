import type { CatalogId, CatalogKind } from "@moya/contracts";

/** Internal Catalog common shell. It is not a persistence or public record. */
export interface CatalogRecord {
  readonly id: CatalogId;
  readonly kind: CatalogKind;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly summary?: string;
  readonly description?: string;
  readonly periodLabel?: string;
}
