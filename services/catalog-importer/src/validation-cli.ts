import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { importApprovalSchema } from "@moya/contracts/internal/catalog-import";
import { Pool } from "pg";

import {
  applyCatalogImport,
  createCatalogImportDryRun,
  hashApproval,
  parseCatalogImportCsvBundle,
} from "./index.js";

const [bundleDirectory, outputDirectory, ownerInstructionReference] =
  process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;
if (
  bundleDirectory === undefined ||
  outputDirectory === undefined ||
  ownerInstructionReference === undefined ||
  databaseUrl === undefined
) {
  throw new Error(
    "Usage: DATABASE_URL=... p5:validate <bundle> <output> <owner-instruction-reference>",
  );
}

const writeJson = async (filename: string, value: unknown) => {
  await writeFile(
    path.join(outputDirectory, filename),
    `${JSON.stringify(value, null, 2)}\n`,
  );
};

const pool = new Pool({ connectionString: databaseUrl });
try {
  await mkdir(outputDirectory, { recursive: true });
  const executedAt = new Date().toISOString();
  const parsed = await parseCatalogImportCsvBundle(bundleDirectory);
  const dryRun = await createCatalogImportDryRun(pool, parsed, executedAt);
  await writeJson("dry-run.json", dryRun);
  const exactlyClean =
    dryRun.state === "PASSED" &&
    dryRun.applyReady &&
    dryRun.findings.length === 0 &&
    dryRun.applyBlockers.length === 0 &&
    dryRun.resultCounts.add === 28 &&
    dryRun.resultCounts.update === 0 &&
    dryRun.resultCounts.unchanged === 0 &&
    dryRun.resultCounts.conflict === 0 &&
    dryRun.resultCounts.error === 0 &&
    parsed.rowCounts.catalog === 28;
  if (!exactlyClean) {
    process.stderr.write("P5 IMPORT DRY-RUN — OWNER REVIEW REQUIRED\n");
    process.exitCode = 42;
  } else {
    const approval = importApprovalSchema.parse({
      importContractVersion: "catalog-import/v1",
      canonicalInputSha256: parsed.canonicalInputSha256,
      dryRunResultSha256: dryRun.dryRunResultSha256,
      state: "APPROVED",
      approvedFindingIds: [],
      decidedBy:
        "OWNER / owner — VALIDATION_ONLY NON_PRODUCTION DISPOSABLE_DATABASE",
      decidedAt: executedAt,
    });
    const validationContext = {
      validationOnly: true as const,
      nonProduction: true as const,
      disposableDatabase: true as const,
      publicationApproval: false as const,
      reusableForProduction: false as const,
      ownerInstructionReference,
    };
    await writeJson("validation-approval.json", {
      approval,
      approvalSha256: hashApproval(approval),
      validationContext,
    });
    const input = {
      operationId: `p5-validation-${parsed.canonicalInputSha256.slice(0, 32)}`,
      parsed,
      dryRun,
      approval,
      validationContext,
      appliedAt: executedAt,
    };
    const application = await applyCatalogImport(pool, input);
    await writeJson("application-result.json", application);
    await writeJson(
      "replay-result.json",
      await applyCatalogImport(pool, input),
    );
    const persisted = await pool.query(
      `SELECT e.*, s.source_id
       FROM catalog_entries e
       JOIN catalog_import_sources s ON s.catalog_id = e.catalog_id
       ORDER BY e.catalog_id`,
    );
    const records = application.catalogIdMap.map((mapping) => {
      const expected = parsed.envelope.catalogRows.find(
        ({ catalogImportId }) =>
          String(catalogImportId) === mapping.catalogImportId,
      );
      const actual = persisted.rows.find(
        ({ catalog_id }) => String(catalog_id) === mapping.catalogId,
      );
      if (expected === undefined || actual === undefined) {
        throw new Error("Applied Catalog row is missing from PostgreSQL");
      }
      const fields = [
        ["dynasty", "dynasty"],
        ["dateText", "date_text"],
        ["province", "province"],
        ["prefecture", "prefecture"],
        ["county", "county"],
        ["currentLocation", "current_location"],
        ["currentCustodian", "current_custodian"],
        ["description", "description"],
      ] as const;
      const fieldComparisons = Object.fromEntries(
        fields.map(([field, databaseField]) => {
          const expectedField = expected[field];
          const actualValue = actual[databaseField];
          const actualState = actual[`${databaseField}_state`];
          return [
            field,
            {
              expected: expectedField,
              actual: {
                state: actualState,
                ...(actualValue === null ? {} : { value: actualValue }),
              },
              match:
                expectedField.state === actualState &&
                (expectedField.state !== "VALUE" ||
                  expectedField.value === actualValue),
            },
          ];
        }),
      );
      return {
        ...mapping,
        title: { expected: expected.title, actual: actual.title },
        catalogKind: { expected: expected.catalogKind, actual: actual.kind },
        sourceId: {
          expected: String(expected.sourceId),
          actual: actual.source_id,
        },
        fields: fieldComparisons,
        matches:
          expected.title === actual.title &&
          expected.catalogKind === actual.kind &&
          String(expected.sourceId) === actual.source_id &&
          Object.values(fieldComparisons).every(({ match }) => match),
      };
    });
    await writeJson("postgres-comparison.json", {
      canonicalInputSha256: parsed.canonicalInputSha256,
      records,
      allMatched: records.every(({ matches }) => matches),
      publicContractDisposition:
        "Persisted fields absent from the current Public DTO are NOT_EXPOSED_BY_CURRENT_PUBLIC_CONTRACT.",
    });
    const counts = await pool.query(
      `SELECT
        (SELECT COUNT(*)::integer FROM catalog_entries) AS catalog_entries,
        (SELECT COUNT(*)::integer FROM catalog_aliases) AS catalog_aliases,
        (SELECT COUNT(*)::integer FROM catalog_import_sources) AS catalog_import_sources,
        (SELECT COUNT(*)::integer FROM catalog_import_operations) AS catalog_import_operations,
        (SELECT COUNT(*)::integer FROM catalog_import_operation_items) AS catalog_import_operation_items`,
    );
    await writeJson("database-summary.json", {
      counts: counts.rows[0],
      allFieldComparisonsMatched: records.every(({ matches }) => matches),
    });
    const syntheticCatalogId = application.catalogIdMap[0]?.catalogId;
    if (syntheticCatalogId === undefined) {
      throw new Error("Validation CatalogId map is empty");
    }
    await pool.query("BEGIN");
    try {
      const update = await pool.query(
        "UPDATE catalog_entries SET title = title || $2 WHERE catalog_id = $1 RETURNING catalog_id",
        [syntheticCatalogId, "（validation update）"],
      );
      const total = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM catalog_entries",
      );
      await writeJson("synthetic-update-validation.json", {
        catalogId: syntheticCatalogId,
        updateMatchedSameCatalog:
          update.rows[0]?.catalog_id === syntheticCatalogId,
        catalogCountDuringUpdate: total.rows[0]?.count,
        duplicateCreated: total.rows[0]?.count !== 28,
        persistence: "ROLLED_BACK",
      });
    } finally {
      await pool.query("ROLLBACK");
    }
  }
} finally {
  await pool.end();
}
