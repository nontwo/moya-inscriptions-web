import type { MediaId } from "@moya/contracts";

export interface StorageMediaLocator {
  readonly mediaId: MediaId;
  readonly objectKey: string;
}

export type ResolvedMediaUrl = string;

/** Application-owned batch boundary between logical object keys and runtime URLs. */
export interface StorageUrlResolver {
  resolveMany(
    locators: readonly StorageMediaLocator[],
  ): Promise<ReadonlyMap<MediaId, ResolvedMediaUrl>>;
}
