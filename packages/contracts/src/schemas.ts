import { z } from "zod";

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
