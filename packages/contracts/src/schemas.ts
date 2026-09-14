import { z } from "zod";

import {
  workAuthorshipSchema,
  workMediaIdSchema,
  workMediaSchema,
  workVisibilitySchema,
} from "./work-publishing-schemas.js";
import {
  WORK_EXCERPT_MAXIMUM,
  WORK_ITEMS_HARD_MAXIMUM,
  codePointLength,
} from "./work-publishing-text.js";

export * from "./work-publishing-text.js";
export * from "./work-publishing-schemas.js";

const exactTextSchema = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value === value.trim(), {
      message: "Leading or trailing whitespace is not allowed",
    });

const platformIdentitySchema = () => z.string().min(1).max(128).regex(/^\S+$/);

export const catalogIdSchema = platformIdentitySchema().brand<"CatalogId">();
export const mediaIdSchema = platformIdentitySchema().brand<"MediaId">();

export const catalogKindSchema = z.enum(["inscription", "calligraphy"]);

export const catalogContributorRoleSchema = z.enum([
  "textAuthor",
  "calligrapher",
]);

export const catalogContributorSchema = z.strictObject({
  name: exactTextSchema(500),
  role: catalogContributorRoleSchema,
});

export const catalogCitationScopeSchema = z.enum([
  "record",
  "description",
  "transcription",
  "historicalContext",
  "scholarlyResearch",
]);

const titleSchema = exactTextSchema(500);
const aliasSchema = exactTextSchema(500);
const summarySchema = exactTextSchema(2_000);
const displayLabelSchema = exactTextSchema(500);
const mediaAltSchema = exactTextSchema(2_000);
const httpOrHttpsUrlSchema = z
  .url({ protocol: /^https?$/ })
  .and(z.string().regex(/^[Hh][Tt][Tt][Pp][Ss]?:\/\//));

export const publicMediaSchema = z.strictObject({
  id: mediaIdSchema,
  kind: z.literal("image"),
  src: httpOrHttpsUrlSchema,
  alt: mediaAltSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const publicSourceCitationSchema = z.strictObject({
  label: displayLabelSchema,
  citation: exactTextSchema(2_000).optional(),
  url: z.url().optional(),
  appliesTo: z
    .array(catalogCitationScopeSchema)
    .min(1)
    .max(5)
    .refine((scopes) => new Set(scopes).size === scopes.length, {
      message: "Citation scopes must be unique",
    })
    .meta({ uniqueItems: true })
    .optional(),
});

export const catalogSummarySchema = z.strictObject({
  id: catalogIdSchema,
  kind: catalogKindSchema,
  title: titleSchema,
  aliases: z.array(aliasSchema),
  summary: summarySchema.optional(),
  periodLabel: exactTextSchema(200).optional(),
  representativeMedia: publicMediaSchema.optional(),
});

export const catalogDetailSchema = z.strictObject({
  ...catalogSummarySchema.shape,
  dynasty: exactTextSchema(500).optional(),
  dateText: exactTextSchema(500).optional(),
  contributors: z
    .array(catalogContributorSchema)
    .min(1)
    .max(50)
    .refine(
      (contributors) => {
        const pairs = contributors.map(({ name, role }) =>
          JSON.stringify([name, role]),
        );

        return new Set(pairs).size === pairs.length;
      },
      { message: "Contributor name and role pairs must be unique" },
    )
    .meta({ uniqueItems: true })
    .optional(),
  scriptStyle: exactTextSchema(2_000).optional(),
  province: exactTextSchema(500).optional(),
  prefecture: exactTextSchema(500).optional(),
  county: exactTextSchema(500).optional(),
  currentLocation: exactTextSchema(500).optional(),
  currentCustodian: exactTextSchema(500).optional(),
  description: exactTextSchema(20_000).optional(),
  transcription: exactTextSchema(100_000).optional(),
  historicalContext: exactTextSchema(20_000).optional(),
  scholarlyResearch: exactTextSchema(20_000).optional(),
  sourceCitations: z.array(publicSourceCitationSchema),
  media: z.array(publicMediaSchema),
});

const positiveIntegerStringSchema = z
  .string()
  .max(16)
  .regex(/^[1-9]\d*$/);

const safePositiveIntegerStringSchema = positiveIntegerStringSchema.refine(
  (value) => Number.isSafeInteger(Number(value)),
  { message: "Value must be a safe positive integer" },
);

const catalogPageSizeStringSchema = safePositiveIntegerStringSchema.refine(
  (value) => Number(value) <= 100,
  { message: "pageSize must be less than or equal to 100" },
);

export const catalogListTransportQuerySchema = z.strictObject({
  kind: catalogKindSchema.optional(),
  page: safePositiveIntegerStringSchema.optional(),
  pageSize: catalogPageSizeStringSchema.optional(),
});

/** Strict transport boundary for endpoints that declare no query parameters. */
export const noQueryTransportSchema = z.strictObject({});

interface PageResult {
  readonly items: readonly unknown[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

/** The page invariants every paginated Public DTO shares. */
const checkPageInvariants = (
  result: PageResult,
  context: z.RefinementCtx,
): void => {
  const expectedTotalPages =
    result.total === 0 ? 0 : Math.ceil(result.total / result.pageSize);

  if (result.totalPages !== expectedTotalPages) {
    context.addIssue({
      code: "custom",
      path: ["totalPages"],
      message: "totalPages must equal ceil(total / pageSize), or 0 when empty",
    });
  }
  if (result.items.length > result.pageSize) {
    context.addIssue({
      code: "custom",
      path: ["items"],
      message: "items cannot exceed pageSize",
    });
  }
  if (result.items.length > result.total) {
    context.addIssue({
      code: "custom",
      path: ["items"],
      message: "items cannot exceed total",
    });
  }
  if (result.page > expectedTotalPages && result.items.length !== 0) {
    context.addIssue({
      code: "custom",
      path: ["items"],
      message: "an out-of-range page must have no items",
    });
  }
};

/** The fields every page DTO shares; the bound belongs to its operation. */
const pageShape = <Item extends z.ZodType>(
  itemSchema: Item,
  maximumPageSize: number,
) => ({
  items: z.array(itemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(maximumPageSize),
  totalPages: z.number().int().min(0),
});

/** Builds a page DTO for one item schema. */
const pageSchema = <Item extends z.ZodType>(
  itemSchema: Item,
  maximumPageSize: number,
) =>
  z
    .strictObject(pageShape(itemSchema, maximumPageSize))
    .superRefine(checkPageInvariants);

export const catalogPageSchema = pageSchema(catalogSummarySchema, 100);

export const catalogSearchMatchKindSchema = z.enum([
  "title-exact",
  "alias-exact",
  "normalized-exact",
  "title-alias-partial",
  "structured",
  "body",
]);

export const catalogSearchTransportQuerySchema = z.strictObject({
  ...catalogListTransportQuerySchema.shape,
  q: z
    .string()
    .min(1)
    .max(200)
    .refine(
      (value) =>
        Array.from(value).every((character) => {
          const code = character.charCodeAt(0);
          return (
            (code < 127 || code > 159) &&
            (code >= 32 || code === 9 || code === 10 || code === 13)
          );
        }),
      { message: "Query contains unsupported control characters" },
    )
    .refine((value) => value.trim().length > 0, {
      message: "Query must not be blank",
    }),
});

export const catalogSearchItemSchema = catalogSummarySchema.extend({
  matchKind: catalogSearchMatchKindSchema,
});

export const catalogSearchPageSchema = catalogPageSchema.safeExtend({
  items: z.array(catalogSearchItemSchema),
});

/** Opaque, platform-generated and immutable; never a provider id or handle. */
export const publicUserIdSchema =
  platformIdentitySchema().brand<"PublicUserId">();
/** System-assigned, normalized, bounded, no whitespace. */
export const publicUserHandleSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{2,31}$/);
/** The rendered author name: bounded plain text, Chinese supported, duplicates allowed. */
export const publicUserDisplayNameSchema = exactTextSchema(40);

/** Returned only to the session owner; carries no status, timestamps or credential linkage. */
export const publicUserProfileSchema = z.strictObject({
  id: publicUserIdSchema,
  handle: publicUserHandleSchema,
  displayName: publicUserDisplayNameSchema,
});

/**
 * Development-only support operation between Web and the Backend; never
 * composed in Production. These runtime shapes live only on the server-only
 * `./schemas` subpath: they are not root Public DTO types and not OpenAPI.
 */
export const developmentSignInRequestSchema = z.strictObject({
  handle: publicUserHandleSchema,
});

/** Opaque bearer credential: 32 random bytes as base64url. Web moves it into the HttpOnly cookie. */
export const sessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** The one-time grant handed to Web on Development sign-in; the token never appears anywhere else. */
export const developmentSessionSchema = z.strictObject({
  token: sessionTokenSchema,
  expiresAt: z.iso.datetime({ offset: false }),
  profile: publicUserProfileSchema,
});

/** Opaque, platform-generated comment identity; never a row serial. */
export const catalogCommentIdSchema =
  platformIdentitySchema().brand<"CatalogCommentId">();

/** The author shape embedded in every comment and reply; no avatar, no status. */
export const commentAuthorSchema = z.strictObject({
  id: publicUserIdSchema,
  displayName: publicUserDisplayNameSchema,
});

/**
 * Comment text is plain: no rich text, mentions, links, media or attachments.
 * The bound is fixed by the Mission 2B Contract review and enforced by the
 * Backend; Web never relaxes it.
 */
export const COMMENT_TEXT_MAXIMUM = 1_000;
const commentTextSchema = exactTextSchema(COMMENT_TEXT_MAXIMUM);

export const catalogCommentReplySchema = z.strictObject({
  id: catalogCommentIdSchema,
  author: commentAuthorSchema,
  text: commentTextSchema,
  createdAt: z.iso.datetime({ offset: false }),
  /** PR #106's 回复 X： pointer; absent when the reply answers the root. */
  replyTo: commentAuthorSchema.optional(),
});

export const catalogCommentSchema = z.strictObject({
  id: catalogCommentIdSchema,
  catalogId: catalogIdSchema,
  author: commentAuthorSchema,
  text: commentTextSchema,
  createdAt: z.iso.datetime({ offset: false }),
  /** A bounded first page of visible replies, in server order. */
  replies: z.array(catalogCommentReplySchema),
  /**
   * The number of currently visible replies under this root: the hot score,
   * and what tells a reader whether load-more has anything left. Never a
   * fabricated or cached count.
   */
  replyTotal: z.number().int().min(0),
});

const COMMENT_PAGE_SIZE_MAXIMUM = 50;

/**
 * The small hot section at the top of the combined comment list (Owner scope
 * amendment 2026-09-12). Provisional defaults, adjustable by the Owner: at most
 * three visible roots, ranked by their number of currently visible replies,
 * positive scores only, ties broken by newer creation time then id.
 */
export const COMMENT_HOT_LIMIT = 3;

/**
 * One combined list: `hot` first, then `items` (the latest roots, newest
 * first). A root never appears in both. `hot` is populated only when the
 * request carries no `pinned` set; a load-more request pins the hot ids it
 * already holds, so the latest pages exclude exactly those.
 */
export const catalogCommentPageSchema = z
  .strictObject({
    hot: z.array(catalogCommentSchema).max(COMMENT_HOT_LIMIT),
    ...pageShape(catalogCommentSchema, COMMENT_PAGE_SIZE_MAXIMUM),
  })
  .superRefine(checkPageInvariants)
  .superRefine((listing, context) => {
    const hotIds = new Set(listing.hot.map((comment) => comment.id));
    if (hotIds.size !== listing.hot.length)
      context.addIssue({
        code: "custom",
        path: ["hot"],
        message: "hot comments must be distinct",
      });
    if (listing.items.some((comment) => hotIds.has(comment.id)))
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "a hot comment never repeats in the latest list",
      });
  });

/** The load-more page for one root comment's replies (support operation). */
export const catalogCommentReplyPageSchema = pageSchema(
  catalogCommentReplySchema,
  COMMENT_PAGE_SIZE_MAXIMUM,
);

const commentPageSizeStringSchema = safePositiveIntegerStringSchema.refine(
  (value) => Number(value) <= COMMENT_PAGE_SIZE_MAXIMUM,
  { message: "pageSize must be less than or equal to 50" },
);

export const catalogCommentTransportQuerySchema = z.strictObject({
  page: safePositiveIntegerStringSchema.optional(),
  pageSize: commentPageSizeStringSchema.optional(),
});

/**
 * Comma-separated hot ids a browsing sequence pins: at most COMMENT_HOT_LIMIT,
 * distinct, each a CatalogCommentId. Present on load-more requests only.
 */
const pinnedCommentIdsStringSchema = z
  .string()
  .min(1)
  .max((128 + 1) * COMMENT_HOT_LIMIT)
  .refine(
    (value) => {
      const ids = value.split(",");
      return (
        ids.length <= COMMENT_HOT_LIMIT &&
        new Set(ids).size === ids.length &&
        ids.every((id) => catalogCommentIdSchema.safeParse(id).success)
      );
    },
    { message: "pinned must list at most 3 distinct comment ids" },
  );

/** The root comment listing accepts the page query plus the pinned hot ids. */
export const catalogCommentListingTransportQuerySchema =
  catalogCommentTransportQuerySchema.safeExtend({
    pinned: pinnedCommentIdsStringSchema.optional(),
  });

export const createCatalogCommentRequestSchema = z.strictObject({
  text: commentTextSchema,
});

export const createCatalogCommentReplyRequestSchema = z.strictObject({
  text: commentTextSchema,
  /** Answers a sibling reply; the new reply stays a sibling under the same root. */
  replyTo: catalogCommentIdSchema.optional(),
});

export const healthResponseSchema = z.strictObject({
  status: z.literal("ok"),
});

export const apiErrorCodeSchema = z.enum([
  "CONFLICT",
  "INVALID_QUERY",
  "INVALID_INPUT",
  "ITEM_NOT_FOUND",
  "UNAUTHENTICATED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: apiErrorCodeSchema,
    message: exactTextSchema(500),
    requestId: exactTextSchema(200),
  }),
});

// Phase 4 public shapes. Operator commands and storage metadata never appear here.
const id = z.string().min(1).max(128).regex(/^\S+$/u);
const userId = z.string().regex(/^user-[0-9a-f]{32}$/u);
const workId = z.string().regex(/^work-[0-9a-f]{32}$/u);
const mediaId = z.string().regex(/^user-media-[0-9a-f]{32}$/u);
const requestId = z.string().uuid();
const version = z.number().int().nonnegative().max(2147483647);
const visibility = z.enum(["public", "private"]);
const authorText = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine(
      (s) =>
        s === s.trim() && !s.includes("\u0000") && !/[\uD800-\uDFFF]/u.test(s),
    );
export const contentIdentitySchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("catalog"), id }),
  z.strictObject({ type: z.literal("work"), id: workId }),
]);
export const authorPrivacySchema = z.strictObject({
  following: visibility,
  followers: visibility,
  favorites: visibility,
  likes: visibility,
});
export const authorMediaSchema = z.strictObject({
  id: mediaId,
  src: z.string().startsWith("/api/community/media/"),
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
});
export const authorProfileSchema = z.strictObject({
  id: userId,
  handle: z.string(),
  displayName: authorText(40),
  bio: authorText(500),
  avatar: authorMediaSchema.nullable(),
  isOwner: z.boolean(),
  following: z.boolean(),
  privacy: authorPrivacySchema,
  totals: z.strictObject({
    works: version,
    following: version.nullable(),
    followers: version.nullable(),
    favorites: version.nullable(),
    likes: version.nullable(),
  }),
  nextAvatarChangeAt: z.iso.datetime().nullable(),
});
export const workSchema = z
  .strictObject({
    id: workId,
    authorId: userId,
    authorName: z.string(),
    /** May be empty: an untitled work keeps an empty title in storage. */
    title: z.string(),
    text: z.string(),
    /** Phase 4 PNG media or work publishing media items; avatars keep `authorMediaSchema`. */
    media: z.array(workMediaSchema).max(WORK_ITEMS_HARD_MAXIMUM),
    /**
     * The id of the `media` entry the viewer's revision uses as its cover (the
     * public revision for third parties, the author revision for the author):
     * the chosen cover item, else the first entry; null without media.
     */
    coverMediaId: workMediaIdSchema.nullable().optional(),
    /** Null until the first public exposure (a self-only or pending first submission). */
    firstPublishedAt: z.iso.datetime().nullable(),
    version,
    canEdit: z.boolean(),
    available: z.boolean(),
    /** Set after a real content update of a public revision. */
    editedAt: z.iso.datetime().nullable().optional(),
    /** Attribution readers see: original, copy or practice, or material sharing with its reference. */
    authorship: workAuthorshipSchema.optional(),
    /** Author-only fields: present only in the author's own view. */
    visibility: workVisibilitySchema.optional(),
    trashedAt: z.iso.datetime().nullable().optional(),
    /**
     * Author-only: true exactly when third parties can currently see the work
     * (public, not trashed, not hidden or removed by an operator, and a public
     * revision exists). A pending first submission or a hidden work is false.
     */
    publiclyVisible: z.boolean().optional(),
  })
  .superRefine((work, context) => {
    if (work.publiclyVisible !== undefined && !work.canEdit)
      context.addIssue({
        code: "custom",
        path: ["publiclyVisible"],
        message: "only the author's own view says whether a work is public",
      });
    if (
      work.publiclyVisible === true &&
      (work.visibility === "self" ||
        (work.trashedAt !== undefined && work.trashedAt !== null))
    )
      context.addIssue({
        code: "custom",
        path: ["publiclyVisible"],
        message: "a self-only or trashed work is not public",
      });
    if (
      work.coverMediaId !== undefined &&
      work.coverMediaId !== null &&
      !work.media.some((media) => media.id === work.coverMediaId)
    )
      context.addIssue({
        code: "custom",
        path: ["coverMediaId"],
        message: "the cover names one of the work's media",
      });
  });
export const profileUpdateSchema = z.strictObject({
  requestId,
  displayName: authorText(40).refine((s) => s.length > 0),
  bio: authorText(500),
});
export const privacyUpdateSchema = z.strictObject({
  requestId,
  privacy: authorPrivacySchema,
});
export const avatarUpdateSchema = z.strictObject({ requestId, mediaId });
export const relationshipUpdateSchema = z.strictObject({
  requestId,
  targetId: userId,
  enabled: z.boolean(),
});
export const contentRelationUpdateSchema = z.strictObject({
  requestId,
  target: contentIdentitySchema,
  enabled: z.boolean(),
});
export const guestFavoriteMergeSchema = z.strictObject({
  requestId,
  expectedAccountId: userId,
  items: z.array(contentIdentitySchema).min(1).max(100),
});
export const requestIdentitySchema = z.strictObject({ requestId });
export const authorListQuerySchema = z.strictObject({
  page: z
    .union([z.number(), z.string().regex(/^[1-9]\d*$/u)])
    .pipe(z.coerce.number<string | number>().int().min(1).max(10000))
    .default(1),
  pageSize: z
    .union([z.number(), z.string().regex(/^[1-9]\d*$/u)])
    .pipe(z.coerce.number<string | number>().int().min(1).max(50))
    .default(20),
  search: z.string().trim().max(200).default(""),
  kind: z.enum(["all", "inscription", "calligraphy"]).default("all"),
});
export type ContentIdentity = z.infer<typeof contentIdentitySchema>;
export type AuthorPrivacy = z.infer<typeof authorPrivacySchema>;
export type AuthorMedia = z.infer<typeof authorMediaSchema>;
export type AuthorProfile = z.infer<typeof authorProfileSchema>;
export type UserWork = z.infer<typeof workSchema>;
export type AuthorListQuery = z.infer<typeof authorListQuerySchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type PrivacyUpdate = z.infer<typeof privacyUpdateSchema>;
export type AvatarUpdate = z.infer<typeof avatarUpdateSchema>;
export type RelationshipUpdate = z.infer<typeof relationshipUpdateSchema>;
export type ContentRelationUpdate = z.infer<typeof contentRelationUpdateSchema>;
export type GuestFavoriteMerge = z.infer<typeof guestFavoriteMergeSchema>;

const pageOf = <T extends z.ZodType>(item: T) =>
  z.strictObject({
    items: z.array(item).max(50),
    total: version,
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(50),
  });
export const authorPersonSchema = z.strictObject({
  id: userId,
  handle: z.string(),
  displayName: z.string(),
  avatar: authorMediaSchema.nullable(),
});
export const authorPeoplePageSchema = pageOf(authorPersonSchema);
export const workPageSchema = pageOf(workSchema);
export const guestFavoriteMergeResultSchema = z.strictObject({
  acknowledged: z.array(contentIdentitySchema).max(100),
});
export const avatarUpdateResultSchema = z.strictObject({
  nextChangeAt: z.iso.datetime(),
});

export const discussionReplySchema = z.strictObject({
  id: catalogCommentIdSchema,
  author: commentAuthorSchema,
  text: z.string().max(1000),
  createdAt: z.iso.datetime(),
  replyTo: commentAuthorSchema.optional(),
  likeCount: z.number().int().nonnegative(),
  liked: z.boolean(),
  deleted: z.boolean(),
});
export const discussionCommentSchema = discussionReplySchema.extend({
  target: contentIdentitySchema,
  replies: z.array(discussionReplySchema).max(3),
  replyTotal: z.number().int().nonnegative(),
  replyPageTotal: z.number().int().nonnegative(),
});
export const discussionPageSchema = z.strictObject({
  visibleTotal: z.number().int().nonnegative(),
  hot: z.array(discussionCommentSchema).max(3),
  items: z.array(discussionCommentSchema).max(50),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(50),
  totalPages: z.number().int().nonnegative(),
});
export const discussionReplyPageSchema = z.strictObject({
  visibleTotal: z.number().int().nonnegative(),
  items: z.array(discussionReplySchema).max(50),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(50),
  totalPages: z.number().int().nonnegative(),
});
export const ownCommentSchema = z.strictObject({
  id: catalogCommentIdSchema,
  rootId: catalogCommentIdSchema,
  text: z.string(),
  createdAt: z.iso.datetime(),
  deleted: z.boolean(),
  target: contentIdentitySchema.nullable(),
});
export const commentLikeUpdateSchema = z.strictObject({
  requestId,
  enabled: z.boolean(),
});
export const commentBodyDeleteSchema = z.strictObject({ requestId });
export type DiscussionReply = z.infer<typeof discussionReplySchema>;
export type DiscussionComment = z.infer<typeof discussionCommentSchema>;
export type DiscussionPage = z.infer<typeof discussionPageSchema>;
export type DiscussionReplyPage = z.infer<typeof discussionReplyPageSchema>;
export type OwnComment = z.infer<typeof ownCommentSchema>;

export const contentCardSchema = z.strictObject({
  aliases: catalogSummarySchema.shape.aliases,
  target: contentIdentitySchema,
  /** Empty for an untitled work; the UI never invents a title. */
  title: authorText(500),
  /** The opening of a work body, for text cards. */
  excerpt: authorText(WORK_EXCERPT_MAXIMUM * 2)
    .refine((s) => codePointLength(s) <= WORK_EXCERPT_MAXIMUM)
    .optional(),
  /** A Live Photo cover: static image plus a LIVE indicator, never autoplay. */
  live: z.boolean().optional(),
  kind: catalogKindSchema.nullable(),
  authorId: userId.nullable(),
  firstPublishedAt: z.iso.datetime().nullable(),
  media: z
    .strictObject({
      id: z.string(),
      src: z.string(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .nullable(),
});
const filterValues = z
  .array(authorText(80).min(1))
  .max(25)
  .refine((values) => new Set(values).size === values.length)
  .default([]);
export const inscriptionFiltersSchema = z.strictObject({
  dynasty: filterValues,
  textAuthor: filterValues,
  calligrapher: filterValues,
  originalRegion: filterValues,
  script: filterValues,
});
export const discoveryQuerySchema = z
  .strictObject({
    kind: z.enum(["all", "inscription", "calligraphy"]).default("all"),
    pageSize: z.number().int().min(1).max(50).default(12),
    filters: inscriptionFiltersSchema.default({
      dynasty: [],
      textAuthor: [],
      calligrapher: [],
      originalRegion: [],
      script: [],
    }),
    sequence: z.string().uuid().optional(),
    after: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
    search: authorText(200).default(""),
  })
  .refine(
    (q) =>
      q.kind === "inscription" ||
      Object.values(q.filters).every((v) => v.length === 0),
    { message: "Advanced filters are inscription-only" },
  );
export const discoveryPageSchema = z.strictObject({
  items: z.array(contentCardSchema).max(50),
  sequence: z.string().uuid(),
  nextAfter: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export const contentCollectionPageSchema = z.strictObject({
  items: z.array(contentCardSchema).max(50),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
const filterOptionSchema = z.strictObject({
  values: z.array(z.string()),
  unknown: z.number().int().nonnegative(),
  unsupplied: z.number().int().nonnegative(),
});
export const inscriptionFilterOptionsSchema = z.strictObject({
  dynasty: filterOptionSchema,
  textAuthor: filterOptionSchema,
  calligrapher: filterOptionSchema,
  originalRegion: filterOptionSchema,
  script: filterOptionSchema,
});
export const contentStateQuerySchema = z.strictObject({
  target: contentIdentitySchema,
});
export const contentStateSchema = z.strictObject({
  favorite: z.boolean(),
  liked: z.boolean(),
});
export type ContentCard = z.infer<typeof contentCardSchema>;
export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;
export type DiscoveryPage = z.infer<typeof discoveryPageSchema>;
export type InscriptionFilters = z.infer<typeof inscriptionFiltersSchema>;
export type InscriptionFilterOptions = z.infer<
  typeof inscriptionFilterOptionsSchema
>;

export const ownCommentPageSchema = pageOf(ownCommentSchema).extend({
  totalPages: z.number().int().nonnegative(),
});
export const discussionSubmitResultSchema = z.strictObject({
  id: catalogCommentIdSchema,
  rootId: catalogCommentIdSchema,
  item: discussionReplySchema,
  awaitingApproval: z.boolean(),
});
export const discussionLocationSchema = z.strictObject({
  rootId: catalogCommentIdSchema,
  page: z.number().int().positive(),
  replyPage: z.number().int().positive(),
});
export const savedResultSchema = z.strictObject({ saved: z.literal(true) });
export const deletedResultSchema = z.strictObject({ deleted: z.literal(true) });
export const discardedResultSchema = z.strictObject({
  discarded: z.literal(true),
});
