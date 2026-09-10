import type { Access } from "payload";

/** Only native file reads of published local uploads are anonymous in dev. */
export function createLocalPublishedMediaReadAccess(
  protectedRead: Access,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Access {
  return async (args) => {
    const protectedResult = await protectedRead(args);
    if (protectedResult !== false) return protectedResult;
    const { req, data, isReadingStaticFile } = args;
    if (
      environment.NODE_ENV !== "development" ||
      environment.CMS_ENVIRONMENT !== "synthetic" ||
      environment.CMS_STORAGE_MODE !== "local" ||
      !isReadingStaticFile ||
      req.method !== "GET" ||
      typeof data?.filename !== "string" ||
      !/^[a-f0-9]{64}-[a-f0-9]{64}\.(?:jpg|png|webp)$/.test(data.filename)
    )
      return false;
    const media = await req.payload.find({
      collection: "media",
      where: {
        and: [
          { filename: { equals: data.filename } },
          { origin: { equals: "upload" } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    const document = media.docs[0];
    if (!document) return false;
    const published = await req.payload.find({
      collection: "catalogs",
      // draft:false reads the committed main record, never the latest version.
      draft: false,
      where: {
        and: [
          { _status: { equals: "published" } },
          { "media.objectKey": { equals: document.objectKey } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    return published.docs.length > 0 ? { id: { equals: document.id } } : false;
  };
}
