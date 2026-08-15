import type {
  CatalogDetail,
  CatalogPage,
  CatalogSummary,
  MediaId,
  PublicMedia,
  PublicSourceCitation,
} from "@moya/contracts";
import {
  catalogDetailSchema,
  catalogPageSchema,
  catalogSummarySchema,
  publicMediaSchema,
  publicSourceCitationSchema,
} from "@moya/contracts/schemas";

import { CatalogMediaResolutionError } from "../errors/catalog-media-resolution-error.js";

import type {
  CatalogDetailProjection,
  CatalogListItemProjection,
  CatalogListPageProjection,
  CatalogMediaProjection,
  CatalogSourceCitationProjection,
} from "../catalog-read-projections.js";
import type { ResolvedMediaUrl } from "../ports/storage-url-resolver.js";

const noResolvedMedia = new Map<MediaId, ResolvedMediaUrl>();

const mapPublicMedia = (
  projection: CatalogMediaProjection,
  resolvedMedia: ReadonlyMap<MediaId, ResolvedMediaUrl>,
): PublicMedia => {
  const src = resolvedMedia.get(projection.id);
  if (src === undefined) {
    throw new CatalogMediaResolutionError({
      cause: new Error(`Missing resolved URL for MediaId ${projection.id}`),
    });
  }

  const media = publicMediaSchema.safeParse({
    id: projection.id,
    kind: projection.kind,
    src,
    alt: projection.alt,
    width: projection.width,
    height: projection.height,
  });
  if (!media.success) {
    throw new CatalogMediaResolutionError({ cause: media.error });
  }
  return media.data;
};

const mapCatalogSourceCitation = (
  projection: CatalogSourceCitationProjection,
): PublicSourceCitation => {
  const citation: PublicSourceCitation = { label: projection.label };

  if (projection.citation !== undefined) {
    citation.citation = projection.citation;
  }
  if (projection.url !== undefined) {
    citation.url = projection.url;
  }

  return publicSourceCitationSchema.parse(citation);
};

export const mapCatalogSummary = (
  projection: CatalogListItemProjection,
  resolvedMedia: ReadonlyMap<MediaId, ResolvedMediaUrl> = noResolvedMedia,
): CatalogSummary => {
  const summary: CatalogSummary = {
    id: projection.id,
    kind: projection.kind,
    title: projection.title,
    aliases: [...projection.aliases],
  };

  if (projection.summary !== undefined) {
    summary.summary = projection.summary;
  }
  if (projection.periodLabel !== undefined) {
    summary.periodLabel = projection.periodLabel;
  }
  if (projection.representativeMedia !== undefined) {
    summary.representativeMedia = mapPublicMedia(
      projection.representativeMedia,
      resolvedMedia,
    );
  }

  return catalogSummarySchema.parse(summary);
};

export const mapCatalogDetail = (
  projection: CatalogDetailProjection,
  resolvedMedia: ReadonlyMap<MediaId, ResolvedMediaUrl> = noResolvedMedia,
): CatalogDetail => {
  const detail: CatalogDetail = {
    ...mapCatalogSummary(projection, resolvedMedia),
    sourceCitations: projection.sourceCitations.map(mapCatalogSourceCitation),
    media: projection.media.map((media) =>
      mapPublicMedia(media, resolvedMedia),
    ),
  };

  if (projection.description !== undefined) {
    detail.description = projection.description;
  }

  return catalogDetailSchema.parse(detail);
};

export const mapCatalogPage = (
  projection: CatalogListPageProjection,
  resolvedMedia: ReadonlyMap<MediaId, ResolvedMediaUrl> = noResolvedMedia,
): CatalogPage =>
  catalogPageSchema.parse({
    items: projection.items.map((item) =>
      mapCatalogSummary(item, resolvedMedia),
    ),
    total: projection.total,
    page: projection.page,
    pageSize: projection.pageSize,
    totalPages: projection.totalPages,
  });
