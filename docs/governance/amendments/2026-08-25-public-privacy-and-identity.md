# Owner Amendment — Public Privacy and Identity

- Status: Active
- Effective date: 2026-08-25
- Applies to:
  - every agent, Codex task, and contributor;
  - commits, annotated tags, pushes, branches, pull requests, issues, reviews,
    comments, Actions logs, reports, screenshots, uploads, and generated
    artifacts.

This amendment establishes the permanent public-privacy authority for the
repository. It does not rewrite or reject accepted public history solely for
legacy metadata.

## 1. Approved Git identities

Owner-operated and Codex-generated Git writes must use exactly:

```text
nontwo <163475477+nontwo@users.noreply.github.com>
```

Other genuine human contributors must use a GitHub ID-based noreply address. For
an address such as `12345678+example@users.noreply.github.com`, the Git display
name should normally be the corresponding handle, `example`.

GitHub-generated identities are permitted, including
`GitHub <noreply@github.com>`, `github-actions[bot]` with its GitHub noreply
address, and Dependabot with its GitHub noreply address.

AI tools must not be represented by an email-bearing human co-author identity.
Use `Assisted-by: Codex` where useful, or omit AI attribution.

## 2. Protected information

No agent or contributor may introduce any of the following into a public
surface:

- non-noreply personal email addresses or personal phone numbers;
- private home or mailing addresses;
- student, government, passport, tax, banking, payment, medical, or immigration
  identifiers;
- personal absolute paths such as `/Users/<personal-name>/`,
  `/home/<personal-name>/`, or `C:\Users\<personal-name>\`;
- local filenames that reveal private filesystem organization;
- private repository URLs or slugs;
- private research commit identities or export paths;
- private database, storage, evidence, or cloud locators;
- tokens, API keys, passwords, private keys, certificates, authenticated URLs,
  production connection strings, or raw environment dumps;
- private notifications, account names, unrelated tabs, or private content in
  screenshots;
- EXIF GPS, author, creator, company, path, device-owner, or contact metadata;
- personal information in commit messages or trailers; or
- personal information in pull request titles and bodies, comments, reviews,
  issues, labels, branch names, or release descriptions.

Use neutral provenance instead of retaining private locators or filenames:

```text
Owner-supplied source asset; private source retained by the Owner.
```

```text
Derived from an Owner-reviewed private research export.
```

## 3. Mandatory task preflights

Before the first commit, annotated tag, push, pull request creation, issue,
review, comment, or other GitHub write in every task, run:

```bash
node scripts/setup-safe-git-identity.mjs --verify-and-apply
git var GIT_AUTHOR_IDENT
git var GIT_COMMITTER_IDENT
node scripts/check-public-safety.mjs --current-identity
```

Before creating or editing a pull request, issue, review, comment, release
description, or public report:

1. write the exact text to a temporary file;
2. run `node scripts/check-public-text.mjs <temporary-file>`;
3. use `--body-file` or the corresponding file-based GitHub CLI option; and
4. delete the temporary file afterward.

The same temporary-file scan is required even for a short inline message. Do not
publish raw environment output or complete suspected credentials.

## 4. Safe reporting and no bypass

Scanner output and reports must redact suspected credentials and personal
values. A failure may identify the finding class, file or object, line number,
commit or ref, and required remediation, but it must not reproduce the complete
protected value.

A privacy or secret scanner failure must never be skipped, downgraded, hidden,
or converted into an allowlist entry merely to make CI pass. Any exception
requires an explicit Owner decision.

## 5. Binary and document metadata

Every changed PNG, JPEG, WebP, PDF, XLSX, DOCX, PPTX, or other ZIP-based OOXML
artifact must be metadata-scanned. The scan covers document core, application,
and custom properties; comments; external links; relationships; embedded files;
macros; EXIF/XMP; GPS; author or creator identity; company, account, contact,
and device-owner data; local paths; and embedded credentials or active content.

Do not modify already approved asset bytes solely to normalize harmless legacy
metadata. A newly discovered severe issue must be removed before publication.

## 6. Legacy boundary and stale branches

`docs/governance/privacy/legacy-public-ref-boundary.json` freezes the accepted
public branch tips, annotated-tag objects and peeled targets, and active pull
request heads that existed when this amendment was introduced.

- Objects reachable from that frozen boundary are not retroactively rejected
  solely for old author, committer, tagger, trailer, or tag-message metadata.
- Every new commit, tag object, message, filename, public text, and changed
  content is fully enforced.
- A new commit on an old branch is not grandfathered.
- A new annotated tag object is not grandfathered even when it points to an old
  commit.
- Changed content must never reintroduce cleaned private paths or locators.

GitHub resolves a tag-triggered workflow from the tagged revision, so a tag
pointing to pre-amendment history cannot be made reliably self-scanning. The
active repository tag ruleset therefore blocks creation, update, deletion, and
non-fast-forward changes for all public tag refs with no bypass actor. New tags
remain denied unless the Owner explicitly replaces that control with an equally
enforceable default-branch-anchored validation mechanism.

Before the next substantive update to a branch created before this amendment,
the responsible agent must:

1. run the identity setup command;
2. fetch current `integration/mvp`;
3. reconcile the branch without reintroducing cleaned provenance;
4. preserve the current sanitized public provenance and licensing files;
5. run the full public-safety check;
6. scan the new pull request body or update comment; and
7. recognize that a substantive head change invalidates earlier code review or
   visual-acceptance evidence.

## 7. GitHub text-write procedure

Use the following shape for all public GitHub text writes:

```bash
node scripts/check-public-text.mjs /tmp/pr-body.md
gh pr create --title "chore(repo): scoped change" --body-file /tmp/pr-body.md
rm -f /tmp/pr-body.md
```

The temporary file must be created privately and must contain only intended
public text. Apply the same procedure to pull request comments, reviews, issues,
release notes, and long-form status reports.

## 8. Governance audit

| Existing protection                                                      | Classification | Result                                                               |
| ------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------- |
| Constitution authority, scope, product, data, dependency, and STOP rules | PRESERVE       | Unchanged and fully applicable                                       |
| Machine-verified review and merge amendment                              | PRESERVE       | Privacy work remains independently reviewed and exact-head verified  |
| Existing secret and production-credential prohibitions                   | MERGE          | Retained and enforced by the shared privacy scanner                  |
| Root agent entry-point instructions                                      | MODERNIZE      | Adds a concise mandatory link and task preflight                     |
| Contributor and pull request operational guidance                        | MODERNIZE      | Adds identity, text, range, and metadata checks                      |
| Existing CI job semantics                                                | PRESERVE       | `lint`, `typecheck`, `test`, `build`, and `e2e` retain their meaning |
| Existing public history                                                  | PRESERVE       | Frozen boundary prevents retroactive rejection; no history rewrite   |

No current protection is retired by this amendment.
