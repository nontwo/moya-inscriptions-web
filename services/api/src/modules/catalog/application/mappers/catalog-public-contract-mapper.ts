import type {
  CatalogDetail,
  CatalogPage,
  CatalogSummary,
  PublicSourceCitation,
} from "@moya/contracts";
import {
  catalogDetailSchema,
  catalogPageSchema,
  catalogSummarySchema,
  publicSourceCitationSchema,
} from "@moya/contracts/schemas";

import type {
  CatalogDetailProjection,
  CatalogListItemProjection,
  CatalogListPageProjection,
  CatalogSourceCitationProjection,
} from "../catalog-read-projections.js";

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

  return catalogSummarySchema.parse(summary);
};

export const mapCatalogDetail = (
  projection: CatalogDetailProjection,
): CatalogDetail => {
  const detail: CatalogDetail = {
    id: projection.id,
    kind: projection.kind,
    title: projection.title,
    aliases: [...projection.aliases],
    sourceCitations: projection.sourceCitations.map(mapCatalogSourceCitation),
  };

  if (projection.summary !== undefined) {
    detail.summary = projection.summary;
  }
  if (projection.periodLabel !== undefined) {
    detail.periodLabel = projection.periodLabel;
  }
  if (projection.description !== undefined) {
    detail.description = projection.description;
  }

  return catalogDetailSchema.parse(detail);
};

export const mapCatalogPage = (
  projection: CatalogListPageProjection,
): CatalogPage =>
  catalogPageSchema.parse({
    items: projection.items.map(mapCatalogSummary),
    total: projection.total,
    page: projection.page,
    pageSize: projection.pageSize,
    totalPages: projection.totalPages,
  });
