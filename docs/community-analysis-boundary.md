# Community moderation: the machine-analysis boundary

Status: interface and contract only (Owner instruction 2026-09-12, section 8).
No provider is connected. Nothing here transmits comment data anywhere, and
nothing here can publish, hide, reject or suspend.

## What exists today

- `CommentAnalysisPort` in `@moya/api`
  (`services/api/src/modules/community/application/ports/comment-analysis-port.ts`):
  `connected` plus `readLatest({ id, kind, text })`, returning a
  `CommentAnalysisState`. The default `DisabledCommentAnalysisPort` reports
  `{ status: "not_connected" }` and `connected: false`.
- The Contract shapes in `@moya/contracts/internal/community-operator`:
  `commentAnalysisResultSchema` (target id and kind, SHA-256 content hash of the
  analysed text, analyzer name and version, run id, timestamp, processing status
  `completed | failed | skipped | stale`, bounded reason codes, a bounded
  explanation, and a recommendation `none | approve | review | hide | reject`)
  and `commentAnalysisStateSchema` (`not_connected`, `not_analyzed`, or a
  result).
- The Backend exposes the state read-only on the operator boundary
  (`GET /internal/community/comments/{id}/analysis`, and inside item detail).
  The Admin detail panel shows "未接入分析服务" when no provider is configured,
  never a clean verdict. The summary reports `analysis.connected`.
- Contract-level tests use a test adapter that returns a fixed result and prove
  the recommendation changes no state and records no audit entry.

## Rules the boundary enforces

1. Analysis recommends; humans decide. A recommendation is never applied
   automatically, and there is no path from the analysis port to any write.
2. A failed, skipped or stale run is not a safety verdict. Only `completed`
   carries a recommendation, and the content hash ties it to the exact text that
   was analysed; an edit makes the result stale.
3. Machine findings stay separate from the authoritative moderation events. The
   audit table records human operator actions only, attributed to the
   server-side operator label the Backend holds; no request can name an actor.
4. Comment text is untrusted data. Any future adapter passes it to a model or
   rule pack as data, never as instructions, never as permission to invoke a
   tool. Quoted historical or art material is expected in this domain; a
   recommendation is never a factual judgment about Catalog scholarship.

## How a provider would be added later

- Implement `CommentAnalysisPort` in a new adapter workspace (rules, a hosted
  model, or an MCP tool). It receives only the text, id and kind, and returns
  the result shape above. Result storage, if any, is a later decision; no
  analysis table exists today and none is created speculatively.
- Wire it through `createBackendApplication({ communityAnalysisPort })` from the
  production composition root, under its own configuration. It never receives
  the Owner token, the operator credential or the App database role.

## Permission separation (documented now, enforced when introduced)

| Principal                | Read queue and detail | Analyze (advisory)  | Write (moderate)                                           |
| ------------------------ | --------------------- | ------------------- | ---------------------------------------------------------- |
| Owner (Payload Admin)    | yes                   | reads results only  | yes, audited as `owner`                                    |
| Future analysis adapter  | the text of one item  | yes, returns result | no                                                         |
| Future automation client | scoped read           | no                  | no, or a separately authorized label that is never `owner` |

A scoped automation principal would be a second operator credential with its own
label recorded on every event it produces, so machine activity is never recorded
as an Owner action. Human write authority stays exactly as it is until the Owner
authorizes such a principal.
