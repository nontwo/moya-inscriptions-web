# Owner Amendment — Community V1 scope and architecture

- Status: Proposed — pending Owner approval. Binds nothing until the Owner
  records approval; Mission 2A may not start before then.
- Effective date: the date the Owner records approval (drafted 2026-09-11).
- Authority: explicit Owner "Community V1 scope decision" instruction of
  2026-09-11 (Mission 1 of the Community sequence).
- Applies to: public-user identity; authentication and session ownership; the
  Comment V1 model, its API boundary and its minimum moderation; the integration
  boundary with Draft PR #106; the frozen Mission 2A / 2B / 2C sequence.

This amendment freezes scope and architecture. It implements nothing: no table,
migration, endpoint, route, session, provider or moderation surface. The only
code in Mission 1 is the freeze guard in section 9. Every later mission still
freezes its own Scope, non-goals, Behavior Matrix and Plan and passes
independent review and the applicable Owner gates.

## Current state this amendment starts from

Written against `origin/main` `d926926da7a9ec86a655c95108735efccfc741ea` (#108)
and PR #106 at head `638c0b768994b7646343d4325e77d9e77cddd491`.

- The repository has no public-user, session, comment or moderation table,
  migration, Contract, endpoint, route handler, client module or environment
  variable. `APP_DATABASE_URL` is reserved in documentation only
  (`docs/architecture.md`, `docs/development.md`, `infra/production/README.md`).
- The only authenticated identity is Payload `users` (`apps/admin/src/users.ts`:
  `role: owner | automation`, `scopeCatalogIds`, `payload-token` cookie). Admin
  access is Owner-only.
- The Backend HTTP surface is `GET /health`, `GET /v1/catalog`,
  `GET /v1/catalog/{catalogId}` and `GET /v1/catalog-search`. Web reaches it
  only through `apps/web/lib/public-api` server modules, from the allowlisted
  request-render loader and from the same-origin route handlers under
  `apps/web/app/api/catalog` and `apps/web/app/api/catalog-search`.
  `infra/production/nginx/yoyi.conf.template` proxies `/api/` to Payload and
  only `/api/catalog`, `/api/catalog/` and `/api/catalog-search` to Web.
- `packages/contracts` exports `.`, `./types`, `./schemas`, `./json-schema`,
  `./internal/catalog-import` and `./internal/editorial`; `ApiErrorCode` is
  exactly
  `INVALID_QUERY | ITEM_NOT_FOUND | SERVICE_UNAVAILABLE | INTERNAL_ERROR`.
  Migrations are append-only and `scripts/migrate.mjs` accepts exactly
  `MOYA_CONTENT_SOURCE=legacy | payload`.
- PR #106 (`codex/comment-feature-main`, Draft, QA-only) adds
  `apps/web/features/comments/` and the seam
  `T02pProductPreview.renderCommentSection?(catalogId)` →
  `PreviewCatalogDetailOverlay.commentSection` →
  `CatalogDetailExperience.commentSection` →
  `CatalogDetailScreen.commentSection` (rendered through
  `CatalogDetailContentPager.comments` on phone and tablet-portrait, the
  landscape aside on tablet-landscape, inline otherwise) → `CommentSection`,
  wired only inside the QA harness (`/dev/t02p/qa`) from `useQaCommentStore`
  fixtures. Its own E2E asserts that the Formal compositions render no comment
  section. It is pending Owner real-device visual acceptance and is not
  redesigned here.

## Rule classification

- MODERNIZE Constitution §6 and React current-authority amendment §4 (general
  deferral of unapproved domains) and Constitution §19, which requires each
  social domain to have its own approved Scope, Behavior Matrix and
  contract/domain evolution: public-user identity, sessions and Catalog comments
  become one approved bounded domain, Community V1, implementable only through
  Missions 2A → 2B → 2C below. The "Phase 3 / not part of this work" wording in
  `docs/architecture.md`, `docs/development.md` and `infra/production/README.md`
  is superseded for this domain; the mission that implements each part updates
  those documents. Every other social capability stays deferred.
- PRESERVE ADR 0006 §6 (Official Catalog、UGC 与 media — the accepted statement
  of the fact boundary first recorded in the now-superseded ADR 0003 as
  `CatalogRecord != CommunityPost != Product / Order`): a comment references a
  `CatalogId`; no shared content base class; `CatalogSummary`, `CatalogDetail`
  and Search DTOs gain no comment or user field. Its rule that user submissions
  pass moderation and a platform publication decision before association with a
  Catalog Entity stands until the Owner decides publication policy (decision 1);
  this amendment does not relax it.
- PRESERVE ADR 0010, the P2-04 amendment and the `docs/architecture.md` role
  statement ("Payload users serve Owner/automation only"): Payload users remain
  Owner/automation identities; no public CMS management API; no second editable
  content master; the CMS runtime role receives no community privilege.
- PRESERVE Constitution §1, §3, §4, §5, §7, §17 and the React current-authority
  amendment: one Detail implementation; QA fixtures stay semantically distinct
  and never enter PostgreSQL, Public API or Contracts; PostgreSQL → Public API →
  Web data authority; no frontend PostgreSQL; Contracts only in
  `packages/contracts`; append-only migrations; separate database roles;
  machine-verified review; Owner visual gates; separate Production authority.
- RETIRE: none.

## 1. Public-user identity

```text
PublicUser
  id           PublicUserId — opaque, platform-generated, immutable; never a
               provider id, phone, e-mail, handle, Payload row id or serial
  handle       unique, normalized, bounded, no whitespace (policy: decision 3)
  displayName  bounded plain text; the rendered author name (source: decision 3)
  avatar       optional internal reference; no source in V1
  bio          optional bounded plain text
  status       active | suspended
  createdAt / updatedAt
```

```text
PublicUserId != Payload users.id != CatalogId != SourceId != MediaId
Public product user != Payload Admin / Operator
```

- Payload `users` keep exactly `owner | automation`. Payload Admin accounts
  never become ordinary public-user accounts; public users never obtain Admin,
  REST, MCP or CMS Local API access. No shared cookie, secret, table, schema or
  database login. No Payload collection references a `PublicUser`, and the
  PublicUser table references no Payload user.
- Public users are Backend-owned rows in the community namespace (section 2),
  never a Payload collection and never reached through `CMS_DATABASE_URL`.
- Public DTOs: `PublicUserProfile { id, handle, displayName, bio? }` returned
  only to the session owner; `CommentAuthor { id, displayName }` embedded in
  comments (no avatar in any V1 DTO: Mission 2C maps `avatarSrc: null` so PR
  #106 renders its initial-glyph fallback; avatar exposure joins decision 5).
  `status`, timestamps and credential linkage never appear in a Public DTO.
  `PublicUser` carries no credential material; credential bindings are
  introduced only by an Owner-authorized provider task.
- QA identities (`qa-user-01` / 访碑者 and the fixture comment authors) remain
  presentation fixtures: never a fallback for a missing session, never bound to
  a `PublicUserId`, never in PostgreSQL.
- V1 has no public profile page, profile editing or handle-change flow.

## 2. Authentication and session ownership

The Backend owns authentication and session state: it alone creates, validates,
revokes and stores sessions as server-side records in the community namespace.
Web owns exactly two things: one browser cookie carrying an opaque session
reference and the same-origin route handlers that forward it. Web never mints,
signs, decodes or validates a session and holds no signing secret. Admin owns
nothing here: `payload-token` is never forwarded to the Backend and a public
session credential is never forwarded to `CMS_INTERNAL_URL`.

```text
Browser ── one HttpOnly cookie ──▶ Web route handler ── bearer credential ──▶
Backend ── session lookup in the community namespace ──▶ PublicUserId | 401
```

- Cookie: dedicated name distinct from `payload-token`; `HttpOnly`; never
  readable by browser JavaScript, never in `localStorage` or a URL. Remaining
  cookie attributes are Mission 2A Plan decisions.
- Web → Backend: the route handler reads the cookie from the incoming request
  and passes it explicitly to an `apps/web/lib/public-api` server function (the
  existing `fetchEditorialPreview(id, { session })` pattern).
- Backend: sessions are opaque server-side records validated on every request;
  Web-asserted identity headers are never trusted. Token storage, expiry and
  revocation mechanics are Mission 2A Plan decisions.
- Providers: none is chosen or integrated — no WeChat login, SMS, e-mail
  delivery, Apple/Google OAuth, CAPTCHA, passwords or password reset. Whether
  the Backend exposes a credential-verification seam before a provider exists,
  and how Development obtains a session, is decision 2. Production has no
  sign-in path until a provider is separately authorized.

Database domain and role:

- `APP_DATABASE_URL` is the Community runtime role: DML-only, read at runtime
  only by the `services/backend-production` composition root. No other workspace
  reads it (freeze row 5 walks `apps`, `services`, `packages` and `scripts`).
  The Payload runtime role and the Public read role receive no privilege on
  community relations.
- Community relations (public users, sessions, comments, moderation state) live
  in their own PostgreSQL schema namespace, never among Catalog relations in
  `public`. No cross-family foreign key; a write requires a currently published
  Catalog record, checked by a mechanism decided in the 2B Plan.
- Community migrations are a Backend-owned append-only family separate from
  `legacy` and `payload`, never selected by `MOYA_CONTENT_SOURCE`, applied only
  through the explicit migration command with migration-privileged credentials;
  startup never performs DDL. Directory, selector and whether a separate
  backend-only adapter workspace is needed at all are Mission 2A Plan decisions.
- Sessions, tokens and public-user rows never enter logs, Public responses,
  Contracts, QA fixtures, importer input or workbooks.

## 3. Comment V1 model

```text
CatalogComment
  id            CatalogCommentId — opaque, platform-generated
  catalogId     CatalogId of a currently published Catalog record
  author        PublicUserId
  text          plain text; trimmed; bounded length fixed by the 2B Contract
                review and enforced by the Backend
  createdAt     ISO 8601 UTC
  moderation    visible | hidden (decision 1 may add pending)
  replies       CatalogCommentReply[] — exactly one level, no children

CatalogCommentReply
  id, rootCommentId, author, text, createdAt, moderation   as above
  replyTo       optional CommentAuthor (PR #106's 回复 X： pointer)
```

- Reply depth is one. A reply belongs to one root comment and never has
  children; an answer to a reply is a sibling reply under the same root carrying
  `replyTo`. No nested trees. The bound on replies per root is decision 6.
- Ordering is server-defined and deterministic, fixed by the 2B Contract review
  together with the text bound; Web renders the page in server order. The
  `isQaGenerated` partition and the 热门/最新 reversal in PR #106's
  `CommentSection.sortedItems` are QA-only ordering inputs that Mission 2C
  removes or renders inert under prop narrowing; decision 5 governs only whether
  the sort control remains visible.
- Public reads return `visible` items only; a hidden root hides its replies;
  nothing is deleted; moderation state never appears in Public DTOs.
- `text` is plain text: no rich text, mentions, links, media, stickers or
  attachments. Whether the composer mirrors the text bound is a 2C Behavior
  Matrix row under the visual gate. PR #106's `CommentMediaPresentation`,
  `likeCount`, `liked`, `isQaGenerated` and `createdAtLabel` are presentation
  fields, not Contract fields.
- Comments never alter Catalog facts, never enter Catalog DTOs, importer,
  workbook, CMS or Search V1; no comment count is added to Catalog DTOs.

Public DTOs: `CommentAuthor`,
`CatalogComment { id, catalogId, author, text, createdAt, replies }`,
`CatalogCommentReply { id, author, text, createdAt, replyTo? }`,
`CatalogCommentPage` (the `CatalogPage` shape and invariants).

## 4. API boundary and minimum contract surface

```text
Browser → Next.js Web
  → same-origin /api/* route handler → apps/web/lib/public-api server module
  → Backend /v1/* (services/backend-runtime) → services/api community module
  → community PostgreSQL adapter (App role) → PostgreSQL
```

Web never queries PostgreSQL, never imports backend, adapter or CMS modules, and
performs business HTTP only inside `apps/web/lib/public-api`.

The complete Community V1 contract surface is the four operations the Owner
named. No mission adds an operation without a further amendment.

| Operation        | Backend endpoint                                            | Auth      | Result                       |
| ---------------- | ----------------------------------------------------------- | --------- | ---------------------------- |
| Read comments    | `GET /v1/catalog/{catalogId}/comments?page&pageSize`        | anonymous | `CatalogCommentPage`         |
| Create comment   | `POST /v1/catalog/{catalogId}/comments`                     | session   | `201 CatalogComment`         |
| Create reply     | `POST /v1/catalog/{catalogId}/comments/{commentId}/replies` | session   | `201 CatalogCommentReply`    |
| Current identity | `GET /v1/me`                                                | session   | `PublicUserProfile` or `401` |

- Session establishment and termination are not Community V1 contract
  operations. They arrive with the provider decision (decision 7); how
  Development obtains a session before then is decision 2. Neither is
  pre-authorized here.
- Same-origin Web routes: comments under `/api/catalog/{catalogId}/comments`
  (already routed to Web by `location ^~ /api/catalog/`); identity under
  `/api/community/me`. Mission 2A adds exactly one Nginx line routing
  `/api/community/` to Web and a current-truth assertion that it never routes to
  Admin.
- Transport pattern: each operation follows the existing `catalog-search`
  route-handler → `apps/web/lib/public-api` server-function → browser-client
  pattern; every new route, server function, client module and importer gets an
  explicit allowlist entry in `tests/unit/architecture/workspace-scanner.ts`,
  and each client-consumed DTO name is added to `allowedClientContractTypes` by
  the mission that first consumes it in a Client Component; nothing by wildcard.
  File layout is a Plan decision of the mission that adds it.
- Public DTOs are added to `packages/contracts` (`schemas.ts`, `types.ts`,
  `index.ts`, `json-schema.ts`) and to the OpenAPI document by the mission that
  introduces each name. No server-only Community contract subpath is
  pre-authorized; if decision 4 requires a cross-workspace moderation shape,
  Mission 2B adds it on an internal subpath and updates freeze row 1 in the same
  PR.
- `ApiErrorCode` gains exactly `UNAUTHENTICATED` (401; Mission 2A) and
  `INVALID_INPUT` (rejected body; Mission 2B). Unknown or unpublished
  `catalogId`, and unknown or hidden root comment, return `404 ITEM_NOT_FOUND`.
  Public responses never expose SQL rows, driver errors, session tokens,
  moderation records, hidden content or `status`.
- No new environment variable enters `apps/web` for Community.

## 5. Moderation minimum

```text
Comment   visible ⇄ hidden        (hide / unhide; decision 1 may add pending)
User      active ⇄ suspended      (suspend / reinstate)
```

- The Owner is the only V1 moderator; `automation` never moderates. Each
  moderation action records who and when; the record shape is a 2B Plan
  decision. The operator label is never a `PublicUserId` and never a Payload row
  id reused as public identity.
- Suspension revokes the user's sessions and refuses new writes; it changes no
  comment's moderation state. A suspended author's `visible` comments stay
  readable until hidden individually.
- The Backend is the sole writer of community data, including moderation. Admin
  may act only as a client of the Backend: Payload holds no comment or
  public-user collection and the CMS runtime role has no community grants.
  Whether the operator surface is a Backend-owned controlled command or an Admin
  view calling an operator-authenticated Backend seam is decision 4.
- Publication policy (publish-on-create with Owner hide, or pre-moderation with
  a `pending` state) is decision 1; until decided, ADR 0006 §6 stands.
- No AI moderation, trust scores, reputation, strikes, moderator hierarchies,
  large review queues, keyword engines or user reporting.

## 6. Relationship to PR #106

- PR #106 is the accepted presentation direction only after the Owner records
  real-device visual acceptance for its exact reviewed head. A conflict-free
  rebase onto `main` that changes no file under `apps/web/features/comments/`,
  `apps/web/features/detail/` or `apps/web/features/product-preview/` keeps that
  acceptance; any other change re-opens the visual gate. This amendment neither
  accepts nor redesigns it, and no mission may alter its Detail, comment section
  or composer to ease implementation (Constitution §17.4). Missions 2A and 2B do
  not depend on it; Mission 2C requires it accepted and merged.
- Mission 2C replaces only the data seam:

```text
today:   QA fixtures → useQaCommentStore → CommentSection → Catalog Detail
future:  Backend API → same-origin route → real comment client → CommentSection → Catalog Detail
```

A one-way mapper from `CatalogComment*` DTOs to the #106 presentation types
lives beside the loader; presentation types never feed persistence, Contracts or
the API. Allowed `CommentSection` changes are limited to replacing QA-only
inputs with contract-derived props, re-deriving the existing loading skeleton
from the real client instead of the QA `scenario` prop, and adding the truthful
signed-out and unavailable states, each frozen in the Mission 2C Behavior Matrix
under the Owner visual gate. No other markup, layout, gesture, pager or composer
change; no second comment component; no second Detail.

- The Comment V1 contract carries no like, sort or media data. Whether the
  Formal Detail omits those #106 affordances, renders them inert, or gains them
  through a later bounded extension is decision 5. The image/sticker
  presentation does not authorize media upload, media fields or sticker packs in
  Community V1; it may remain QA-only.
- QA fixtures (`comment-scenarios.ts`, `useQaCommentStore`, `qaCurrentUser`) and
  the #106 tests are preserved for deterministic visual and E2E scenarios inside
  `/dev/t02p/qa`, available by default in Development. The Formal root and
  `/dev/t02p` compose the real client only and import no QA fixture, scenario or
  store.

## 7. Behavior Matrix ownership and Production exposure

Every mission freezes its own Behavior Matrix before implementation
(Constitution §7), covering only the surfaces it delivers: 2A `GET /v1/me`, the
cookie relay and `401`; 2B the three comment operations, `404` /
`INVALID_INPUT`, hidden filtering and moderation effects; 2C the Formal Detail
states (signed-out, empty, loading, unavailable, create and reply, session
expiry) under the Owner visual gate. No matrix row is frozen here.

Production exposure of any Community surface is not decided here: it requires
decision 7, Backend runtime configuration, the P2-R2 release gates and separate
Owner Production authority. Merged code alone enables nothing in Production.
`/dev/t02p/qa` keeps returning `404` in Production; its QA store, six scenarios
and `qaCurrentUser` stay available by default in Development; QA identities
never enter PostgreSQL, Contracts or the API.

## 8. Frozen Mission 2 sequence

```text
Mission 1   this amendment + freeze guard          — governance and one architecture test
Mission 2A  public-user identity + auth/session foundation         — one PR
Mission 2B  comment contract + PostgreSQL + API + moderation       — one PR
Mission 2C  connect the accepted #106 seam to the real Comment API — one PR
```

- 2A delivers: `PublicUser` and session persistence (community namespace,
  migration family, `APP_DATABASE_URL` role, local role and grant), Backend
  session validation, `GET /v1/me`, the Web cookie relay and
  `/api/community/me`, the Nginx line, `PublicUserId` / `PublicUserProfile`,
  `UNAUTHENTICATED`, OpenAPI, scanner allowlists and the guard updates listed in
  section 9. A credential-verification seam and any Development session
  issuance/termination are delivered only if decision 2 selects them; revocation
  arrives with its first trigger (2B suspension or the provider task). No
  comment table, endpoint or UI; no provider.
- 2B delivers: comment and moderation persistence, the community application
  module and ports, the three comment operations, `CatalogComment*` DTOs,
  `INVALID_INPUT`, OpenAPI, the same-origin comment route handlers, server
  functions and client seam, and the moderation surface chosen in decision 4. It
  changes no Formal root composition and no `CommentSection` code.
- 2C delivers: the real comment client, loader and DTO → presentation mapper,
  Formal root and `/dev/t02p` composition through the frozen seam,
  `CommentSection` prop narrowing, the signed-out and unavailable states, the
  approved Behavior Matrix, unit and E2E coverage, and Owner real-device
  acceptance. It adds no Contract, migration or Backend change.
- Each mission is an independently reviewable Draft PR from a fresh
  `origin/main`. The three stages are never combined; no mission pre-creates the
  next mission's tables, Contracts, routes or UI; 2B starts only after 2A is
  merged and verified at the merged head; 2C only after 2B is merged and PR #106
  is accepted and merged.

## 9. Freeze guard

Mission 1 adds one architecture test,
`tests/unit/architecture/community-v1-freeze.test.ts`, pinning six facts that
are true on `main` today. Each row names the only mission(s) allowed to change
it; each named mission replaces the row with the new exact value in the same PR
that changes it. Rows 3 and 5 overlap facts also pinned by
`tests/unit/backend/openapi-contract.test.ts` and
`tests/unit/backend/migration-routing.test.ts`, and the contracts export list is
pinned by `tests/unit/architecture/contracts-surface.test.ts`; the mission that
changes a row updates those existing tests in the same PR. The guard pins
nothing else: what each mission may add or change is bounded by sections 4 and
8, and no mission changes a pinned value except the mission named in its row.

| #   | Fact pinned today                                                                                                                                                                                      | Changed by                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 1   | `packages/contracts/src/internal` holds exactly `catalog-import`, `editorial`                                                                                                                          | 2B, only if decision 4 requires it; otherwise none |
| 2   | `apiErrorCodeSchema` lists exactly the four existing codes                                                                                                                                             | 2A (`UNAUTHENTICATED`), 2B (`INVALID_INPUT`)       |
| 3   | The Backend router matches exactly `/health`, `/v1/catalog`, `/v1/catalog-search` and one `/v1/catalog/{catalogId}` regex; no comment/community/me/session token                                       | 2A (`/v1/me`), 2B (comment paths)                  |
| 4   | `services/api/src/modules` is exactly `catalog`                                                                                                                                                        | 2A (`community`)                                   |
| 5   | `scripts/migrate.mjs` accepts only `legacy` / `payload` and contains no `community` or `APP_DATABASE_URL` token; `APP_DATABASE_URL` appears in no file under `apps`, `services`, `packages`, `scripts` | 2A                                                 |
| 6   | Payload `users` role values are exactly `owner`, `automation`                                                                                                                                          | none                                               |

## 10. Explicit non-goals

Community V1 does not include, and this amendment does not authorize: posts;
following; a social feed; direct messaging; notifications; user-uploaded media
(comment images, stickers, avatars); marketplace; payments; recommendations;
Redis; another database; Firebase; Supabase; a large authentication framework;
WeChat login, SMS, e-mail delivery, Apple/Google OAuth, CAPTCHA or
password-reset infrastructure; AI moderation, trust scores, reputation, strikes,
moderator hierarchies or large review queues; refactoring of unrelated code;
redesign of Catalog, Search, CMS, Detail or Viewer.

Deferred pending their own Owner decision: comment editing and author
self-deletion, persisted likes or reactions, user reporting, public profile
pages, profile or handle editing, comment counts on Catalog DTOs, nested reply
trees, rich text, mentions and links, account deletion and personal-information
erasure, and write rate limits or other anti-abuse controls beyond the text
bound and the reply bound (decision 6); V1 ships none.

## 11. Unresolved Owner decisions

Each is a STOP gate for the first mission that needs it. A noted smallest option
is not a decision.

1. Publication policy: publish-on-create with Owner hide (smallest; requires
   modernizing ADR 0006 §6 for Catalog comments) or pre-moderation with a
   `pending` state released only by the Owner (keeps ADR 0006 §6 unchanged).
2. Development sign-in before a provider exists: whether Mission 2A may ship a
   Development-only synthetic verifier and session issuance/termination under
   the existing `NODE_ENV=development` composition pattern (never composed in
   Production), or ships session validation only, exercised through
   test-inserted session rows.
3. Handle and display-name policy: user-chosen or assigned; normalization for
   case, full-width, CJK and reserved names; the source of `displayName` when no
   profile editing exists. Smallest: both assigned at creation (`displayName`
   defaults to `handle`), no change in V1.
4. Moderation operator surface: Backend-owned controlled command (smallest) or
   an Admin view calling an operator-authenticated Backend seam (needs a new
   internal credential and trust channel).
5. #106 like, 热门/最新 sort, media and avatar affordances in the Formal Detail
   after 2C: omit, render inert, or a later bounded extension (visual gate).
6. Reply bound per root comment: a write-time maximum refused as `INVALID_INPUT`
   (smallest; no new `ApiErrorCode`) or a separate paged replies read (a fifth
   operation, further amendment).
7. Production exposure and provider: which credential/provider task follows
   Mission 2A; whether Community may reach Production read-only (comments
   visible, no sign-in) before a provider exists; and any 实名, filing
   or 举报 requirement that gates Production UGC.

Historical decisions remain unchanged and are interpreted under this amendment.
This amendment records proposed authorization and boundaries, not completion or
Production approval.
