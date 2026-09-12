# Mission 2C — Catalog comments in normal browsing

Owner instruction of 2026-09-12 (delivery closure, then Mission 2C); Community
V1 amendment (2026-09-11) sections 6, 7 and 8. Mission 2C connects the merged
comment client of PR #113 to the accepted Product application: Home, Browse and
Search open the same Catalog Detail, and that Detail carries the live comment
section through the frozen seam (`T02pProductPreview.renderCommentSection` →
`PreviewCatalogDetailOverlay` → `CatalogDetailExperience` →
`CatalogDetailScreen` → `CommentSection`).

## What is reused, unchanged

- Transport: `apps/web/lib/public-api/catalog-comments-client.ts` (same-origin,
  `credentials: same-origin`), imported only by the loader below.
- Loader and DTO → presentation mapper:
  `apps/web/features/comments/live-comments.ts`.
- Hook and live components: `use-live-comments.ts`, `live-comment-section.tsx`
  and the accepted `comment-section.tsx` (hot first, latest after, pinned
  load-more, flat replies with reply paging, viewer, notice and status props).
- Same-origin routes: `/api/catalog/{id}/comments`, `.../replies`,
  `/api/community/me` and the Development sign-in routes.

## What Mission 2C adds

- `apps/web/features/product-application/product-application.tsx` — the Client
  Component that renders the accepted `T02pProductPreview` and, when comments
  are composed, creates the render-prop seam with `LiveCommentSection`.
- `apps/web/features/product-application/community-comment-surface.ts` — the one
  resolver that decides whether comments are composed and where a signed-out
  reader signs in: `{ signInHref: "/dev/community" }` in the Development
  runtime, `null` otherwise.
- `apps/web/app/page.tsx`, `apps/web/app/dev/t02p/page.tsx` and the preview
  shell compose the application; the preview keeps its clean Development states.
- The E2E Public API fixture answers anonymous comment reads with an empty
  listing so the Formal root journey is covered in CI.

No table, Contract, Backend route, ranking rule, moderation feature, like or
upload is added.

## Behavior Matrix (frozen for the Owner's acceptance of this mission)

| Scenario                  | Development                                                                                                                                                                                                                                | Production                                                                    | Must preserve                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Composition               | `/`, `/dev/t02p`, `/dev/community/preview`: every Catalog Detail opened from Home, Browse or Search carries the live comment section (`data-comment-presentation="live"`).                                                                 | No comment section on any Detail; no link to any `/dev/*` route (decision 7). | Detail hero, media carousel, reading flow, Viewer, phone/tablet-portrait pager (资料/评论) and landscape aside exactly as accepted in #106/#113. |
| Loading                   | Skeleton from the real client while the first page loads; no count in the heading.                                                                                                                                                         | —                                                                             | The accepted skeleton markup.                                                                                                                    |
| Empty                     | "还没有评论，来说说你的看法。" (`data-comment-empty`) with count 0.                                                                                                                                                                        | —                                                                             | —                                                                                                                                                |
| Ready                     | Hot roots (≤ 3, Backend-ranked) first, then the latest page of 10, `加载更多评论` until the last page; each root shows two of its embedded replies, `展开其余 1 条回复` reveals the third, and `查看更多回复（还有 N 条）` pages the rest. | —                                                                             | No sort control, no like control, no media upload.                                                                                               |
| Signed out                | Composer replaced by "登录后即可发表评论。" linking to `/dev/community`; reading and paging unaffected.                                                                                                                                    | —                                                                             | The link target is the only Development-specific value; it comes from the resolver, never from a component.                                      |
| Session check unavailable | "暂时无法确认登录状态，请稍后刷新再试。" — never shown as signed out.                                                                                                                                                                      | —                                                                             | —                                                                                                                                                |
| Signed in                 | Composer with the Backend's identity; `回复` on a root or a reply targets it (`回复 X：`).                                                                                                                                                 | —                                                                             | Composer position per platform as accepted.                                                                                                      |
| Create                    | 201 → "已发布。", list refreshes, the root appears first in the latest list; 202 → "已提交，待审核通过后才会显示。", nothing appears.                                                                                                      | —                                                                             | Draft cleared only on success.                                                                                                                   |
| Reply                     | 201 → "已发布。", the thread refreshes and the reply is visible at the end of its thread even beyond the embedded first three; 202 → pending notice.                                                                                       | —                                                                             | Flat replies; the replied root may move to the hot section on refresh.                                                                           |
| Failed submission         | 400 → invalid-input text, 404 → "这条资料或评论暂不接受回复。", 503 → "评论服务暂时不可用，请稍后再试。", other → "评论发送失败，请稍后再试。"; the draft stays in the composer; never a success notice.                                   | —                                                                             | —                                                                                                                                                |
| Expired session           | A submission with an expired or revoked cookie → "登录后才能发表评论。", the composer becomes the sign-in link, the draft stays.                                                                                                           | —                                                                             | —                                                                                                                                                |
| Listing unavailable       | 503 or a failed read → "评论暂时无法加载，请稍后再试。" (`data-comment-unavailable="unavailable"` / `"unexpected-error"`), no count, no composer claim of success.                                                                         | —                                                                             | Detail itself still renders.                                                                                                                     |
| Listing not found         | 404 from the comment read → "这条资料暂不开放评论。" (`data-comment-unavailable="not-found"`), no count.                                                                                                                                   | —                                                                             | —                                                                                                                                                |
| Moderation effect         | After the Owner hides/rejects/approves in Admin, a refresh of the Detail shows the public result; nothing changes without a refresh.                                                                                                       | —                                                                             | —                                                                                                                                                |
| Navigation                | Back/Forward between Home/Browse/Search, Detail and Viewer, the reading position and `?catalogId=` direct entry behave exactly as before; closing Detail returns to the originating page and scroll.                                       | Same.                                                                         | Product History model untouched.                                                                                                                 |
| QA prototype              | `/dev/t02p/qa` keeps the fixture store and its scenarios; unchanged.                                                                                                                                                                       | 404.                                                                          | —                                                                                                                                                |

## Validation entry points (Development runtime)

- `http://127.0.0.1:3000/` and the LAN address used for device QA — Home →
  Browse/Search → Detail → comments.
- `http://127.0.0.1:3000/dev/community` — sign in as `dev-user-01..03`.
- `http://127.0.0.1:3000/dev/community/preview?catalogId=catalog-dev-acceptance-01`
  — the acceptance preview over the clean Development states.
- `http://localhost:3002/admin/community-moderation` — the moderation workspace
  for the moderation-effect row.
