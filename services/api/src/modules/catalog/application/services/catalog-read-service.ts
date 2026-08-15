import type {
  CatalogDetail,
  CatalogId,
  CatalogPage,
  MediaId,
} from "@moya/contracts";

import { CatalogMediaResolutionError } from "../errors/catalog-media-resolution-error.js";

import {
  mapCatalogDetail,
  mapCatalogPage,
} from "../mappers/catalog-public-contract-mapper.js";

import type { CatalogQueryPort } from "../ports/catalog-query-port.js";
import type {
  StorageMediaLocator,
  StorageUrlResolver,
  ResolvedMediaUrl,
} from "../ports/storage-url-resolver.js";
import type { CatalogListQuery } from "../queries/catalog-list-query.js";
import type {
  CatalogDetailProjection,
  CatalogListPageProjection,
  CatalogMediaProjection,
} from "../catalog-read-projections.js";

const mediaLocator = ({
  id,
  objectKey,
}: CatalogMediaProjection): StorageMediaLocator => ({
  mediaId: id,
  objectKey,
});

const listMediaLocators = (
  projection: CatalogListPageProjection,
): readonly StorageMediaLocator[] =>
  projection.items.flatMap(({ representativeMedia }) =>
    representativeMedia === undefined
      ? []
      : [mediaLocator(representativeMedia)],
  );

const detailMediaLocators = (
  projection: CatalogDetailProjection,
): readonly StorageMediaLocator[] => projection.media.map(mediaLocator);

/** Application orchestration for the public Catalog read use cases. */
export class CatalogReadService {
  constructor(
    private readonly catalogQueryPort: CatalogQueryPort,
    private readonly storageUrlResolver: StorageUrlResolver,
  ) {}

  private async resolveMedia(locators: readonly StorageMediaLocator[]) {
    if (locators.length === 0) return noResolvedMedia;

    try {
      return await this.storageUrlResolver.resolveMany(locators);
    } catch (error) {
      if (error instanceof CatalogMediaResolutionError) throw error;
      throw new CatalogMediaResolutionError({ cause: error });
    }
  }

  async list(query: CatalogListQuery): Promise<CatalogPage> {
    const projection = await this.catalogQueryPort.list(query);
    const resolvedMedia = await this.resolveMedia(
      listMediaLocators(projection),
    );
    return mapCatalogPage(projection, resolvedMedia);
  }

  async getById(id: CatalogId): Promise<CatalogDetail | null> {
    const projection = await this.catalogQueryPort.getById(id);
    if (projection === null) return null;
    const resolvedMedia = await this.resolveMedia(
      detailMediaLocators(projection),
    );
    return mapCatalogDetail(projection, resolvedMedia);
  }
}

const noResolvedMedia = new Map<MediaId, ResolvedMediaUrl>();
