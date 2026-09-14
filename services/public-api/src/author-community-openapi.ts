/** Phase 4 and work publishing application routes. Composition remains Development-only. */
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
const opaquePathPrefixes: Record<string, string> = {
  workId: "work",
  draftId: "work-draft",
  itemId: "media-item",
  componentId: "media-component",
  sessionId: "publishing-session",
};
const pathSchema = (name: string) => {
  if (name === "type") return { type: "string", enum: ["catalog", "work"] };
  if (name === "commentId" || name === "rootId")
    return reference("CatalogCommentId");
  if (name === "authorId") return reference("PublicUserId");
  const opaque = opaquePathPrefixes[name];
  if (opaque !== undefined)
    return { type: "string", pattern: `^${opaque}-[0-9a-f]{32}$` };
  if (name === "requestId") return { type: "string", format: "uuid" };
  if (name === "role")
    return { type: "string", enum: ["still", "motion", "package"] };
  if (name === "variant")
    return {
      type: "string",
      enum: ["thumb", "display", "full", "motion", "cover"],
    };
  if (name === "editKey")
    return { type: "string", pattern: "^(?:base|[0-9a-f]{32})$" };
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
    "Phase 4 Development only; absent in Production. Optional sessions personalize eligibility; malformed supplied credentials reject. All reads are private, no-store with Vary: Authorization. Unknown or duplicate query fields reject. JSON writes accept no query. RequestIdentity commands are replay-safe for their actor; comment submissions do not have a replay receipt. Removing an own work moves it to the recycle bin.",
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
    "moveOwnWorkToTrash",
    "DeletedResult",
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

const publishingDescription =
  "Work publishing, Development only; absent in Production. Requires the session credential; responses are private, no-store with Vary: Authorization. Commands require x-author-account equal to the session account and accept no query; list reads accept only page and pageSize, and other reads accept no query. A rule rejection answers INVALID_INPUT whose message is the rule code; a stale state answers CONFLICT; a conflicting draft save answers 200 with status conflict and keeps both versions. RequestIdentity commands are replay-safe for their actor.";
const publishingFailures = {
  "401": failure("A valid session is required"),
  "404": failure(
    "Unavailable, private, deleted or not owned subject; includes a late write to a deleted draft",
  ),
  "409": failure(
    "Stale state (for example a draft already submitted or an ended session), or a request identity reused with different content",
  ),
  "422": failure(
    "Strict input validation failed or a publishing rule rejected the command; the message carries the rule code",
  ),
  "503": failure("Service or media unavailable; no success is claimed"),
};
const accountAssertion = {
  name: "x-author-account",
  in: "header",
  required: true,
  description:
    "The authenticated account; a missing or different account rejects. Does not authorize a request.",
  schema: { type: "string", pattern: "^user-[0-9a-f]{32}$" },
};
interface PublishingOperationOptions {
  readonly list?: boolean;
  readonly created?: boolean;
  /** Replaces the generic CONFLICT description. */
  readonly conflict?: string;
}
const publishingOperation = (
  name: string,
  path: string,
  output: string,
  input: string | null,
  options: PublishingOperationOptions = {},
) => {
  const base = operation(name, path, output, input, true, options.list);
  return {
    ...base,
    description: publishingDescription,
    parameters: base.parameters.map((parameter) =>
      parameter?.name === "x-author-account" ? accountAssertion : parameter,
    ),
    responses: {
      [options.created ? "201" : "200"]: response(output),
      ...publishingFailures,
      ...(options.conflict === undefined
        ? {}
        : { "409": failure(options.conflict) }),
    },
  };
};
const publishingRoutes: readonly [
  string,
  string,
  string,
  string,
  string | null,
  PublishingOperationOptions?,
][] = [
  [
    "/v1/community/publishing/limits",
    "get",
    "readPublishingLimits",
    "PublishingLimits",
    null,
  ],
  [
    "/v1/community/publishing/drafts",
    "post",
    "createPublishingDraft",
    "PublishingDraft",
    "CreatePublishingDraftCommand",
    { created: true },
  ],
  [
    "/v1/community/publishing/drafts",
    "get",
    "listPublishingDrafts",
    "PublishingDraftPage",
    null,
    { list: true },
  ],
  [
    "/v1/community/publishing/drafts/{draftId}",
    "get",
    "readPublishingDraft",
    "PublishingDraft",
    null,
  ],
  [
    "/v1/community/publishing/drafts/{draftId}",
    "delete",
    "deletePublishingDraft",
    "PublishingDraftDeletionResult",
    "PublishingDraftDeletionCommand",
    {
      conflict:
        "The draft revision differs from the confirmed expectedRevision (message draft_changed; nothing was deleted; a conflict copy saved on an outdated base does not change the revision), the draft is no longer active, or a request identity was reused with different content",
    },
  ],
  [
    "/v1/community/publishing/drafts/{draftId}/save",
    "post",
    "savePublishingDraft",
    "PublishingDraftSaveResult",
    "SavePublishingDraftCommand",
  ],
  [
    "/v1/community/publishing/drafts/{draftId}/snapshot",
    "post",
    "savePublishingDraftNow",
    "PublishingDraftSaveResult",
    "SavePublishingDraftCommand",
  ],
  [
    "/v1/community/publishing/drafts/{draftId}/history",
    "get",
    "readPublishingDraftHistory",
    "PublishingSnapshotPage",
    null,
    { list: true },
  ],
  [
    "/v1/community/publishing/drafts/{draftId}/restore",
    "post",
    "restorePublishingSnapshot",
    "PublishingDraft",
    "RestorePublishingSnapshotCommand",
  ],
  [
    "/v1/community/publishing/drafts/{draftId}/resolve",
    "post",
    "resolvePublishingConflict",
    "PublishingDraft",
    "ResolvePublishingConflictCommand",
  ],
  [
    "/v1/community/publishing/works/{workId}/draft",
    "post",
    "openWorkEditDraft",
    "PublishingDraft",
    "OpenWorkEditDraftCommand",
  ],
  [
    "/v1/community/publishing/works/{workId}/editable",
    "get",
    "readEditableWork",
    "EditableWork",
    null,
  ],
  [
    "/v1/community/publishing/works/{workId}/visibility",
    "post",
    "setWorkVisibility",
    "WorkVisibilityResult",
    "WorkVisibilityCommand",
  ],
  [
    "/v1/community/publishing/sessions",
    "post",
    "createPublishingSession",
    "PublishingSession",
    "CreatePublishingSessionCommand",
    { created: true },
  ],
  [
    "/v1/community/publishing/sessions/{sessionId}/heartbeat",
    "post",
    "renewPublishingSession",
    "PublishingSession",
    "PublishingSessionHeartbeatCommand",
  ],
  [
    "/v1/community/publishing/sessions/{sessionId}/discard",
    "post",
    "discardPublishingSession",
    "DiscardedResult",
    "RequestIdentity",
  ],
  [
    "/v1/community/publishing/items",
    "post",
    "registerMediaItem",
    "PublishingMediaItem",
    "RegisterMediaItemCommand",
    { created: true },
  ],
  [
    "/v1/community/publishing/items/{itemId}",
    "get",
    "readMediaItem",
    "PublishingMediaItem",
    null,
  ],
  [
    "/v1/community/publishing/items/{itemId}/cancel",
    "post",
    "cancelMediaItem",
    "PublishingMediaItem",
    "RequestIdentity",
  ],
  [
    "/v1/community/publishing/items/{itemId}/components/{role}/reset",
    "post",
    "resetMediaComponent",
    "PublishingMediaItem",
    "RequestIdentity",
  ],
  [
    "/v1/community/publishing/submissions",
    "post",
    "submitWork",
    "WorkSubmissionResult",
    "WorkSubmissionCommand",
  ],
  [
    "/v1/community/publishing/submissions/{requestId}",
    "get",
    "readWorkSubmissionReceipt",
    "WorkSubmissionReceipt",
    null,
  ],
  [
    "/v1/community/publishing/trash",
    "get",
    "listTrashedWorks",
    "TrashedWorkPage",
    null,
    { list: true },
  ],
  [
    "/v1/community/publishing/trash/{workId}/restore",
    "post",
    "restoreTrashedWork",
    "TrashRestoreResult",
    "RequestIdentity",
  ],
];
// Moving an own work to the recycle bin is a publishing command: the account
// assertion is required like on every other publishing command.
const trashOperation = authorCommunityPaths["/v1/community/works/{workId}"]!
  .delete as { readonly parameters: readonly { readonly name?: string }[] };
authorCommunityPaths["/v1/community/works/{workId}"]!.delete = {
  ...trashOperation,
  parameters: trashOperation.parameters.map((parameter) =>
    parameter.name === "x-author-account" ? accountAssertion : parameter,
  ),
};
for (const [path, method, name, output, input, options] of publishingRoutes) {
  authorCommunityPaths[path] ??= {};
  authorCommunityPaths[path][method] = publishingOperation(
    name,
    path,
    output,
    input,
    options,
  );
}
authorCommunityPaths["/v1/community/publishing/uploads/{componentId}"] = {
  post: {
    ...publishingOperation(
      "uploadMediaComponent",
      "/v1/community/publishing/uploads/{componentId}",
      "PublishingUploadResult",
      null,
    ),
    description:
      "Work publishing, Development only. One registered media component as a raw byte stream behind an attempt fence: content-length is required and must equal the declared component bytes, and the server checksum is authoritative. No automatic retry: a new attempt follows an explicit component reset. A cancelled or superseded attempt answers CONFLICT and stores nothing. A refusal (including an invalid session or account assertion) may be answered while bytes are still arriving: the answer does not announce a connection close; the server reads on and discards bytes until the body ends or a few seconds passed, and only then closes the connection, so a client that keeps sending longer sees the connection close after the answer. A transfer that delivers no bytes for two minutes is closed without an answer. Private, no-store.",
    parameters: [
      {
        name: "componentId",
        in: "path",
        required: true,
        schema: pathSchema("componentId"),
      },
      accountAssertion,
      {
        name: "x-upload-attempt",
        in: "header",
        required: true,
        description:
          "UUID of this transfer attempt; a later attempt supersedes it.",
        schema: { type: "string", format: "uuid" },
      },
      {
        name: "content-length",
        in: "header",
        required: true,
        description: "Exactly the declared component bytes.",
        schema: { type: "integer", minimum: 1 },
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/octet-stream": {
          schema: { type: "string", format: "binary" },
        },
      },
    },
    responses: {
      "200": response("PublishingUploadResult"),
      ...publishingFailures,
      "409": failure(
        "The transfer was cancelled or superseded, or another transfer of the component is in progress; nothing was stored",
      ),
      "413": failure("More bytes than the declared component size"),
      "422": failure(
        "Missing or invalid transfer headers, a length other than the declared size, or fewer bytes than declared",
      ),
    },
  },
};
authorCommunityPaths[
  "/v1/community/publishing/media/{itemId}/{variant}/{editKey}"
] = {
  get: {
    ...operation(
      "readPublishingMedia",
      "/v1/community/publishing/media/{itemId}/{variant}/{editKey}",
      null,
      null,
      false,
    ),
    description:
      "Work publishing, Development only. One derivative of a media item for its edit key; sources and originals are never addressable. The owner reads its own items; anyone else only derivatives of an eligible public work. Supports one byte range; a Range header with another unit or several ranges is ignored and the whole derivative is sent. Accepts no query. Private, no-store with Vary: Authorization.",
    parameters: [
      ...["itemId", "variant", "editKey"].map((name) => ({
        name,
        in: "path",
        required: true,
        schema: pathSchema(name),
      })),
      {
        name: "range",
        in: "header",
        required: false,
        description:
          "One byte range: bytes=start-end, bytes=start- or bytes=-length. Other units and several ranges are ignored.",
        schema: { type: "string" },
      },
    ],
    responses: {
      "200": {
        description: "The whole derivative; private, no-store.",
        content: {
          "image/webp": { schema: { type: "string", format: "binary" } },
          "video/mp4": { schema: { type: "string", format: "binary" } },
        },
      },
      "206": {
        description: "The requested byte range with Content-Range.",
        content: {
          "image/webp": { schema: { type: "string", format: "binary" } },
          "video/mp4": { schema: { type: "string", format: "binary" } },
        },
      },
      "401": failure("Invalid credential"),
      "404": failure("Unavailable media"),
      "416": {
        description:
          "The byte range is malformed or outside the derivative; Content-Range names its length.",
      },
      "422": failure("A query string was supplied"),
      "503": failure("Service or media unavailable"),
    },
  },
};
