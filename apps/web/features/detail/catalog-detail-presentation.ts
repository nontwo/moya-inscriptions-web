import type {
  CatalogDetail,
  CatalogKind,
  PublicMedia,
  PublicSourceCitation,
} from "@moya/contracts";

export type CatalogDetailSourceIdentity = "qa" | "runtime";

export interface CatalogDetailFact {
  readonly label: string;
  readonly value: string;
}

export interface CatalogDetailPresentation {
  readonly aliases: readonly string[];
  readonly description?: string;
  readonly facts: readonly CatalogDetailFact[];
  readonly id: string;
  readonly kind: CatalogKind;
  readonly media: readonly PublicMedia[];
  readonly periodLabel?: string;
  readonly source: CatalogDetailSourceIdentity;
  readonly sourceCitations: readonly PublicSourceCitation[];
  readonly summary?: string;
  readonly title: string;
}

export type CatalogDetailPresentationState =
  | { readonly state: "loading" }
  | { readonly detail: CatalogDetailPresentation; readonly state: "loaded" }
  | { readonly state: "not-found" }
  | { readonly state: "unavailable" }
  | { readonly state: "unexpected-error" };

const regionLabel = (detail: CatalogDetail): string | undefined => {
  const region = [detail.province, detail.prefecture, detail.county]
    .filter((value): value is string => value !== undefined)
    .join(" · ");
  return region.length === 0 ? undefined : region;
};

export const toCatalogDetailPresentation = (
  detail: CatalogDetail,
  source: CatalogDetailSourceIdentity,
): CatalogDetailPresentation => {
  const values = [
    ["朝代", detail.dynasty],
    ["年代", detail.dateText],
    ["地区", regionLabel(detail)],
    ["现址", detail.currentLocation],
    ["保管 / 现藏单位", detail.currentCustodian],
  ] as const;
  const facts = values.flatMap(([label, value]) =>
    value === undefined ? [] : [{ label, value }],
  );
  const media =
    detail.media.length > 0
      ? detail.media
      : detail.representativeMedia === undefined
        ? []
        : [detail.representativeMedia];

  return {
    aliases: detail.aliases,
    ...(detail.description === undefined
      ? {}
      : { description: detail.description }),
    facts,
    id: detail.id,
    kind: detail.kind,
    media,
    ...(detail.periodLabel === undefined
      ? {}
      : { periodLabel: detail.periodLabel }),
    source,
    sourceCitations: detail.sourceCitations,
    ...(detail.summary === undefined ? {} : { summary: detail.summary }),
    title: detail.title,
  };
};
