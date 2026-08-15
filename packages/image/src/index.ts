import type {
  ResolvedMediaUrl,
  StorageMediaLocator,
  StorageUrlResolver,
} from "@moya/api";
import type { MediaId } from "@moya/contracts";

/** Deterministic backend resolver for explicit test/development mappings. */
export class MappedStorageUrlResolver implements StorageUrlResolver {
  constructor(
    private readonly urlsByObjectKey: ReadonlyMap<string, ResolvedMediaUrl>,
  ) {}

  async resolveMany(
    locators: readonly StorageMediaLocator[],
  ): Promise<ReadonlyMap<MediaId, ResolvedMediaUrl>> {
    const resolved = new Map<MediaId, ResolvedMediaUrl>();
    for (const locator of locators) {
      const url = this.urlsByObjectKey.get(locator.objectKey);
      if (url !== undefined) resolved.set(locator.mediaId, url);
    }
    return resolved;
  }
}

/** Production placeholder that never fabricates a storage-provider URL. */
export class UnconfiguredStorageUrlResolver implements StorageUrlResolver {
  async resolveMany(
    locators: readonly StorageMediaLocator[],
  ): Promise<ReadonlyMap<MediaId, ResolvedMediaUrl>> {
    void locators;
    return new Map();
  }
}
