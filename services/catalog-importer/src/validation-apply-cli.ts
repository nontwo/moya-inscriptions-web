import { readFile, writeFile } from "node:fs/promises";

import {
  catalogImportDryRunSchema,
  importApprovalSchema,
} from "@moya/contracts/internal/catalog-import";
import { catalogIdSchema } from "@moya/contracts/schemas";
import { Pool } from "pg";

import { applyCatalogImport, parseCatalogImportCsvBundle } from "./index.js";

const [bundleDirectory, dryRunFile, approvalFile, outputFile, operationId] =
  process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;
if (
  bundleDirectory === undefined ||
  dryRunFile === undefined ||
  approvalFile === undefined ||
  outputFile === undefined ||
  operationId === undefined ||
  databaseUrl === undefined ||
  process.env.P5_VALIDATION_RUNTIME !== "DISPOSABLE_DATABASE"
) {
  throw new Error(
    "Usage: P5_VALIDATION_RUNTIME=DISPOSABLE_DATABASE DATABASE_URL=... p5:apply-validation <bundle> <dry-run.json> <approval.json> <output.json> <operation-id>",
  );
}

const approvalDocument = JSON.parse(await readFile(approvalFile, "utf8")) as {
  approval?: unknown;
  ownerInstructionReference?: unknown;
};
if (
  typeof approvalDocument.ownerInstructionReference !== "string" ||
  approvalDocument.ownerInstructionReference.length === 0
) {
  throw new Error(
    "Validation approval requires an Owner instruction reference",
  );
}
const approval = importApprovalSchema.parse(approvalDocument.approval);
const dryRun = catalogImportDryRunSchema.parse(
  JSON.parse(await readFile(dryRunFile, "utf8")),
);
const parsed = await parseCatalogImportCsvBundle(bundleDirectory);
const pool = new Pool({ connectionString: databaseUrl });
try {
  const result = await applyCatalogImport(pool, {
    operationId,
    parsed,
    dryRun,
    authorization: {
      runtime: "VALIDATION",
      purpose: "VALIDATION_ONLY",
      nonProduction: true,
      disposableDatabase: true,
      publicationApproval: false,
      reusableForProduction: false,
      ownerInstructionReference: approvalDocument.ownerInstructionReference,
      approval,
    },
    catalogIdAllocator: {
      allocateCatalogId: ({ catalogImportId }) =>
        catalogIdSchema.parse(`validation-catalog-${catalogImportId}`),
    },
    appliedAt: new Date().toISOString(),
  });
  await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`);
} finally {
  await pool.end();
}
