import type { CatalogSummary, PublicMedia } from "@moya/contracts";

export interface TopicLeadBlock {
  readonly text: string;
  readonly type: "lead";
}

export interface TopicRichTextBlock {
  readonly text: string;
  readonly type: "rich-text";
}

export interface TopicQuoteBlock {
  readonly text: string;
  readonly type: "quote";
}

export interface TopicImageBlock {
  readonly caption?: string;
  readonly media: PublicMedia;
  readonly type: "image";
}

export interface TopicVideoBlock {
  readonly caption: string;
  readonly type: "video";
}

export type TopicBlock =
  | TopicLeadBlock
  | TopicRichTextBlock
  | TopicQuoteBlock
  | TopicImageBlock
  | TopicVideoBlock;

interface TopicBase {
  readonly blurb: string;
  readonly cover?: PublicMedia;
  readonly id: string;
  readonly title: string;
}

export interface EditorialTopic extends TopicBase {
  readonly blocks: readonly TopicBlock[];
  readonly kind: "editorialTopic";
}

export interface CatalogCollectionTopic extends TopicBase {
  readonly kind: "catalogCollection";
  readonly records: readonly CatalogSummary[];
}

export type Topic = EditorialTopic | CatalogCollectionTopic;

export interface CatalogCollectionDefinition extends TopicBase {
  readonly kind: "catalogCollection";
  readonly recordIds: readonly string[];
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isPublicMedia = (value: unknown): value is PublicMedia => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.id) &&
    candidate.kind === "image" &&
    isNonEmptyString(candidate.src) &&
    typeof candidate.alt === "string" &&
    typeof candidate.width === "number" &&
    Number.isFinite(candidate.width) &&
    candidate.width > 0 &&
    typeof candidate.height === "number" &&
    Number.isFinite(candidate.height) &&
    candidate.height > 0
  );
};

const isCatalogSummary = (value: unknown): value is CatalogSummary => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.id) &&
    isNonEmptyString(candidate.title) &&
    (candidate.kind === "inscription" || candidate.kind === "calligraphy") &&
    Array.isArray(candidate.aliases) &&
    candidate.aliases.every((alias) => typeof alias === "string") &&
    (candidate.representativeMedia === undefined ||
      isPublicMedia(candidate.representativeMedia))
  );
};

const isTopicBlock = (value: unknown): value is TopicBlock => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  switch (candidate.type) {
    case "lead":
    case "rich-text":
    case "quote":
      return typeof candidate.text === "string";
    case "image":
      return (
        isPublicMedia(candidate.media) &&
        (candidate.caption === undefined ||
          typeof candidate.caption === "string")
      );
    case "video":
      return typeof candidate.caption === "string";
    default:
      return false;
  }
};

export const isTopic = (value: unknown): value is Topic => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const baseIsValid =
    isNonEmptyString(candidate.id) &&
    isNonEmptyString(candidate.title) &&
    typeof candidate.blurb === "string" &&
    (candidate.cover === undefined || isPublicMedia(candidate.cover));
  if (!baseIsValid) return false;
  if (candidate.kind === "editorialTopic") {
    return (
      Array.isArray(candidate.blocks) && candidate.blocks.every(isTopicBlock)
    );
  }
  if (candidate.kind === "catalogCollection") {
    return (
      Array.isArray(candidate.records) &&
      candidate.records.every(isCatalogSummary)
    );
  }
  return false;
};

export const findTopic = (
  topics: readonly Topic[],
  topicId: string,
): Topic | null => topics.find(({ id }) => id === topicId) ?? null;

export const resolveCatalogCollection = (
  definition: CatalogCollectionDefinition,
  records: readonly CatalogSummary[],
): CatalogCollectionTopic => {
  const byId = new Map(records.map((record) => [record.id, record]));
  return {
    ...definition,
    records: definition.recordIds.flatMap((recordId) => {
      const record = byId.get(recordId as CatalogSummary["id"]);
      return record === undefined ? [] : [record];
    }),
  };
};
