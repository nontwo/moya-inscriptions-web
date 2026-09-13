/** Phase 4 application routes. Composition remains Development-only. */
const reference = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (schema: string) => ({
  description: "Committed result; private responses are never cached.",
  content: { "application/json": { schema: reference(schema) } },
});
const failure = (description: string) => ({
  description,
  content: { "application/json": { schema: reference("ApiError") } },
});
const listParameters = [
  {
    name: "page",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 },
  },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
  },
];
const pathSchema = (name: string) => {
  if (name === "type") return { type: "string", enum: ["catalog", "work"] };
  if (name === "commentId" || name === "rootId")
    return reference("CatalogCommentId");
  if (name === "authorId") return reference("PublicUserId");
  if (name === "workId" || name === "draftId")
    return {
      type: "string",
      pattern: `^${name === "workId" ? "work" : "draft"}-[0-9a-f]{32}$`,
    };
  return {
    type: "string",
    minLength: 1,
    description:
      "Stored opaque identity; never derive a Catalog identity from a user work.",
  };
};
const discussionParameters = [
  {
    name: "page",
    in: "query",
    schema: {
      type: "integer",
      minimum: 1,
      maximum: Number.MAX_SAFE_INTEGER,
      default: 1,
    },
  },
  listParameters[1],
  {
    name: "pinned",
    in: "query",
    description:
      "Up to 3 distinct root comment IDs separated by commas. Omission selects current hot roots; an explicitly empty string pins none. Reuse the same IDs for paging and location.",
    schema: { type: "string", maxLength: 387 },
  },
];
const discoveryParameters = [
  {
    name: "kind",
    in: "query",
    schema: {
      type: "string",
      enum: ["all", "inscription", "calligraphy"],
      default: "all",
    },
  },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 50, default: 12 },
  },
  {
    name: "search",
    in: "query",
    schema: { type: "string", maxLength: 200, default: "" },
  },
  {
    name: "sequence",
    in: "query",
    description:
      "24-hour viewer/query-bound browsing sequence. A new sequence fixes membership order; live eligibility is rechecked at each page.",
    schema: { type: "string", format: "uuid" },
  },
  {
    name: "after",
    in: "query",
    schema: {
      type: "integer",
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
      default: 0,
    },
  },
  {
    name: "filters",
    in: "query",
    description:
      "JSON-encoded InscriptionFilters; nonempty only for inscription. OR within each dimension, AND across dimensions. @unknown and @unsupplied are reserved states, not historical values.",
    content: {
      "application/json": { schema: reference("InscriptionFilters") },
    },
  },
];
const operation = (
  name: string,
  path: string,
  output: string | null,
  input: string | null,
  privateOnly: boolean,
  list: boolean | "collection" | "discussion" | "discovery" = false,
) => ({
  operationId: name,
  description:
    "Phase 4 Development only; absent in Production. Optional sessions personalize eligibility; malformed supplied credentials reject. All reads are private, no-store with Vary: Authorization. Unknown or duplicate query fields reject. JSON writes accept no query. RequestIdentity commands are replay-safe for their actor; comment submissions do not have a replay receipt. Work draft save/apply can return HTTP 200 with conflict=true and retain unapplied versions.",
  security: privateOnly ? [{ session: [] }] : [{}, { session: [] }],
  parameters: [
    ...[...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: pathSchema(m[1]!),
    })),
    ...(input
      ? [
          {
            name: "x-author-account",
            in: "header",
            required: false,
            description:
              "Optional assertion of the authenticated account; mismatch rejects. Does not authorize a request.",
            schema: { type: "string" },
          },
        ]
      : []),
    ...(list === "discovery"
      ? discoveryParameters
      : list === "discussion"
        ? discussionParameters
        : list
          ? listParameters
          : []),
    ...(list === "collection"
      ? [
          {
            name: "search",
            in: "query",
            schema: { type: "string", maxLength: 200, default: "" },
          },
          {
            name: "kind",
            in: "query",
            schema: {
              type: "string",
              enum: ["all", "inscription", "calligraphy"],
              default: "all",
            },
          },
        ]
      : []),
  ],
  ...(input
    ? {
        requestBody: {
          required: true,
          content: { "application/json": { schema: reference(input) } },
        },
      }
    : {}),
  responses: {
    [output === "DiscussionSubmitResult" ? "201" : "200"]: output
      ? response(output)
      : { description: "Mutation and audit committed." },
    "401": failure("A valid session is required"),
    "404": failure("Unavailable or private subject"),
    "409": failure(
      "Version, request identity or New York avatar-date conflict",
    ),
    "422": failure("Strict input validation failed"),
    "503": failure("Service unavailable; no success is claimed"),
  },
});
const routes: readonly [
  string,
  string,
  string,
  string | null,
  string | null,
  boolean,
  (boolean | "collection" | "discussion" | "discovery")?,
][] = [
  [
    "/v1/community/discover",
    "get",
    "discoverContent",
    "DiscoveryPage",
    null,
    false,
    "discovery",
  ],
  [
    "/v1/community/filter-options",
    "get",
    "readInscriptionFilterOptions",
    "InscriptionFilterOptions",
    null,
    false,
  ],
  [
    "/v1/community/content/{type}/{id}/card",
    "get",
    "readContentCard",
    "ContentCard",
    null,
    false,
  ],
  [
    "/v1/community/content/{type}/{id}/state",
    "get",
    "readOwnContentState",
    "ContentState",
    null,
    true,
  ],
  [
    "/v1/community/authors/{authorId}/favorites",
    "get",
    "readAuthorFavorites",
    "ContentCollectionPage",
    null,
    false,
    "collection",
  ],
  [
    "/v1/community/authors/{authorId}/likes",
    "get",
    "readAuthorLikes",
    "ContentCollectionPage",
    null,
    false,
    "collection",
  ],
  [
    "/v1/community/discussion/{type}/{id}",
    "get",
    "readDiscussion",
    "DiscussionPage",
    null,
    false,
    "discussion",
  ],
  [
    "/v1/community/discussion/{type}/{id}",
    "post",
    "submitDiscussion",
    "DiscussionSubmitResult",
    "CreateCatalogCommentRequest",
    true,
  ],
  [
    "/v1/community/discussion/{type}/{id}/replies/{rootId}",
    "get",
    "readDiscussionReplies",
    "DiscussionReplyPage",
    null,
    false,
    true,
  ],
  [
    "/v1/community/discussion/{type}/{id}/replies/{rootId}",
    "post",
    "submitDiscussionReply",
    "DiscussionSubmitResult",
    "CreateCatalogCommentReplyRequest",
    true,
  ],
  [
    "/v1/community/discussion/{type}/{id}/locate/{commentId}",
    "get",
    "locateOwnDiscussion",
    "DiscussionLocation",
    null,
    true,
    "discussion",
  ],
  [
    "/v1/community/discussion/items/{commentId}/like",
    "post",
    "setCommentLike",
    "SavedResult",
    "CommentLikeUpdate",
    true,
  ],
  [
    "/v1/community/discussion/items/{commentId}/body",
    "delete",
    "deleteOwnCommentBody",
    "DeletedResult",
    "RequestIdentity",
    true,
  ],
  [
    "/v1/community/me/comments",
    "get",
    "readOwnComments",
    "OwnCommentPage",
    null,
    true,
    true,
  ],

  [
    "/v1/community/authors/{authorId}",
    "get",
    "readAuthor",
    "AuthorProfile",
    null,
    false,
  ],
  [
    "/v1/community/authors/{authorId}/works",
    "get",
    "readAuthorWorks",
    "WorkPage",
    null,
    false,
    true,
  ],
  [
    "/v1/community/authors/{authorId}/following",
    "get",
    "readFollowing",
    "AuthorPeoplePage",
    null,
    false,
    true,
  ],
  [
    "/v1/community/authors/{authorId}/followers",
    "get",
    "readFollowers",
    "AuthorPeoplePage",
    null,
    false,
    true,
  ],
  [
    "/v1/community/me/blocks",
    "get",
    "readOwnBlocks",
    "AuthorPeoplePage",
    null,
    true,
    true,
  ],
  [
    "/v1/community/me/profile",
    "post",
    "updateOwnProfile",
    "SavedResult",
    "ProfileUpdate",
    true,
  ],
  [
    "/v1/community/me/privacy",
    "post",
    "updateOwnPrivacy",
    "SavedResult",
    "PrivacyUpdate",
    true,
  ],
  [
    "/v1/community/me/avatar",
    "post",
    "changeOwnAvatar",
    "AvatarUpdateResult",
    "AvatarUpdate",
    true,
  ],
  [
    "/v1/community/relationships/follow",
    "post",
    "setFollowing",
    "SavedResult",
    "RelationshipUpdate",
    true,
  ],
  [
    "/v1/community/relationships/block",
    "post",
    "setBlocking",
    "SavedResult",
    "RelationshipUpdate",
    true,
  ],
  [
    "/v1/community/content/favorite",
    "post",
    "setContentFavorite",
    "SavedResult",
    "ContentRelationUpdate",
    true,
  ],
  [
    "/v1/community/content/like",
    "post",
    "setContentLike",
    "SavedResult",
    "ContentRelationUpdate",
    true,
  ],
  [
    "/v1/community/favorites/merge",
    "post",
    "mergeGuestFavorites",
    "GuestFavoriteMergeResult",
    "GuestFavoriteMerge",
    true,
  ],
  [
    "/v1/community/works/{workId}",
    "get",
    "readExistingWork",
    "UserWork",
    null,
    false,
  ],
  [
    "/v1/community/works/{workId}",
    "delete",
    "deleteOwnWork",
    "DeletedResult",
    "RequestIdentity",
    true,
  ],
  [
    "/v1/community/works/{workId}/drafts",
    "get",
    "readOwnWorkDrafts",
    "WorkDraftPage",
    null,
    true,
    true,
  ],
  [
    "/v1/community/works/{workId}/drafts",
    "post",
    "saveOwnWorkDraft",
    "WorkDraftResult",
    "WorkDraftSave",
    true,
  ],
  [
    "/v1/community/works/{workId}/drafts/apply",
    "post",
    "applyOwnWorkDraft",
    "WorkApplyResult",
    "WorkDraftApply",
    true,
  ],
  [
    "/v1/community/works/{workId}/drafts/{draftId}",
    "delete",
    "discardOwnWorkDraft",
    "DiscardedResult",
    "RequestIdentity",
    true,
  ],
];
export const authorCommunityPaths: Record<string, Record<string, unknown>> = {};
for (const [path, method, name, output, input, privateOnly, list] of routes) {
  authorCommunityPaths[path] ??= {};
  authorCommunityPaths[path][method] = operation(
    name,
    path,
    output,
    input,
    privateOnly,
    list,
  );
}
authorCommunityPaths["/v1/community/media"] = {
  post: {
    ...operation(
      "uploadOwnedMedia",
      "/v1/community/media",
      "AuthorMedia",
      null,
      true,
    ),
    parameters: [
      {
        name: "x-request-id",
        in: "header",
        required: true,
        schema: { type: "string", format: "uuid" },
        description:
          "Stable upload request identity; a replay with different bytes conflicts.",
      },
      {
        name: "x-author-account",
        in: "header",
        required: false,
        schema: { type: "string" },
      },
    ],
    requestBody: {
      required: true,
      content: {
        "image/png": {
          schema: {
            type: "string",
            format: "binary",
            description:
              "Bounded RGB/RGBA PNG, at most 4 MiB, 8192 pixels per dimension and 16 megapixels.",
          },
        },
      },
    },
    responses: {
      "201": response("AuthorMedia"),
      "401": failure("Authentication required"),
      "409": failure("Upload identity reused with different bytes"),
      "422": failure("Invalid or oversized PNG"),
      "503": failure("Service unavailable"),
    },
  },
};
authorCommunityPaths["/v1/community/media/{mediaId}"] = {
  get: {
    ...operation(
      "readEligibleOwnedMedia",
      "/v1/community/media/{mediaId}",
      null,
      null,
      false,
    ),
    responses: {
      "200": {
        description: "Authorized PNG; private, no-store.",
        content: {
          "image/png": { schema: { type: "string", format: "binary" } },
        },
      },
      "401": failure("Invalid credential"),
      "404": failure("Unavailable media"),
      "503": failure("Service unavailable"),
    },
  },
};
