# ArtVenn HarmonyOS

This directory is the HarmonyOS native-client domain for 由于艺 / ArtVenn.

The repository foundation is in place. The real DevEco project is not.

Reserved future product location:

```text
apps/harmony/ArtVenn/
```

Generate that project on the partner machine in a later task. Do not invent
DevEco files here, and do not add a nested Git repository.

## A. Product direction

ArtVenn HarmonyOS is one native client:

- ArkTS
- ArkUI
- Stage model
- Phone + Tablet from the same app
- Foldable through adaptive layout
- later 2in1 / Wearable expansion

Do not use Flutter, React Native, or a WebView shell as the primary
implementation.

Apple (`apps/apple/**`), HarmonyOS (`apps/harmony/**`), and Web (`apps/web/**`)
are independent presentation clients. They may share Backend / Public API
contracts. They do not share native UI implementation.

## B. Future local toolchain

Install and verify the current official stable:

- DevEco Studio
- HarmonyOS SDK
- ArkTS / ArkUI toolchain

Do not freeze obsolete version numbers in this foundation. The real bootstrap
task must record the exact installed versions.

Do not install that toolchain for this foundation task.

## C. Future project generation

In the later **Harmony Multidevice Bootstrap V1** task, generate the supported
DevEco project directly into:

```text
apps/harmony/ArtVenn/
```

Use the current official ArkTS / ArkUI / Stage template on the partner computer.
Keep this repository. Do not create another clone or nested `.git`.

## D. Repository workflow

```text
origin/main
  → Task Issue
  → isolated worktree
  → task branch
  → implementation
  → applicable validation
  → Draft PR
  → independent review
  → merge
  → cleanup
```

Use the shared workflow in [`docs/development/task-workflow.md`](../../docs/development/task-workflow.md)
and the root [`AGENTS.md`](../../AGENTS.md). One mutable worktree has one writer.
DevEco Studio and the editor/agent must use the same task worktree.

Scope follows the task and the actual changed paths. It does not follow the
name of a person or tool. Cursor, Codex, Claude, or another authorized agent
may later implement, review, debug, or take over Harmony work.

## E. Platform isolation

A Harmony-only change under `apps/harmony/**` must not invoke Apple full
validation, Web complete validation, or CMS / browser / database integration.

Shared contract or shared-path changes may legitimately select multiple
platforms. If a Harmony task discovers that a shared API or contract must
change:

```text
Harmony task
  → record the dependency
  → create or request a separate Shared task
  → authorize the affected shared paths
  → validate every actually affected client
```

Do not edit Apple, Web, Admin, or Backend as a convenience.

Current hosted native status:

```text
HARMONY_NATIVE_VALIDATION_NOT_YET_CONFIGURED
```

There is no real Harmony project or toolchain in this foundation. Do not treat
lightweight routing success as a native compile PASS, and do not add a green
no-op "Harmony build" job.

## F. Network direction

Direction only; not implemented here:

```text
ArkUI
  → feature state
  → Repository
  → API client
  → reusable HarmonyOS Remote Communication Kit session
  → existing ArtVenn Public API
```

Never connect Harmony directly to TencentDB. Never embed COS or Tencent secrets.

## G. Media direction

A future native image layer should use HarmonyOS-native APIs and
backend-provided media URLs. Do not construct provider-specific object URLs in
UI code.

## H. Partner handoff checklist

After this foundation merges, the partner should:

1. Become a repository collaborator with ordinary Write capability if the Owner
   has already granted it. Do not request Admin, secret management, protection
   bypass, force-push, or main rewrite.
2. Clone `nontwo/moya-inscriptions-web` once. Do not create a second repository.
3. Fetch current `origin/main` and read root `AGENTS.md`,
   `docs/development/task-workflow.md`, and this directory's `AGENTS.md`.
4. Install the current official stable DevEco Studio, HarmonyOS SDK, and
   ArkTS / ArkUI toolchain on the partner machine. Record exact versions in the
   bootstrap task.
5. Create the next Task Issue: **Harmony Multidevice Bootstrap V1**.
6. Create one isolated task worktree from freshly fetched `origin/main`.
7. Generate the official ArkTS / ArkUI / Stage project into
   `apps/harmony/ArtVenn/`.
8. Keep signing material, Huawei account data, certificates, private keys, and
   device identifiers out of Git.
9. Run applicable validation, open a Draft PR, and follow independent review
   plus the existing protected-main workflow.

The partner may then autonomously perform ordinary Harmony-only development:
create Harmony Issues, branches, and worktrees; write ArkTS / ArkUI; modify
Harmony-specific project configuration; add Harmony tests; run local Harmony
validation; push; open PRs; review Harmony changes; and merge eligible
Harmony-only PRs after required checks and workflow rules pass.

The partner does not receive automatic authority over Apple, Web, Admin,
Backend behavior, shared contracts, migrations, authentication, media
contracts, infra, Production, repository governance, security policy, or
organization administration.
