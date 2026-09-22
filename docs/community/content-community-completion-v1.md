# Content, Threads and Direct Messages — content-community-completion-v1

Task: `content-community-completion-v1` (r1), track C of the 2026-09-22 parallel
Community plan (A = `email-auth-v1`, N =
`messaging-notification-foundation-v1`). Base `origin/main`
`0a55227e750314930851d8c09c912498ff3a2e84` (PR #143 merged). Delivery stop: one
reviewed feature Draft PR plus, when the sibling candidates exist, one clearly
labeled QA-integration Draft for combined-head CI. No Ready transition,
auto-merge, merge to `main`, Issue closure, deployment, release, retained-data
mutation or paid service. Owner visual/device acceptance stays pending until
given. Authority: the Owner's coordinated assignment of 2026-09-22 recorded in
Issue #160; Draft PR #163; scope extension recorded in
[`2026-09-22 content, Threads and direct messages`](../governance/amendments/2026-09-22-content-community-completion-scope.md).

## 1. Coverage ledger at the start checkpoint (C0)

UI entry → same-origin route → contract → Backend operation → persistence →
readback → authorization → test. Evidence is the file as it exists on the base.

| Feature                                                              | Status on base                                                | Evidence                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| News / Specials (Articles, Collections)                              | PREVIEW ONLY                                                  | `apps/web/features/discussion-preview/preview-data.ts` (`previewArticles`, `previewSpecials`), `academic-reader.tsx` (`chaptersBySpecial`); no route, contract, table or Backend port; gate `NEXT_PUBLIC_MOYA_DISCUSSION_PREVIEW` in `apps/web/app/page.tsx` |
| Home 专题 (Catalog collection topics)                                | IMPLEMENTED (server data) / Production truthfully unavailable | `apps/web/features/topics/topic.ts`, `sources/home/home-sources.ts` `unavailableTopicsSource`                                                                                                                                                                |
| Threads (话题) list, detail, quick composer, read state, heat        | PREVIEW ONLY                                                  | `preview-data.ts` `previewTopics` (fixture heat), `preview-context.tsx` (`addPost`, `markRead`, browser-local images); no `community.threads`, no route                                                                                                      |
| Thread posts                                                         | PREVIEW ONLY                                                  | `PreviewPost` local state; no association to `community.works`                                                                                                                                                                                               |
| Work publishing / editing / deletion / visibility / media            | IMPLEMENTED                                                   | `WorkPublishingService`, `/v1/community/publishing/**`, `community.works*`, `media_*`, `publishing_jobs`; tests `work-publishing-*` suites                                                                                                                   |
| Catalog and Work discussion (root/reply, likes, delete body, locate) | IMPLEMENTED                                                   | `DiscussionPort`/`discussion-store.ts`; `target_type CHECK IN ('catalog','work')`; `apps/web/features/authors/discussion-section.tsx`                                                                                                                        |
| Article discussion                                                   | MISSING                                                       | no `article` target kind; `assertTarget` handles `catalog`/`work` only                                                                                                                                                                                       |
| Message center host, MyComments                                      | IMPLEMENTED (MyComments) / PREVIEW ONLY (rest)                | `message-center.tsx` real `MyComments`; 私信/点赞/收藏 tabs hard-coded empty; `message-preview.tsx` fixture conversations, `setMessages` fake send                                                                                                           |
| Direct messages                                                      | MISSING                                                       | no table, contract, route, component                                                                                                                                                                                                                         |
| AuthorProfile private-message action                                 | MISSING                                                       | `author-profile.tsx` actions: 关注, 屏蔽 only                                                                                                                                                                                                                |
| Notifications / activity inbox / SSE                                 | MISSING — owned by N                                          | not in this task                                                                                                                                                                                                                                             |
| Public login providers                                               | MISSING — owned by A                                          | not in this task                                                                                                                                                                                                                                             |
| Operator moderation of Threads / DMs                                 | MISSING                                                       | operator boundary `/internal/community/**` has comments, works, featured, publishing, agent only                                                                                                                                                             |
| Payload editorial approval / published views                         | IMPLEMENTED for `catalogs`                                    | `apps/admin/src/editorial/*`, `published/views.ts`; no Article collection                                                                                                                                                                                    |

## 2. Frozen scope

### Goal

Real Development software for: Payload editorial Articles and Article
Collections with governed published reads and Web News/Specials;
operator-created Threads over the existing Work domain with quick posting,
deterministic heat and per-user read state; Article discussion through the
existing root/reply model; one-to-one text direct messages with the request gate
and per-participant state; narrow Owner moderation for Threads and DMs;
contracts, migrations, private QA and the cross-track QA assembly.

### Non-goals (unchanged from the assignment)

Notifications, outbox, recipient derivation, inbox/read state, mention control,
SSE, activity panel, message-center host and exact-comment locator (N).
Authentication, providers, Sessions, account UI (A). Universal content registry,
`command_receipts` replacement, renaming `catalog_comments` /
`catalog_comment_replies` / `catalog_id`, `thread_posts` store, Article likes or
favorites, new Catalog kinds, comment images, nested replies, DM attachments,
editing, recall, groups, presence, typing, E2EE claims, push, live email/SMS,
Redis, vector search, ranking jobs in `publishing_jobs`, 180-day cleanup,
Production exposure, deployment, paid services, host/firewall/tunnel changes.

### Preserved behavior

Existing Catalog/Work comment API shapes and IDs; the general Work editor limits
(50 items, Live Photo playback); the accepted Home Catalog/Work mixing; existing
`page/pageSize/total` contracts; the three receipt tables and their scopes;
Payload `users` roles; App-role convergence and the `/yoyi_dev` guard; Agent
Administration and Agent Connection powers (none added); ProductShell, the
accepted AuthorProfile, the accepted Discussion/message-center presentation.

### Frozen V1 decisions (from the assignment)

1. One `articles` collection with `presentation: news | academic`; one
   `article-collections` collection with ordered typed members (Article or
   published Catalog record). Public ids `article-<32hex>` /
   `collection-<32hex>` are generated server-side and immutable; Payload row ids
   never leave the Admin. Editorial byline is display text; it is not a public
   user.
2. Article media reuses approved Catalog media through Catalog references (cover
   and image blocks name a published Catalog record); no new upload path, no
   remote URL, no raw HTML, no video. Unsupported media fails truthfully.
3. Public reads select only `_status = 'published'` rows through
   `WHERE … OFFSET 0` views granted `SELECT` to the public read role; the Owner
   publishes/withdraws natively; `automation` may only save drafts; publication
   by automation requires an exact-revision approval item in the sibling
   collection `editorial-article-approvals` (same Owner-only, revision and
   fingerprint rule as `editorial-approvals`), through the REST operations
   `save-article-draft`, `approve-article-batch` and `publish-approved-article`
   with replay-safe `editorial-receipts`. No new MCP tool is added; exposing
   these operations to MCP is a later Owner decision.
4. Thread = `community.threads` (operator-managed); Thread post = UserWork
   associated through `community.thread_works` (`work_id` UNIQUE → one Thread
   per Work, real FKs). No duplicated text/media/author/likes.
5. Quick composer: plain text + at most three static images through the existing
   publishing session/submission path; the association commits in the submission
   transaction and rechecks Thread eligibility at commit.
6. Heat: sum of `weight * 2^(-age_days / 7)` at a server snapshot (`anchor`)
   with new eligible Work 1, visible comment/reply 2, active like 1; ties by
   latest eligible activity then Thread id; anchor frozen per browsing sequence.
7. Read state:
   `community.thread_read_state(user_id, thread_id, observed_activity_at)`
   clamped to server-observed activity; title is unread again when latest
   visible activity exceeds the marker. Anonymous read state stays local.
8. Article discussion: `catalog_comments.target_type` gains `'article'`;
   `discussionTargetSchema = ContentIdentity ∪ {type:"article"}`; content
   relations keep `ContentIdentity` unchanged.
9. DMs: `community.dm_conversations` (unique normalized pair,
   `requested | active`), `dm_participants` (hidden, muted, read sequence),
   `dm_messages` (immutable, per-conversation sequence, removal by moderation
   only), `dm_command_receipts` (actor + request id). Sender from Session only.
   Request gate: one initial message per new pair, unlocked only by a committed
   non-empty recipient reply. Limits: 2,000 code points, 20 new pairs per UTC
   day, 20 accepted messages per minute. Foreground polling 10 s, no
   background-tab polling.
10. Moderation: Owner-only, explicitly selected conversation/message view
    through `/internal/community/messages/**`; remove message with audit; Thread
    create/edit/close/hide with version checks and audit. Bodies never in
    ordinary logs.

## 3. Behavior Matrix

| Scenario                 | Development / Owner QA                                                     | Production in this task                  | Must preserve                                         |
| ------------------------ | -------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| News/academic Article    | Real approved published read, chapters/citations and existing reader       | New entry/routes unavailable             | Draft exclusion, media privacy, gestures              |
| Collection               | Ordered typed eligible Article/Catalog members, truthful empty/error       | No new exposure                          | Stable identity/order and source provenance           |
| Editorial automation     | Existing scoped preparation/approval, only named collections               | Existing policy unchanged; no activation | Exact-revision Owner approval and machine permissions |
| Operator Thread creation | Real audited/versioned Admin → Backend operation                           | Disabled                                 | Existing operator identity and controls               |
| Thread posting           | UserWork + association; text and ≤3 quick-composer static images           | Disabled                                 | Existing Work quotas/revisions/likes/comments         |
| Thread read/heat         | Server facts, fixed ranking anchor, per-user observed marker               | Disabled                                 | No private activity/count leakage                     |
| Article comments         | Real shared root/reply discussion, current publication policy              | New target unavailable                   | Existing Catalog/Work behavior and comment IDs        |
| Article notification     | N's real source/recipient pipeline after joint integration                 | Disabled                                 | No fake owner, no duplicate inbox                     |
| DM first send            | One committed initial message; second refused until actual recipient reply | Disabled                                 | Concurrent/retry enforcement and block/suspension     |
| DM reply                 | Committed eligible reply activates same pair                               | Disabled                                 | No client/reading/following bypass                    |
| DM hide/mute/read        | Durable per-participant state, real UI and safe Undo                       | Disabled                                 | Other participant, history, monotonic observed state  |
| DM moderation            | Narrow Owner-only selected access/action with audit                        | No activation                            | Private text not exposed to public search/MCP         |
| Message center           | N-owned host receives C's real DM adapter; no fake sender                  | Existing behavior unchanged              | Accepted navigation and exact comment return          |
| Authentication           | Existing Development account path, then A integration                      | No new exposure                          | One PublicUserId/Session authority                    |
| Failure/withdrawal       | Truthful error or unavailable state; no fixture fallback                   | Truthful existing runtime                | Private drafts, parent visibility and media           |
| Combined QA              | Exact A/N/C SHAs, one independent synthetic stack                          | No deployment                            | Draft stops and separate Owner device acceptance      |

## 4. Approved paths (frozen file inventory)

- `apps/admin`: `src/editorial-content/**` (new: `articles.ts`,
  `article-collections.ts`, hooks, access, published views SQL),
  `src/editorial/collections.ts` (approval items for Articles),
  `src/editorial/operations.ts`, `endpoints.ts`, `index.ts`, `src/mcp.ts`
  (collection selection only), `src/migrations/**` (one new forward migration +
  index), `payload.config.ts`, `app/(payload)/admin/importMap.ts`,
  `src/payload-types.ts`, `src/community/**` (Thread and DM moderation views,
  endpoints, NavGroup links), `package.json` (one `./editorial-content` export
  entry; no dependency change).
- `services/api/src/modules/community/**` (new ports/services for Threads and
  direct messages, their `application/mappers/*-contract-mapper.ts`;
  `author-community-service.ts` `assertTarget`; `discussion-port.ts` target
  type), new `services/api/src/modules/editorial/**` (editorial content read
  port, service and mapper), `services/api/src/index.ts`.
- `services/catalog-postgres/src/**` (Article/Collection published-view reader
  and readiness), `services/community-postgres/src/**` (thread, thread read
  state, DM adapters; `migrations/manifest.ts`).
- `database/community-migrations/2026092203xxxx_*.sql` (append-only).
- `services/backend-runtime/src/**` (router branch, handlers),
  `services/backend-production/src/composition.ts` (composition only).
- `packages/contracts/src/**` (additive schemas/types/json-schema),
  `services/public-api/src/**`, `services/public-api/openapi/openapi.json`
  (regenerated).
- `infra/development/work-publishing/grant-runtime.sql` (one named C block),
  `infra/development/grant-public-read.sql` (SELECT on the five Article views),
  `infra/development/community-development-accounts.sql` unchanged.
- `apps/web`: new `features/editorial-content/**`, `features/threads/**`,
  `features/messages/**`; `lib/public-api/author-community-client.ts` and
  `work-publishing-client.ts` (clients; the existing
  `app/api/community/[...path]` relay carries `/v1/community/editorial/**`,
  `/threads/**` and `/messages/**`, so no new route file was added); narrow
  wiring in `features/home/discussion-screen.tsx`,
  `features/product-preview/t02p-product-preview.tsx`,
  `features/product-application/product-application.tsx`,
  `features/authors/message-center.tsx` (DM slot, badge sum, entry seam),
  `features/authors/author-profile.tsx` (one private-message action),
  `features/authors/discussion-section.tsx` and `local-library.ts` (target
  type), `features/discussion-preview/**` (data seam replacement only),
  `features/product-shell/product-shell.tsx` and `product-history.ts`
  (`threadId` on the editor target), `features/publishing/**` (Thread mode of
  the accepted editor: `publishing-runtime.ts`, `publishing-entry.tsx`,
  `ui/editor/editor-overlay.tsx`, `ui/media/media-section.tsx`),
  `features/qa/t02p-qa-harness.tsx` (provider stack for the real panels).
- Tests: `tests/unit/**`, `tests/integration/postgres/**`, `tests/cms/**`,
  `tests/e2e/**` as directly affected; exact allowlist entries in
  `tests/unit/architecture/workspace-scanner.ts`, `community-v1-freeze.test.ts`,
  `api-surface.test.ts`, `catalog-postgres-surface.test.ts`,
  `tests/unit/backend/openapi-contract.test.ts`,
  `tests/unit/backend/community-migrations.test.ts`.
- Docs: this file, the dated amendment and its `AGENTS.md` bullet,
  `docs/project-status.md`, `docs/development.md` (C profile notes).

Not touched: verification classifier/runner, CI, hooks, branch protection,
`apps/web/AGENTS.md` / `CLAUDE.md`, dependencies and lockfile,
`scripts/migrate*.mjs`.

## 5. Interface checkpoint with A and N

1. A (auth): C keeps using `CommunitySessionService.identify` /
   `readBearerToken` and Web `useAuthors()` (`viewer`, `checking`,
   `sessionError`, `signInHref`) until A's candidate is integrated.
2. N (notifications): C exposes, for N's producers, the Article visibility seam
   `ArticlePublicationPort.isPublished(articleId)` and the discussion target
   kind `article`; Thread posts are Works and inherit N's existing Work path. C
   does not enqueue notifications and adds no event table.
3. C supplies: `DirectMessagePanel` (feature module
   `apps/web/features/messages`) with a typed adapter
   `{ render(props), useUnreadConversationCount() }` that the message-center
   host mounts in the 私信 slot; DM unread unit = unread conversations, reported
   separately from N's activity count and added once.
4. Migration ranges: A `2026092201xxxx`, N `2026092202xxxx`, C `2026092203xxxx`;
   baseline ends at `20260921010000`. C allocates any integration range after
   all three. No Track builds on another's unmerged branch.

## 6. Slices and acceptance criteria

C1 Editorial — Owner creates, previews, publishes, withdraws an Article and a
Collection in Admin; Web News/Specials and their readers show only published
revisions through `/api/community/editorial/**` → `/v1/community/editorial/**`;
withdrawal makes detail 404 and removes list/collection membership without
losing order.

C2 Threads and Article discussion — Owner creates a Thread; a Development
account posts text + ≤3 images from the Thread; the Work appears on the Thread,
the author's Works and discovery with one identity; heat and read state are
deterministic; Article roots/replies/likes/moderation work through the real
discussion API; existing Catalog/Work comments unchanged.

C3 DMs — two Development accounts: first message allowed, second refused with
the exact reason after refresh and on a second connection; reply activates;
hide/Undo, mute, read state and block behave as frozen; Owner moderation view
removes a message with audit; bodies never in ordinary logs or public search.

C4 Delivery and joint QA — cumulative `verify-task` from the worktree,
independent exact-head review, Draft PR, private handoff; joint assembly only
when A/N candidates exist.

## 7. Migration and application plan for retained environments (NOT applied)

New forward migrations `20260922030000_threads`,
`20260922031000_article_discussion_target`, `20260922032000_direct_messages`
plus the Payload forward migration for the two editorial collections and their
published views. Apply order: Payload family (`pnpm db:migrate` as the CMS
migration role) → `grant-public-read.sql` (adds the Article views) → community
family (`APP_MIGRATION_DATABASE_URL`) → `grant-runtime.sql` (idempotent; the C
block grants column-level DML on the new tables). Forward recovery: disable the
Development composition of the new services (they are composed only under
`NODE_ENV=development`) rather than dropping tables; schema rollback never
deletes DM or Thread rows and never restores broad grants. Retained targets
(compose.dev `yoyi_dev`, the publishing acceptance database, TencentDB) were not
inspected or modified by this task.

## 8. Route and composition matrix (as built)

| Surface            | Route                                                                                                                                                         | Auth                                       | Composition                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Editorial reads    | `GET /v1/community/editorial/articles[/{id}]`, `…/collections[/{id}]` (Web relay `/api/community/editorial/**`)                                               | none; published revisions only             | `EditorialContentReadService` over `PostgresEditorialContentAdapter` (public read role, five `article_*` views); Development only         |
| Editorial writes   | Payload `articles`, `article-collections`, `editorial-article-approvals`; endpoints `save-article-draft`, `approve-article-batch`, `publish-approved-article` | Payload Owner / automation (drafts only)   | `apps/admin/src/editorial-content/**`; receipts in `editorial-receipts`                                                                   |
| Threads            | `GET /v1/community/threads[?anchor]`, `GET …/{id}`, `GET …/{id}/posts`, `POST …/{id}/read`                                                                    | reads public, read marker session          | `ThreadService` over `PostgresThreadAdapter`; posts are Works submitted with `threadId` (`submitInTransaction`)                           |
| Thread operations  | `GET/POST /internal/community/threads`, `POST …/{id}`                                                                                                         | operator credential; Admin 话题管理        | operator Contracts parsed in `ThreadService`; `content_operator_events` + receipts                                                        |
| Article discussion | existing `/v1/community/discussion/article/{id}/**`                                                                                                           | as Catalog/Work discussion                 | `catalog_comments.target_type = 'article'`; visibility via `isArticlePublished`                                                           |
| Direct messages    | `GET/POST /v1/community/messages`, `GET …/unread`, `GET …/with/{userId}`, `GET …/{id}`, `POST …/{id}/{hide,unhide,mute,unmute,read}`                          | session required; sender = session account | `DirectMessageService` over `PostgresDirectMessageAdapter` (pair advisory lock, request gate, daily/minute limits, `dm_command_receipts`) |
| DM moderation      | `POST /internal/community/messages/{conversation,lookup}`, `POST …/{messageId}/remove`                                                                        | operator credential; Admin 私信处理        | purpose required; content-free `dm_moderation_events`; replay through `content_operator_receipts`                                         |

All of the above are composed only under `NODE_ENV=development`
(`services/backend-production/src/composition.ts`); a Production build composes
none of these ports and the Web relay answers as before for unknown paths.

## 9. Known gaps recorded by the independent review (Draft #163, head `b3c39d7`)

- A Thread post edited later through the general editor (no `threadId`) is bound
  by the general editor limits, not the quick-composer limit of three static
  images; the Thread association itself is unchanged.
- The operator conversation view shows the latest 200 messages with the total
  count; a lookup that finds no conversation is not audited because audit rows
  name a conversation.
- The send receipt replays the committed message to its sender; moderation
  removal now redacts that receipt as well as the message row.
