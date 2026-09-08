import {
  readProtectedMigrationJSON,
  runLegacyEditorialMigration,
} from "../src/migration/run";

async function main() {
  const args = process.argv.slice(2);
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      !key ||
      !["--mode", "--source", "--target", "--settings"].includes(key) ||
      !value ||
      value.startsWith("--") ||
      flags.has(key)
    )
      throw new Error("ARGUMENTS_INVALID");
    flags.set(key, value);
  }
  const mode = flags.get("--mode");
  const source = flags.get("--source");
  const target = flags.get("--target");
  if (!source || (mode !== "dry-run" && mode !== "apply"))
    throw new Error("ARGUMENTS_INVALID");
  if (mode === "apply" && (!flags.has("--target") || !flags.has("--settings")))
    throw new Error("ARGUMENTS_INVALID");
  const snapshot = await readProtectedMigrationJSON(source);
  const report = await runLegacyEditorialMigration({
    snapshot,
    mode,
    ...(mode === "apply"
      ? {
          ...(target === undefined ? {} : { target }),
          settings: await readProtectedMigrationJSON(flags.get("--settings")!),
        }
      : {}),
  });
  console.log(JSON.stringify(report));
  if (report.status === "BLOCKED") process.exit(1);
}

// Payload awaits module import, then exits with 0. Await the complete script
// here and explicitly terminate failures so its wrapper cannot erase them.
await main().catch(() => {
  console.log(
    JSON.stringify({
      status: "BLOCKED",
      category: "PROTECTED_MIGRATION_INPUT_REQUIRED",
    }),
  );
  process.exit(1);
});
