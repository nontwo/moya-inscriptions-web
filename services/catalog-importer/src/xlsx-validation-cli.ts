import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

import {
  CatalogImportDiagnosticError,
  createCatalogImportDryRun,
  parseCatalogImportXlsxFile,
} from "./index.js";

const [workbookPath, outputDirectory] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;
if (
  workbookPath === undefined ||
  outputDirectory === undefined ||
  databaseUrl === undefined
) {
  throw new Error(
    "Usage: DATABASE_URL=... catalog-import:validate-xlsx <workbook.xlsx> <output-directory>",
  );
}

await mkdir(outputDirectory, { recursive: true });
const resultPath = path.join(outputDirectory, "validation.json");
const pool = new Pool({ connectionString: databaseUrl });
try {
  const parsed = await parseCatalogImportXlsxFile(workbookPath);
  const dryRun = await createCatalogImportDryRun(
    pool,
    parsed,
    new Date().toISOString(),
  );
  await writeFile(
    resultPath,
    `${JSON.stringify(
      {
        inputFormat: "XLSX",
        sourceArtifactSha256: parsed.sourceArtifactSha256,
        canonicalInputSha256: parsed.canonicalInputSha256,
        rowCounts: parsed.rowCounts,
        diagnostics: parsed.diagnostics ?? [],
        dryRun,
        applied: false,
      },
      null,
      2,
    )}\n`,
  );
  if (!dryRun.applyReady) process.exitCode = 42;
} catch (error) {
  if (!(error instanceof CatalogImportDiagnosticError)) throw error;
  await writeFile(
    resultPath,
    `${JSON.stringify(
      {
        inputFormat: "XLSX",
        diagnostics: error.diagnostics,
        applied: false,
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 42;
} finally {
  await pool.end();
}
