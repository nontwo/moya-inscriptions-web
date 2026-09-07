import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  applyPilotImport,
  assertPilotApproval,
  preparePilotImport,
  readPilotMedia,
  syncPilotMedia,
} from "@moya/catalog-importer";
import { assertPostgresStartupReady } from "@moya/catalog-postgres";
import { platformCatalogIdAllocator } from "./catalog-id-allocator.js";
import { loadPilotConfiguration, openPilotPool } from "./pilot-config.js";
import type { PilotApprovalDocument } from "@moya/catalog-importer";

const readJson = async (file: string) =>
  JSON.parse(await readFile(file, "utf8"));
const save = async (directory: string, name: string, value: unknown) => {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, name);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  await rename(temporary, destination);
};

const main = async () => {
  const [command, directory, ...args] = process.argv.slice(2);
  if (!directory || !["prepare", "apply", "media"].includes(command ?? ""))
    throw new Error(
      "Usage: pilot <prepare|apply|media> <evidence-directory> [command arguments]",
    );
  const config = await loadPilotConfiguration(process.env);
  // Missing or mismatched authority fails before opening a write-capable connection.
  let document: PilotApprovalDocument | undefined;
  if (command === "apply" || command === "media") {
    if (!args[0]) throw new Error("An explicit approval file is required");
    document = (await readJson(args[0])) as PilotApprovalDocument;
    assertPilotApproval(config.scope, document);
  }
  const pool = openPilotPool(process.env, config.scope);
  try {
    await assertPostgresStartupReady(pool);
    await readPilotMedia(config.manifestFile, config.scope);
    if (command === "prepare") {
      if (args.length !== 1 || !args[0])
        throw new Error("prepare requires one v2 CSV bundle directory");
      const prepared = await preparePilotImport(pool, args[0], config.scope);
      await save(
        directory,
        `${config.scope.operationId}.prepare.json`,
        prepared,
      );
      console.info(
        JSON.stringify({
          status: "PREPARED",
          operationId: config.scope.operationId,
          canonicalInputSha256: prepared.canonicalInputSha256,
          dryRunResultSha256: prepared.dryRun.dryRunResultSha256,
          findings: prepared.dryRun.findings.length,
          applyReady: prepared.dryRun.applyReady,
        }),
      );
    } else if (command === "apply") {
      if (args.length !== 3 || !args[1] || !args[2] || !document)
        throw new Error(
          "apply requires approval.json, prepare.json, v2 bundle directory",
        );
      const prepared = (await readJson(args[1])) as Awaited<
        ReturnType<typeof preparePilotImport>
      >;
      if (
        prepared.operationId !== config.scope.operationId ||
        prepared.targetScopeSha256 !== document.targetScopeSha256 ||
        prepared.mediaManifestSha256 !== config.scope.mediaManifestSha256 ||
        prepared.publicationApproval !== false
      )
        throw new Error("Prepared evidence does not match approved target");
      const result = await applyPilotImport(
        pool,
        args[2],
        config.scope,
        prepared.dryRun,
        document,
        platformCatalogIdAllocator,
      );
      await save(directory, `${config.scope.operationId}.apply.json`, result);
      console.info(JSON.stringify(result));
    } else {
      if (args.length !== 2 || !args[1] || !document)
        throw new Error(
          "media requires approval.json and explicit selected-photo root",
        );
      const result = await syncPilotMedia({
        pool,
        scope: config.scope,
        approval: document,
        manifestFile: config.manifestFile,
        photoRoot: args[1],
        transport: config.storage,
        onProgress: async (rows) =>
          save(directory, `${config.scope.operationId}.media.json`, {
            operationId: config.scope.operationId,
            targetScopeSha256: document.targetScopeSha256,
            mediaManifestSha256: config.scope.mediaManifestSha256,
            rows,
          }),
      });
      const failed = result.filter((r) => r.registration === "failed").length;
      console.info(
        JSON.stringify({
          status: failed ? "PARTIAL" : "VERIFIED_AND_REGISTERED",
          operationId: config.scope.operationId,
          total: result.length,
          failed,
        }),
      );
      if (failed) process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
};

main().catch(() => {
  // Driver/provider exceptions can contain private endpoints or authentication data.
  console.error(
    "[pilot] operation stopped; check scoped configuration, approval and retained progress evidence",
  );
  process.exitCode = 1;
});
