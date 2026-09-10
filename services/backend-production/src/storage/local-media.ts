import type { RuntimeEnvironment } from "@moya/backend-runtime";

/** Development uses Payload's existing file route and native local storage. */
export function createLocalStorageUrlResolver(environment: RuntimeEnvironment) {
  if (
    environment.NODE_ENV !== "development" ||
    environment.CMS_ENVIRONMENT !== "synthetic" ||
    environment.CMS_STORAGE_MODE !== "local"
  )
    throw new Error("Local media requires synthetic development storage");
  let origin: URL;
  try {
    origin = new URL(environment.PUBLIC_MEDIA_BASE_URL ?? "");
  } catch {
    throw new Error("Invalid local media origin");
  }
  if (
    origin.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("Invalid local media origin");
  const mediaOrigin = origin.origin;
  return {
    async resolveMany<MediaIdentity extends string>(
      locators: readonly {
        readonly mediaId: MediaIdentity;
        readonly objectKey: string;
      }[],
    ): Promise<ReadonlyMap<MediaIdentity, string>> {
      const result = new Map<MediaIdentity, string>();
      for (const locator of locators) {
        // Local uploads already use hashed CatalogId / MediaId / byte SHA keys.
        // Never turn arbitrary object keys or filesystem paths into URLs.
        const match =
          /^editorial\/[a-f0-9]{64}\/([a-f0-9]{64}-[a-f0-9]{64}\.(?:jpg|png|webp))$/.exec(
            locator.objectKey,
          );
        if (!match) throw new Error("Invalid local media object key");
        result.set(
          locator.mediaId,
          `${mediaOrigin}/api/media/file/${match[1]!}`,
        );
      }
      return result;
    },
  };
}
