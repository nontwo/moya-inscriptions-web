# Owner Amendment — Confidentiality and Local Preflight

- Status: Active
- Effective date: 2026-09-07
- Applies to: agents, tools, repository/worktree operations, reviews,
  deployment, automation, and all Git and non-Git external publication for this
  project.

## Authority and scope

This explicit Owner amendment establishes a continuing confidentiality rule.
Ordinary instructions to continue, complete, deploy, review or repair CI do not
authorize disclosure or a relaxation. Private information previously supplied to
a program or agent, visible in an old record, or used during acceptance does not
acquire publication permission. Owner acceptance is bound only to the explicitly
named version and actually confirmed tests.

This change covers policy, local preflight and synthetic verification only. It
does not change frontend business, database models, runtime media behavior,
deployment access, identity roles or test-entry duration. Governance changes
belong in their own reviewed PR; they must not silently change an accepted
product head. Existing review, exact-head merge and merged-head verification
requirements remain in force after the confidentiality checks pass.

## Protected information and destinations

Do not write real protected information into commits, pushes, PRs, issues,
comments, releases, documents, attachments, artifacts, test evidence, logs, tool
results or agent conversation. Private repositories, Draft PRs, temporary
branches and test files are included; expiry, planned deletion and eventual
cleanup are not exceptions.

Protected information includes:

- SSH/TLS private keys, cloud/API credentials, access and refresh tokens;
- passwords and hashes, credential-bearing connection strings, cookies,
  sessions, authorization headers, recovery codes and authentication QR codes;
- complete signed, invitation, reset and token-bearing URLs;
- unapproved private test/admin/deployment endpoints, IPs, internal hostnames,
  cloud accounts/resource locators and private file-share addresses;
- personal identities, personal/school emails, phone/address/identity documents,
  identifying absolute local paths and unapproved original data;
- indirect copies in screenshots, recordings, terminal captures, database dumps,
  chat exports, source maps, traces, HAR, config archives and other containers.

Rules, deny examples, fixtures and scanner configuration must use placeholders
or explicitly fictional data, never the real protected material they prohibit.
Public official references, open-source links and content/brands/formal URLs
explicitly approved for publication remain usable within the approval scope.

## Controlled use without disclosure

Within the approved target and purpose, controlled programs may read protected
configuration directly to authenticate, connect to storage or invoke cloud APIs.
Do not send protected values into agent context. Never dump configuration,
environment, authentication headers or full requests/responses, or enable shell
debug echo around sensitive operations. Redact before output; report safe
status, field names and necessary error categories without matching values.

Keep credentials in approved protected configuration or secret management with
minimum permissions. Never put them in a repository, frontend static directory
or frontend build output. Preserve deployment, import/operator and runtime
identity separation; do not broaden existing grants. Private handoff material
belongs in an approved restricted location; report that it was saved and how the
Owner can retrieve it safely rather than echoing it.

The backend may deliver necessary short-lived media URLs to authorized users as
part of existing business access. Preserve that functionality and keep long-term
keys off the frontend. Do not copy complete media URLs to PRs, logs or evidence.

## Local preflight before information leaves the machine

First inspect current effective rules, Git identity, ignore configuration,
scanner and hook installation. Reuse effective mechanisms and fill only gaps. Do
not silently revive retired historical mechanisms or scan/rewrite all old
history as part of ordinary work.

Before each commit check:

1. the actual staged blobs and filenames, including staged versions that differ
   from the working copy;
2. the complete proposed message, including trailers;
3. the effective author and committer identity, including environment overrides;
4. generated files and indirect carriers in the actual staged set.

Before each push check every new outgoing commit and its changed blobs,
filenames, author/committer and message, including a secret introduced and then
deleted in an intermediate commit. Inspect pushed annotated-tag metadata too. Do
not substitute the final worktree snapshot or a scan of only the tip commit.

Before PR/issue/comment/release text or attachment uploads, perform the same
local preflight on the exact content to be sent, even when there is no Git push.
Unclassified binaries/archives and image/video evidence need private inspection
and explicit publication authorization; do not silently pass what cannot be
inspected. The fact that another test passed is not that authorization.

Use only the already approved anonymous developer identity and GitHub noreply
email. Do not infer an identity from the system or fill in personal/school
details. Do not modify unrelated global/project Git identity. Current active
identity must be checked again before the operation, not inferred from history.

A suspected secret/private datum blocks the affected commit, push or
publication. Give a sanitized position and category; never print the detected
value. Do not use `--no-verify`, disable scanning, add a broad allowlist or
defer the fix. Continue unaffected work. CI is a second defense; it cannot
replace this local boundary. Verify GitHub push protection when available and
report exact required Owner settings if permissions are missing; do not purchase
security packages. GitHub silence and green CI do not prove absence of leaks.

## Incident response

On exposure, stop further propagation and privately report sanitized category,
location and impact. Prioritize revocation/rotation of still-valid exposed
credentials under existing emergency authority. When that authority or access is
absent, give precise Owner steps without disrupting unrelated systems. Removing
the newest copy alone does not resolve historical exposure.

History rewrites, force pushes, deleting PRs/repositories and bulk cloud
deletion require separate specific authorization. Never duplicate a detected
secret in an issue, comment, cleanup screenshot or report. This amendment does
not request an all-history cleanup or change prior decisions to retain history.

## Checked-in preflight entry points

After verifying that the current effective identity is the already approved
anonymous pair, install once per local Git repository:

```sh
pnpm confidentiality:install --confirm-current-identity-approved
pnpm confidentiality:health
```

The confirmation flag records a previously established approval; it does not
authorize an arbitrary current identity. Installation writes only the current
repository's Git common directory and local configuration, never global Git
identity. It installs checked copies of the scanner and three hooks with a hash
manifest and an absolute local hooks path. Thus shared worktrees, including old
checkouts without these tracked files, use the same installed guard. Unknown
existing hooks, configuration conflicts and modified installed files stop the
installation. Repeating an identical installation is idempotent; a reviewed
version upgrade uses the explicit installer `--update` option.

Git must support `--no-lazy-fetch`; an unsupported version stops the checks.
Conditional `includeIf` configuration stops installation pending individual
review, because it can select different hooks or identities in another worktree.
Do not silently edit the Owner's existing configuration to proceed.

An enabled `extensions.worktreeConfig` flag is accepted only when no
`config.worktree` file exists in the main or linked administrative directories.
Any such file or symbolic link, or an unverifiable administrative directory,
stops installation and health checks; existing configuration is not rewritten.

The automatic local hooks are `pre-commit` (actual index and effective
identity), `commit-msg` (exact proposed message and identity), and `pre-push`
(the exact ref updates, every new commit and tag metadata). Push preflight
obtains the actual remote baseline; missing objects, changed remote state or
unavailable baseline stop the operation rather than silently skipping history.
All parent diffs are inspected for new merge commits. Repository-local transport
helpers require review; ordinary authorized system credential/SSH configuration
remains in use.

The same checks are available explicitly:

```sh
pnpm confidentiality:staged
pnpm confidentiality:message "<protected-message-file>"
pnpm confidentiality:outbound "<protected-payload-file>"
pnpm test:confidentiality
```

The message and payload arguments above are placeholders, not real private
paths. Prepare exact external text in a protected local file, check it, then
send that same content without adding unreviewed text or attachments. These
entry points verify installed scanner integrity before checking. Never scan with
an unreviewed replacement and treat its result as approval.

`pnpm test` also runs the synthetic preflight tests before the existing test
pipeline, so existing CI checks the guard as a second defense. The existing
daily verification deadline remains unchanged. Regression samples are entirely
synthetic and exercise real local Git hooks without transmitting protected data.
Findings omit values and arbitrary private filenames; use sanitized categories
and local inspection to resolve the blocked operation.

## Persistence and limitations

Repository-root instructions link this amendment so sessions, worktrees and
review agents on a revision containing it can discover it. Local installation
must verify the actual Codex home, override precedence, instruction config and
size limit, and report the effective scope. Do not claim that other computers,
unconfigured clones or already running sessions automatically inherit a change.

Git hooks are local configuration, not a remote access-control guarantee. New
clones need verified installation; alternate hooks paths, bypass commands and
non-Git clients can avoid hooks, though such bypass is forbidden by this rule.
Pattern scans cannot prove that arbitrary prose, transformed data or every
binary is safe. Keep mandatory review for those limits and block uncertain
external publication. No rule file alone is proof of technical enforcement.

## Existing rule classification

- PRESERVE: architecture, runtime media access, least privilege, identity
  separation, source/data boundaries, exact-version acceptance, review/merge
  gates, existing local instructions and explicit destructive-operation gates.
- MERGE: the Constitution's prohibition on committed credentials into this
  fuller confidentiality rule, retaining its substantive protection.
- MODERNIZE: local delivery gates now explicitly include every outgoing commit,
  metadata and non-Git publication; CI alone is insufficient.
- RETIRE: none. Historical decisions remain evidence and are not rewritten.

Operational identities and private values must never be embedded in this
document or the implementation's tests and configuration examples.
