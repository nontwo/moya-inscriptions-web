# Owner Amendment — Core-Credential Quick Check

- Status: Active; explicitly replaces the previous comprehensive privacy gate.
- Scope: the existing scanner, hooks, installation copies and their
  instructions.
- Preserved: business behavior, anonymous Git configuration, normal review and
  functional tests, GitHub secret scanning/push protection, incident and
  destructive-operation authorization boundaries.
- Retired: identifier/extension/configuration-form blocking, repeated identity
  approvals, all-worktree/all-remote inspection and separate privacy reviews.

## Protect actual credentials without treating identifiers as secrets

Never put real SSH/TLS private keys, cloud SecretKeys, API keys, access/refresh
tokens, concrete passwords, password-bearing connection strings, complete
authentication materials or authorizing signed/token links into Git, PRs,
comments, attachments, logs, tool output or agent context. This includes private
repositories and temporary commits. Known real credential files remain private.
Controlled programs may directly read approved protected configuration for an
authorized purpose; redact before output, preserve identity/permission
separation and never send long-term keys to frontend code. Do not call a live
credential to test validity or read all local secrets for comparison.

Determine findings from actual values, formats and context. Field names,
TypeScript types, references, environment reads, public certificates/keys,
ordinary hashes, explicit placeholders and reviewed synthetic samples pass. IPs,
ordinary domains/URLs, names, emails, paths, cloud resource identifiers,
extensions, SVG, normal images, LFS pointers and Git configuration forms are not
credential findings and require no privacy approval on their own. Do not
proactively publish unrelated personal information or intentionally conceal a
secret in an attachment. Readable files, including service/timer/SVG files, are
content-scanned; ordinary binaries need no mandatory OCR or recursive unpacking.

## Incremental delivery and one 120-second allowance

Reuse the current commands and configured anonymous Git identity/noreply email.
Do not re-approve identities, inspect every worktree configuration, reinstall
hooks on each delivery, or start a separate confidentiality review agent. Normal
independent code review and functional tests remain required.

Commit checks the actual staged versions and exact proposed message. Push checks
the commits actually new to this delivery, including secrets in intermediate
commits later deleted. Non-Git publication checks only the exact outgoing text
and specified attachment content. Do not scan all history or unrelated remote
branches. Missing unrelated objects or normal includeIf/worktree configuration
is not evidence of credential disclosure.

Use one delivery batch and a shared total allowance of 120 seconds for security
preparation, Git reads, scanning, duplicates and necessary retries across
commit, push and publication. Reuse content-hash plus rule-version results,
including syntax context; changes invalidate applicable results. Do not allocate
120 seconds independently to each action or change batch IDs merely to retry.
All subprocesses receive the remaining allowance and a real deadline; terminate
related processes at expiry and return one result, without automatic retry.
Functional testing, normal code review and coding time are outside this added
security-work allowance.

PASS means completed without a core hit. WARN is non-blocking and continues.
BLOCK means a high-confidence core-credential hit. INCOMPLETE means the relevant
core check could not finish because of a concrete tool/input/budget gap; pause
only that unchecked outward action, never the entire business task. Report
repository-relative paths, line numbers and categories, never matched values. Do
not use no-verify, disable credential checks or introduce broad allowlists. Keep
GitHub secret scanning/push protection enabled; platform restrictions are
separate and must be reported accurately once, not claimed to be changed.

## Scoped persistence and incident handling

Update effective global/project rules and installed scanner copies through the
controlled updater, preserving unrelated configuration. Existing sessions must
explicitly reload; verify a new session. Other computers and unconfigured clones
do not automatically inherit installation. Do not claim complete prevention.

For actual credential exposure, stop propagation and privately report category,
location and impact. Revoke/rotate under existing incident authority or give the
Owner the concrete missing action. History rewrites, force pushes and
destructive cleanup still need separate authorization. Do not expand a bounded
correction into historical cleansing, cloud changes or a new security platform.
After the fix and normal review, resume the original business task immediately.

Policy verification marker: CORE-CREDENTIAL-CHECK-V2.

## Existing command entry points

Use the existing `confidentiality:staged`, `confidentiality:message`,
`confidentiality:outbound`, `confidentiality:health`, `confidentiality:install`
and `test:confidentiality` commands. Health and installation are explicit
maintenance operations; hooks do not reinstall or enumerate worktrees. A
controlled version change uses `confidentiality:install --update`, verifies only
the current installation and preserves other Git settings.

Hooks run the installed scanner, including in older checkouts. Cache entries
contain findings, not input values, and use content SHA-256, scanner/rule hash
and syntax context. Normal filenames remain visible; a credential embedded in a
filename is the narrow exception to avoid echoing the match.

Use a stable `CONFIDENTIALITY_BATCH_ID` for a multi-action delivery; otherwise
the staged tree identifies the batch. The same batch persists one 120000 ms
allowance in the local Git directory across commit/message/push/outbound.
Preparation and retries consume that allowance. Each active invocation's
absolute deadline is derived from the same remaining allowance; idle time,
coding, functional tests and normal review are not security work. Do not assign
new batch IDs to repeat an exhausted check. Only a new delivery starts a new
allowance. Rule or content changes invalidate the applicable cache entries,
without replenishing the same delivery's budget.

Existing-branch pushes use Git's exact pre-push remote old object. New branches
use only the remote default-branch baseline; unrelated heads/tags are never
queried or required locally. If that relevant base is missing, report the
specific input gap as INCOMPLETE; do not fetch or inspect unrelated branches.
Merge result blobs are compared to every parent. Only changed blobs and new
commit/tag metadata are inspected; ordinary historical authors are not
rewritten.

Binary content receives WARN without OCR/unpacking. A genuinely unreadable
required text or Git object receives INCOMPLETE, never a credential BLOCK. The
check cannot prove that transformed or deliberately concealed data is safe.
Known real credential files must not be sent even when automatic coverage is
limited. These limits do not create additional approvals for ordinary files.
