import type {
  CatalogCommentRecord,
  CatalogCommentReplyRecord,
  CommentAuthorRecord,
} from "@moya/api";
import type { OperatorComment } from "@moya/contracts/internal/community-operator";
import type { QueryResultRow } from "pg";

export interface CommentRow extends QueryResultRow {
  readonly id: unknown;
  readonly catalog_id?: unknown;
  readonly root_comment_id?: unknown;
  readonly text: unknown;
  readonly created_at: unknown;
  readonly moderation: unknown;
  readonly author_id: unknown;
  readonly author_display_name: unknown;
  readonly reply_to_author_id?: unknown;
  readonly reply_to_display_name?: unknown;
}

export interface OperatorCommentRow extends CommentRow {
  readonly kind: unknown;
  readonly author_handle: unknown;
  readonly author_status: unknown;
}

const commentIdPattern = /^comment-[0-9a-f]{32}$/;
const publicUserIdPattern = /^user-[0-9a-f]{32}$/;
const handlePattern = /^[a-z][a-z0-9-]{2,31}$/;
const moderationStates = ["pending", "visible", "hidden"] as const;
const invalid = (): never => {
  throw new Error("Invalid PostgreSQL community comment row");
};

type Moderation = (typeof moderationStates)[number];

const asCommentId = (value: unknown): string =>
  typeof value === "string" && commentIdPattern.test(value) ? value : invalid();

const asText = (value: unknown): string =>
  typeof value === "string" &&
  value.trim() === value &&
  value.length >= 1 &&
  value.length <= 1_000
    ? value
    : invalid();

const asDate = (value: unknown): Date =>
  value instanceof Date && Number.isFinite(value.getTime()) ? value : invalid();

const asModeration = (value: unknown): Moderation =>
  typeof value === "string" &&
  moderationStates.some((candidate) => candidate === value)
    ? (value as Moderation)
    : invalid();

const asDisplayName = (value: unknown): string =>
  typeof value === "string" &&
  value.trim() === value &&
  value.length >= 1 &&
  value.length <= 40
    ? value
    : invalid();

const asCatalogId = (value: unknown): string =>
  typeof value === "string" && /^\S{1,128}$/.test(value) ? value : invalid();

const asHandle = (value: unknown): string =>
  typeof value === "string" && handlePattern.test(value) ? value : invalid();

const asUserStatus = (value: unknown): "active" | "suspended" =>
  value === "active" || value === "suspended" ? value : invalid();

const asAuthor = (id: unknown, displayName: unknown): CommentAuthorRecord => {
  if (typeof id !== "string" || !publicUserIdPattern.test(id)) invalid();
  return {
    id: id as CommentAuthorRecord["id"],
    displayName: asDisplayName(displayName),
  };
};

/** Fails closed on any row the schema constraints should have made impossible. */
export const mapCommentRow = (row: CommentRow): CatalogCommentRecord => {
  return {
    id: asCommentId(row.id) as CatalogCommentRecord["id"],
    catalogId: asCatalogId(row.catalog_id) as CatalogCommentRecord["catalogId"],
    author: asAuthor(row.author_id, row.author_display_name),
    text: asText(row.text),
    createdAt: asDate(row.created_at),
    moderation: asModeration(row.moderation),
  };
};

export const mapReplyRow = (row: CommentRow): CatalogCommentReplyRecord => {
  const replyTo =
    row.reply_to_author_id === null || row.reply_to_author_id === undefined
      ? undefined
      : asAuthor(row.reply_to_author_id, row.reply_to_display_name);
  return {
    id: asCommentId(row.id) as CatalogCommentReplyRecord["id"],
    rootCommentId: asCommentId(
      row.root_comment_id,
    ) as CatalogCommentReplyRecord["rootCommentId"],
    author: asAuthor(row.author_id, row.author_display_name),
    text: asText(row.text),
    createdAt: asDate(row.created_at),
    moderation: asModeration(row.moderation),
    ...(replyTo === undefined ? {} : { replyTo }),
  };
};

const isoUtc = (value: Date): string =>
  value.toISOString().replace(/\.\d{3}Z$/, ".000Z");

/** The operator view carries the moderation state the Public DTOs never expose. */
export const mapOperatorCommentRow = (
  row: OperatorCommentRow,
): OperatorComment => {
  const kind =
    row.kind === "comment" || row.kind === "reply" ? row.kind : invalid();
  const author = asAuthor(row.author_id, row.author_display_name);
  return {
    id: asCommentId(row.id) as OperatorComment["id"],
    kind,
    catalogId: asCatalogId(row.catalog_id) as OperatorComment["catalogId"],
    ...(kind === "reply"
      ? {
          rootCommentId: asCommentId(
            row.root_comment_id,
          ) as OperatorComment["id"],
        }
      : {}),
    author: {
      id: author.id,
      handle: asHandle(row.author_handle),
      displayName: author.displayName,
      status: asUserStatus(row.author_status),
    },
    text: asText(row.text),
    createdAt: isoUtc(asDate(row.created_at)),
    moderation: asModeration(row.moderation),
  };
};

export const parseCommentTotal = (value: unknown): number => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) invalid();
  const total = Number(value);
  return Number.isSafeInteger(total) ? total : invalid();
};
