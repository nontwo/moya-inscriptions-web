import type { EditorialDraft } from "@moya/contracts/internal/editorial";
import { APIError, type PayloadRequest } from "payload";

/** Catalog revisions embed metadata; only registered media owned by that Catalog may enter them. */
export async function validateCatalogMedia(
  req: PayloadRequest,
  candidate: EditorialDraft,
  options: { publishing: boolean },
): Promise<void> {
  const incoming = candidate.media;
  for (let offset = 0; offset < incoming.length; offset += 100) {
    const slice = incoming.slice(offset, offset + 100);
    const result = await req.payload.find({
      collection: "media",
      overrideAccess: false,
      req,
      depth: 0,
      limit: 100,
      where: { mediaId: { in: slice.map(({ mediaId }) => mediaId) } },
      select: {
        mediaId: true,
        catalogId: true,
        objectKey: true,
        width: true,
        height: true,
        sha256: true,
        rights: true,
        orderConfidence: true,
      },
    });
    const registered = new Map(result.docs.map((doc) => [doc.mediaId, doc]));
    for (const media of slice) {
      const stored = registered.get(media.mediaId);
      if (
        !stored ||
        stored.catalogId !== candidate.catalogId ||
        stored.objectKey !== media.objectKey ||
        stored.width !== media.width ||
        stored.height !== media.height ||
        !/^[a-f0-9]{64}$/.test(stored.sha256) ||
        (stored.rights ?? undefined) !== media.rights ||
        (stored.orderConfidence ?? undefined) !== media.orderConfidence
      ) {
        throw new APIError(
          options.publishing
            ? "MEDIA_PUBLICATION_REFERENCE_INVALID"
            : "MEDIA_REFERENCE_INVALID",
          400,
        );
      }
    }
  }
}
