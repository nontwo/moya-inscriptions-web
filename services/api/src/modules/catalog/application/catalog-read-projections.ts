import type {
  CatalogCitationScope,
  CatalogContributorRole,
  CatalogId,
  CatalogKind,
  MediaId,
} from "@moya/contracts";

export type CatalogFieldState =
  "VALUE" | "UNSUPPLIED" | "UNKNOWN" | "NOT_APPLICABLE" | "CLEAR";

export interface CatalogStatefulTextProjection {
  readonly state: CatalogFieldState;
  readonly value?: string;
}

export interface CatalogMediaProjection {
  readonly id: MediaId;
  readonly position: number;
  readonly isRepresentative: boolean;
  readonly kind: "image";
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly objectKey: string;
}

export interface CatalogListItemProjection {
  readonly id: CatalogId;
  readonly kind: CatalogKind;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly summary?: string;
  readonly periodLabel?: string;
  readonly representativeMedia?: CatalogMediaProjection;
}

export interface CatalogContributorProjection {
  readonly name: string;
  readonly role: CatalogContributorRole;
}

export interface CatalogSourceCitationProjection {
  readonly label: string;
  readonly citation?: string;
  readonly url?: string;
  readonly appliesTo?: readonly CatalogCitationScope[];
}

export interface CatalogDetailProjection extends CatalogListItemProjection {
  readonly dynasty?: CatalogStatefulTextProjection;
  readonly dateText?: CatalogStatefulTextProjection;
  readonly province?: CatalogStatefulTextProjection;
  readonly prefecture?: CatalogStatefulTextProjection;
  readonly county?: CatalogStatefulTextProjection;
  readonly currentLocation?: CatalogStatefulTextProjection;
  readonly currentCustodian?: CatalogStatefulTextProjection;
  readonly description?: string;
  readonly contributors?: readonly CatalogContributorProjection[];
  readonly scriptStyle?: CatalogStatefulTextProjection;
  readonly transcription?: CatalogStatefulTextProjection;
  readonly historicalContext?: CatalogStatefulTextProjection;
  readonly scholarlyResearch?: CatalogStatefulTextProjection;
  readonly sourceCitations: readonly CatalogSourceCitationProjection[];
  readonly media: readonly CatalogMediaProjection[];
}

export interface CatalogListPageProjection {
  readonly items: readonly CatalogListItemProjection[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

const renderableTextField = (
  field?: CatalogStatefulTextProjection,
): string | undefined => (field?.state === "VALUE" ? field.value : undefined);

export const deriveCatalogPeriodLabel = (input: {
  readonly dynasty?: CatalogStatefulTextProjection;
  readonly dateText?: CatalogStatefulTextProjection;
  readonly legacyPeriodLabel?: string;
}): string | undefined => {
  const dynasty = renderableTextField(input.dynasty);
  const dateText = renderableTextField(input.dateText);

  if (dynasty !== undefined && dateText !== undefined) {
    return `${dynasty} · ${dateText}`;
  }
  if (dynasty !== undefined) {
    return dynasty;
  }
  if (dateText !== undefined) {
    return dateText;
  }
  return input.legacyPeriodLabel;
};
