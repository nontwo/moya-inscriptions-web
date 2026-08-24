import type {
  CatalogDetail,
  CatalogKind,
  PublicMedia,
  PublicSourceCitation,
} from "@moya/contracts";

export type CatalogDetailEnvironment = "development" | "production";
export type CatalogDetailSource = "qa" | "runtime";
export type CatalogDetailSectionId =
  | "introduction"
  | "transcription"
  | "historical-context"
  | "scholarly-research"
  | "explanation";

export interface CatalogDetailFact {
  readonly label: string;
  readonly value: string;
}

export interface CatalogDetailSection {
  readonly content: string;
  readonly id: CatalogDetailSectionId;
  readonly placeholder?: true;
  readonly title: string;
}

export interface CatalogDetailPresentation {
  readonly aliases: readonly string[];
  readonly facts: readonly CatalogDetailFact[];
  readonly factsPlaceholder?: string;
  readonly id: string;
  readonly kind: CatalogKind;
  readonly media: readonly PublicMedia[];
  readonly periodLabel?: string;
  readonly sections: readonly CatalogDetailSection[];
  readonly source: CatalogDetailSource;
  readonly sourceCitations: readonly PublicSourceCitation[];
  readonly sourcesPlaceholder?: string;
  readonly title: string;
}

export type CatalogDetailPresentationState =
  | { readonly state: "loading" }
  | { readonly state: "loaded"; readonly detail: CatalogDetailPresentation }
  | { readonly state: "not-found" }
  | { readonly state: "unavailable" }
  | { readonly state: "unexpected-error" };

const sectionDefinitions = [
  ["introduction", "简介"],
  ["transcription", "释文"],
  ["historical-context", "历史背景"],
  ["scholarly-research", "学术研究"],
  ["explanation", "说明"],
] as const satisfies readonly (readonly [CatalogDetailSectionId, string])[];

const regionLabel = (detail: CatalogDetail): string | undefined => {
  const region = [detail.province, detail.prefecture, detail.county]
    .filter((value): value is string => value !== undefined)
    .join(" · ");
  return region || undefined;
};

const runtimeFacts = (detail: CatalogDetail): CatalogDetailFact[] => {
  const values = [
    ["朝代", detail.dynasty],
    ["年代", detail.dateText],
    ["地区", regionLabel(detail)],
    ["现址", detail.currentLocation],
    ["保管 / 现藏单位", detail.currentCustodian],
  ] as const;

  return values.flatMap(([label, value]) =>
    value === undefined ? [] : [{ label, value }],
  );
};

const runtimeSections = (
  detail: CatalogDetail,
  environment: CatalogDetailEnvironment,
): CatalogDetailSection[] =>
  sectionDefinitions.flatMap(([id, title]) => {
    const content = id === "introduction" ? detail.description : undefined;
    if (content !== undefined) return [{ content, id, title }];
    if (environment === "production") return [];
    return [{ content: "内容待接入", id, placeholder: true as const, title }];
  });

export const toRuntimeCatalogDetailPresentation = (
  detail: CatalogDetail,
  environment: CatalogDetailEnvironment,
): CatalogDetailPresentation => {
  const facts = runtimeFacts(detail);
  const media =
    detail.media.length > 0
      ? detail.media
      : detail.representativeMedia === undefined
        ? []
        : [detail.representativeMedia];

  return {
    aliases: detail.aliases,
    facts,
    ...(facts.length === 0 && environment === "development"
      ? { factsPlaceholder: "资料待接入" }
      : {}),
    id: detail.id,
    kind: detail.kind,
    media,
    ...(detail.periodLabel === undefined
      ? {}
      : { periodLabel: detail.periodLabel }),
    sections: runtimeSections(detail, environment),
    source: "runtime",
    sourceCitations: detail.sourceCitations,
    ...(detail.sourceCitations.length === 0 && environment === "development"
      ? { sourcesPlaceholder: "内容待接入" }
      : {}),
    title: detail.title,
  };
};
