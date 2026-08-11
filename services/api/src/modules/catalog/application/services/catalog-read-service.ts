import type { CatalogDetail, CatalogId, CatalogPage } from "@moya/contracts";

import {
  mapCatalogDetail,
  mapCatalogPage,
} from "../mappers/catalog-public-contract-mapper.js";

import type { CatalogQueryPort } from "../ports/catalog-query-port.js";
import type { CatalogListQuery } from "../queries/catalog-list-query.js";

/** Application orchestration for the public Catalog read use cases. */
export class CatalogReadService {
  constructor(private readonly catalogQueryPort: CatalogQueryPort) {}

  async list(query: CatalogListQuery): Promise<CatalogPage> {
    return mapCatalogPage(await this.catalogQueryPort.list(query));
  }

  async getById(id: CatalogId): Promise<CatalogDetail | null> {
    const projection = await this.catalogQueryPort.getById(id);
    return projection === null ? null : mapCatalogDetail(projection);
  }
}
