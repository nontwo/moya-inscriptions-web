# Work publishing and draft editing — work-publishing-v1

Task: `work-publishing-v1`. Revision: r2. r1 remains in Git history.
Owner-approved requirements provided on 2026-09-13 (implementation assignment
for image/text publishing and draft editing). Phase 4 (#125/#126) is merged;
this task starts from `main` `362781c18a85711e6b456be7933b30a70afba04a` in its
own worktree and one Draft PR.

## r2 — Owner QA and corrected import boundary (2026-09-14)

This revision records the explicit Owner QA/debug assignment for Issue #137 /
Draft PR #138. The same task, branch and worktree continue; Codex is the
incoming QA/debug writer. The complete r1 remains available at
`5cde007f76d2598e64e59b90320101e9d3dbee35`. Requirements below supersede only
the identified earlier statements; every unaffected rule and Behavior Matrix row
remains binding.

- Official product name: 由于艺 / ArtVenn. Existing technical identifiers stay.
- Complete Live Photo import uses an iPhone-native PhotosUI/PhotoKit path. Its
  implementation and authorization belong to a separate Apple task; this QA pass
  writes no `apps/apple/**`. Web owns ordinary image/text editing, upload
  sessions, drafts, permissions, storage/processing and cross-platform playback.
  Camera brand is not the upload boundary. No Android/vendor importer expansion.
- Original compatibility means the complete selected representation actually
  exported by the supported native Photos path, including Photos-recognized
  third-party camera content. OS-edited and unmodified resources must be
  distinguished; bytes never supplied cannot be recovered or promised.
- Browser still-only input is an ordinary image, never a complete Live Photo.
  Existing paired parsers, checksums, quotas, private media, derivatives and
  Viewer stay useful backend/browser evidence. Mac paired-file selection is not
  the main acceptance journey. Missing native importer, hardware and motion
  samples are separate dependencies, not waived requirements. Web readiness,
  backend Live/playback evidence, native import and physical acceptance are
  recorded separately. This supersedes the r1 Media paths and real-sample
  feasibility statements that treated file exports as the primary journey or
  missing motion as Owner waiver.
- Standard sends supported optimized bytes before upload. Only already-small
  JPEG/PNG/WebP retention is permitted; retained HEIC/HEIF or any source motion
  (including QuickTime and MP4) is not. Unsupported optimization offers
  Original/remove before source upload.
- Every self-only → public transition follows the current publication policy,
  including unchanged previously approved content and a new matching revision.
  There is no prior-approval exemption. A work that stayed public may retain V1
  while V2 waits for approval; that different case is preserved.
- Conflict selection preserves later author input and recoverable unchosen
  versions; an older response never clears newer typing. The former private
  implementation note proposing such loss is not an accepted exception.
- QA may add focused regressions, necessary local helpers, exact reproducible
  App-role grants and forward product migrations within the existing task.
  Applied migrations and SQL ledger records must not be rewritten. Retained
  acceptance data is read-only unless a necessary reviewed forward update has a
  verified recoverable backup. Mutating tests use separately verified disposable
  databases, accounts and private storage.
- Local verification and core-credential budgets retain their accumulated
  ledgers. Historic timeouts remain failures; extra execution requires a
  specifically bounded Owner allowance. No workflow, CI, hooks, policy,
  unrelated task or Production changes are authorized.

| Correction scenario  | Development                                                      | Production         | Must preserve                                                |
| -------------------- | ---------------------------------------------------------------- | ------------------ | ------------------------------------------------------------ |
| Re-publication       | Current policy gates all self-only to public paths               | No exposure change | Still-public V1 while V2 pending; timestamp and interactions |
| Conflict choice      | Chosen version plus later typing, with recoverable versions      | No exposure        | No lost input, no automatic publication                      |
| Complete Live import | Separate native dependency; truthful Web image fallback          | No exposure        | Grouping, private bytes, playback; no false LIVE             |
| Initialization       | Reproducible exact App-role bootstrap and isolated upgrade proof | No deployment      | Retained ledger/data, identity and role separation           |

## Authority and delivery stop

The Owner instruction of 2026-09-13 explicitly authorizes new album-style works,
editing of existing works, static and Live Photo media in Standard and Original
modes, private media storage and processing, persistent drafts and no-save
sessions, version conflicts and history, public/self-only visibility with an
independent work publication policy, a work recycle bin, bounded cleanup, quotas
and the essential Admin controls, including the necessary scoped contracts and
forward migrations. It supersedes the Phase 4 freeze of work creation, editing
and deletion entrances only. The Constitution and the six active amendments
remain in force otherwise.

Delivery stop: one Draft PR to `main`, a retained Development environment,
automated evidence, one independent actual-diff review, and Owner manual and
real-device acceptance. No Ready transition, merge, deployment, release,
Production exposure or phase closure is authorized. Development-only wiring
follows the Phase 4 composition gates.

## Non-goals

Rich text; tags or maps; independent audio/video posts; video trimming, filters
or music; AI writing, moderation or labeling; remote URL or cloud-drive import;
public registration or new identity providers; shared draft links; a cross-work
media library; public original-download; Production exposure; Apple projects;
Research; parked cloud/media-transfer work; CI, runner, classifier, budget or
approval-setting changes; avatar redesign; comment/reply draft persistence.

## Preserved behavior

Accepted profiles, avatars and avatar synchronization, account limits, cards,
long-press actions, comments, relationships, privacy, search results, Viewer and
Admin behavior remain unchanged except for the explicit changes below. UserWork
stays distinct from Catalog. Editing never changes author ownership, work
identity, discussion identity, likes/favorites or first-publication time.
Existing Catalog media and avatar/work PNG media keep their storage and read
compatibility; nothing is migrated out of their stores or deleted.

## Frozen functional paths

- `packages/contracts/src/**` (publishing schemas, text rule, operator shapes)
  and generated `services/public-api` OpenAPI.
- `services/api/src/modules/community/**` and public exports;
  `services/community-postgres/src/**`; `services/backend-runtime/src/**`;
  `services/backend-production/src/**`.
- New forward files in `database/community-migrations/` and the manifest.
- `apps/web/app/api/community/publishing/**`; `apps/web/lib/public-api/**`;
  `apps/web/features/{publishing,authors,detail,product-application,product-preview,product-shell,shell,home,calligraphy,search,quick-actions}/**`;
  `apps/web/app/page.tsx`; `packages/ui/src/{assets.ts,assets/icons/**}` for new
  icons; `apps/web/package.json` and `pnpm-lock.yaml` for the pinned
  dependencies below.
- `apps/admin/src/community/**`, `apps/admin/payload.config.ts`, the supported
  Admin import map.
- `infra/development/work-publishing/**` (Development media-tools image and
  instructions); `turbo.json` pass-through keys for the Development Backend.
- `tests/unit/{contracts,backend,architecture,community}/**` product assertions
  and exact pinned-surface updates;
  `tests/integration/postgres/work-publishing*` plus registration in the
  existing community suite; colocated product tests; this document and
  `docs/project-status.md`.

Scanner logic, verification runners, classifier, budgets, CI, hooks and
instruction files remain unchanged. Only exact allowlist entries required by the
existing scanner for new routes, server functions and client-visible DTO names
are added.

## Dependencies

Pinned, open-source, added only where used: `@uppy/core` 6.0.1, `@uppy/react`
6.0.0 (its headless React hooks for selection, as the Owner instruction names)
and `@uppy/xhr-upload` 6.0.0 (MIT) for transfer mechanics with automatic retries
disabled; `mediabunny` 1.56.2 (MPL-2.0) for WebCodecs container demux/mux in a
worker; `exifr` 7.1.3 (MIT) for bounded metadata extraction; `@dnd-kit/core`
6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2 (MIT, already in
the lockfile) for ordering; the existing `react-easy-crop` 6.2.3 for crop; the
existing `sharp` 0.35.4 (Apache-2.0; bundled libvips LGPL-3.0) added to the
Backend. Development server derivatives for HEIC and motion use a locally built,
sandboxed Debian image with FFmpeg 7.1.5 (GPL build), libheif 1.19.8 and
libde265 1.0.15 (LGPL-3.0), run without network, read-only, with CPU, memory,
process and time bounds. No paid or third-party processing service. A Production
processing toolchain is outside this task.

## Content rules

A work is an ordered album of at most 50 complete media items, an optional title
(≤ 200) and a plain-text body (≤ 10,000) with preserved line breaks. Length is
the number of Unicode code points after normalization (CRLF/CR → LF; NUL and
lone surrogates rejected; outer whitespace trimmed; titles single-line), shared
by contracts, Web and Backend; existing valid content remains valid. Text-only,
media-only, mixed and title-only works are valid; submission is rejected only
when title, body and retained media are all empty or a genuine validation or
readiness condition fails. Authorship: original, copy or practice, or material
sharing (the latter two with optional reference work, original author and
source). No per-image captions.

## Behavior Matrix

| Scenario                     | Development                                                                                                                                                                                                                                          | Production         | Must preserve                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| Entry                        | Lower-right dock action becomes a white plus on the seal token opening the editor; Search moves to the upper-left of Home, Inscriptions and Calligraphy                                                                                              | No exposure change | Dock shape, size, placement, collapse animation; one floating action; search function, focus return |
| Editor (phone)               | Full-screen three steps: media → text/authorship/visibility/draft mode → short confirmation; text-only may skip media; uploads continue across steps                                                                                                 | No exposure        | One editing session across steps and resize; keyboard, safe area, focus, Back                       |
| Editor (desktop/wide tablet) | One spacious editor with media, text and continuous real work preview; same confirmation                                                                                                                                                             | No exposure        | Existing tokens, fonts, radii, light/dark                                                           |
| Selection                    | Save draft (default on) and Original quality (default off per batch) visible before selection; picker, drop and paste; staging groups files into logical items then uploads privately                                                                | No exposure        | Text entry usable during preparation/upload                                                         |
| Standard                     | Optimized in the browser before upload; optimized master stored privately; reliable pre-optimization metadata stored privately                                                                                                                       | No exposure        | No hidden original upload; no upscaling, crop, filter or sharpening                                 |
| Original                     | Complete received components stored byte-for-byte with server checksums; separate derivatives; sources never publicly served                                                                                                                         | No exposure        | No recompression or metadata stripping of sources                                                   |
| Unsupported compression      | Explicit choice to upload Original or remove                                                                                                                                                                                                         | No exposure        | Never silently send the source as Standard or drop motion/audio                                     |
| Live Photo                   | Paired by trustworthy identifiers or container; counts as one item; ready only when all components validate and derivatives exist; cards show static cover + LIVE; Detail/Viewer play on explicit action, muted first, audio toggle                  | No exposure        | Stored audio retained; existing long-press gestures                                                 |
| Ordering and edits           | Drag, long-press, keyboard/button ordering with numbers; independent cover; rotate/crop/revert applied consistently to still and motion derivatives                                                                                                  | No exposure        | Stable item IDs; unchanged masters not retransmitted                                                |
| Upload execution             | Account-scoped manager survives navigation; global progress entry; distinct states; per-component bounded transfers; no automatic network retries; retry only failed components                                                                      | No exposure        | Account switch/logout pauses and isolates                                                           |
| Saved draft                  | Created on first real content; ~2 s coalesced autosave; Save now; Drafts card first in own Works with newest-first picker; conditional saves with This device / Account version choice; history of 20 important snapshots                            | No exposure        | Visitors see no drafts; unchosen content recoverable; newer input never cleared                     |
| No-save                      | No persistent draft, snapshot or local recovery copy; minimal temporary session with bounded lease; explicit discard revokes immediately and cleans session-only data                                                                                | No exposure        | Existing published/private work revisions and other drafts untouched                                |
| Submission                   | Idempotent confirmation tied to an immutable revision; receipt query on lost response; opens the author's work view with a path back                                                                                                                 | No exposure        | No duplicate works or double daily counts                                                           |
| Publication policy           | Independent work policy: fresh default direct publication; Owner can switch to pre-moderation in Admin without restart; prospective only                                                                                                             | No exposure        | Comment publication policy unchanged                                                                |
| Visibility                   | Public/self-only; public→self-only restricts third parties immediately; pending edits keep the last public revision for others; effective visibility on feed, search, profile, favorites, likes, discussion, media/Range, covers, previews and links | No exposure        | First-publication time set once; Edited marker after real content updates; interactions preserved   |
| Admin                        | Work policy, submitted-revision moderation (latest only), limits and Owner capacity designation, stuck processing/cleanup outcomes                                                                                                                   | No exposure        | Payload stays operator UI calling the Backend boundary                                              |
| Recycle bin                  | Submitted works trash for 30 days (configurable); restore as self-only; Admin-removed cannot self-restore; unsubmitted drafts delete immediately                                                                                                     | No exposure        | Discussion identity preserved; shared blobs never deleted while referenced                          |
| Limits                       | 50 items; 128 MiB per Original item (provisional, configurable); no whole-work cap; 10 GiB ordinary / 20 GiB Owner account capacity; 100 active drafts; 100 first submissions per America/New_York date                                              | No exposure        | Clear feedback at limits; no persistent quota meter; text save and deletion still work              |

## Media paths and limits of proof

Complete Live Photo originals reach the browser only through verified export
paths that supply both components (for example macOS Photos “Export Unmodified
Original”, or iPhone Photos “Export Unmodified Originals” to Files followed by a
multi-file selection). iOS Safari photo-library picks provide a compatible still
without the motion component and cannot be presented as a complete Live Photo or
as camera-original proof. Synthetic pairs are regression fixtures only; the
real-device scope is limited by Owner decision as recorded in the feasibility
note below.

## Feasibility note (before building the editor)

Tested path: a private end-to-end harness (browser worker preprocessing → Uppy
raw-body transfer with retries disabled → streamed server storage with SHA-256 →
sandboxed server derivatives → authorized private reads) in headless desktop
Chrome for Testing 151, Playwright WebKit 26.5 and Firefox 153, re-run and
checked by a separate verifier. Inputs were synthetic regression fixtures; no
physical iPhone.

Results: Standard static uploads stored exactly the browser output bytes and
applied EXIF orientation in pixels; Original uploads were byte-identical;
derivatives carried no EXIF/GPS while stored originals kept them; a synthetic
HEIC+MOV pair matched by Apple content identifier on client and server, an
unrelated pair was refused, and the H.264/AAC motion derivative played in all
three browsers with duration within 1 ms and audio present; Standard Live
transcoding worked in Chromium and WebKit in about 0.5 s. A cancelled upload
that later completed was refused at commit and stored nothing.

Limits that shaped the implementation: WebKit cannot encode WebP from canvas and
its JPEG/PNG output can be larger than the input (keep the input instead); only
WebKit decodes HEIC in the browser; Firefox lacks HEVC decode and AAC encode
(explicit Original-or-remove choice); browsers re-sent a dropped `PUT` upload on
their own, so component uploads use `POST` behind a server attempt/cancel fence;
Uppy Golden Retriever cannot restore files over 10 MiB without a service worker,
so saved-draft recovery uses a bounded account-scoped IndexedDB store; WebKit
ignored a requested AAC bitrate and Chromium's H.264 output carried a
color-matrix tagging mismatch, so compatible audio is copied and color space is
set explicitly with a fidelity check; tall images need width-bounded display
derivatives. Live Development runs showed WebKit keeping an untouched input as
the Standard master whenever its own encoding was not smaller, including a 24 MP
HEIC still; the Matrix does not allow a source to be sent as Standard without an
explicit choice, so retention is limited to already-small JPEG, PNG or WebP
inputs, and a HEIC/HEIF still or QuickTime motion that Standard cannot reduce
enters the explicit Original-or-remove choice. Development tool timings: HEIC
decode about 0.46 s, motion transcode about 1.1 s including container start.

Real samples: two iPhone 17 Pro Max HEIC Live stills and two Insta360 Luna Ultra
JPEG Live stills were provided without motion components. By Owner decision only
these files are tested; complete Live Photo originals for iPhone 17 Pro Max and
Insta360 Luna Ultra, and all DJI Osmo Pocket 4P paths (no device), remain NOT
TESTED.

## Evidence

The private task artifacts hold the feasibility measurements, sample manifests,
environment ownership and walkthrough. The Draft PR records exact base/head,
checks, review and the acceptance state.
