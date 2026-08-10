import type { CatalogId } from "@moya/contracts";

import type {
  CatalogDetailProjection,
  CatalogListPageProjection,
} from "../catalog-read-projections.js";
import type { CatalogListQuery } from "../queries/catalog-list-query.js";

/** Application-owned read port for base Catalog list and detail use cases. */
export interface CatalogQueryPort {
  list(query: CatalogListQuery): Promise<CatalogListPageProjection>;

  getById(id: CatalogId): Promise<CatalogDetailProjection | null>;
}
