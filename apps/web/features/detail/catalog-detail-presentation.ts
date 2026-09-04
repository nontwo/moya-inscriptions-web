import type {
  CatalogCitationScope,
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

export type CatalogDetailContentSectionKey =
  "description" | "transcription" | "historicalContext" | "scholarlyResearch";

export interface CatalogDetailContentSection {
  readonly key: CatalogDetailContentSectionKey;
  readonly text: string;
  readonly title: string;
}

export interface CatalogDetailSourceCitationPresentation {
  readonly citation?: string;
  readonly label: string;
  readonly scopeLabel: string;
  readonly url?: string;
}

export interface CatalogDetailPresentation {
  readonly aliases: readonly string[];
  readonly facts: readonly CatalogDetailFact[];
  readonly id: string;
  readonly kind: CatalogKind;
  readonly media: readonly PublicMedia[];
  readonly periodLabel?: string;
  readonly sections?: readonly CatalogDetailContentSection[];
  readonly source: CatalogDetailSourceIdentity;
  readonly sourceCitations: readonly CatalogDetailSourceCitationPresentation[];
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

const contributorRoleLabels = {
  calligrapher: "书者",
  textAuthor: "撰文者",
} as const;

const citationScopeLabels = {
  description: "简介",
  historicalContext: "历史背景",
  record: "整体资料",
  scholarlyResearch: "学术研究",
  transcription: "释文",
} satisfies Readonly<Record<CatalogCitationScope, string>>;

const contentSections = [
  ["description", "简介"],
  ["transcription", "释文"],
  ["historicalContext", "历史背景"],
  ["scholarlyResearch", "学术研究"],
] as const;

const toSourceCitationPresentation = (
  citation: PublicSourceCitation,
): CatalogDetailSourceCitationPresentation => {
  const scopes: readonly CatalogCitationScope[] = citation.appliesTo ?? [
    "record",
  ];
  return {
    ...(citation.citation === undefined ? {} : { citation: citation.citation }),
    label: citation.label,
    scopeLabel: scopes.map((scope) => citationScopeLabels[scope]).join("、"),
    ...(citation.url === undefined ? {} : { url: citation.url }),
  };
};

export const toCatalogDetailPresentation = (
  detail: CatalogDetail,
  source: CatalogDetailSourceIdentity,
): CatalogDetailPresentation => {
  const facts: CatalogDetailFact[] = [];
  if (detail.periodLabel === undefined) {
    for (const [label, value] of [
      ["朝代", detail.dynasty],
      ["年代", detail.dateText],
    ] as const) {
      if (value !== undefined) facts.push({ label, value });
    }
  }
  for (const contributor of detail.contributors ?? []) {
    facts.push({
      label: contributorRoleLabels[contributor.role],
      value: contributor.name,
    });
  }
  for (const [label, value] of [
    ["书体", detail.scriptStyle],
    ["地区", regionLabel(detail)],
    ["现址", detail.currentLocation],
    ["现藏单位", detail.currentCustodian],
  ] as const) {
    if (value !== undefined) facts.push({ label, value });
  }
  const media =
    detail.media.length > 0
      ? detail.media
      : detail.representativeMedia === undefined
        ? []
        : [detail.representativeMedia];
  const sections = contentSections.flatMap(([key, title]) => {
    const text = detail[key];
    return text === undefined ? [] : [{ key, text, title }];
  });

  return {
    aliases: detail.aliases,
    facts,
    id: detail.id,
    kind: detail.kind,
    media,
    ...(detail.periodLabel === undefined
      ? {}
      : { periodLabel: detail.periodLabel }),
    sections,
    source,
    sourceCitations: detail.sourceCitations.map(toSourceCitationPresentation),
    ...(detail.summary === undefined ? {} : { summary: detail.summary }),
    title: detail.title,
  };
};
