# HarmonyOS task instructions

Apply the root repository authority and the
[shared task workflow](../../docs/development/task-workflow.md). These local
instructions add HarmonyOS requirements; they do not grant a wider task scope
and they do not replace the Constitution or active amendments.

- HarmonyOS work is native ArkTS + ArkUI + Stage-model work. The reserved
  future product project root is `apps/harmony/ArtVenn`. Do not invent a
  DevEco-generated tree from memory; generate it with the current official
  template in the authorized bootstrap task.
- Keep a pure Harmony task inside `apps/harmony/**` unless Shared scope is
  explicitly authorized. Reading Apple, Web, or shared interfaces does not
  grant write authority there.
- One mutable worktree has one writer. DevEco Studio and Cursor (or another
  authorized agent) must operate on the same task worktree.
- Ordinary Harmony product development may be delegated to the partner. Platform
  responsibility still follows task scope and changed paths, not the name of a
  person or tool.
- Production AppGallery identity and publisher ownership remain Owner-controlled.
  Never commit signing secrets, Huawei account information, certificates,
  private keys, device identifiers, or other credentials.
- Shared API or contract changes require a separate Shared task and validation
  of every actually affected client. Do not silently edit Apple, Web, Admin, or
  Backend to complete a Harmony feature.
- Local device or simulator evidence must not be described as hosted CI. Owner
  real-device or visual judgment remains required when a task explicitly needs
  it.
- Hosted Harmony native validation is not configured yet
  (`HARMONY_NATIVE_VALIDATION_NOT_YET_CONFIGURED`). Report that state until the
  bootstrap task defines the first real DevEco command. Do not invent a green
  no-op Harmony build.
