import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

import {
  createCatalogImportDryRun,
  parseCatalogImportCsvBundle,
} from "./index.js";

const [bundleDirectory, outputDirectory] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;
if (
  bundleDirectory === undefined ||
  outputDirectory === undefined ||
  databaseUrl === undefined
) {
  throw new Error("Usage: DATABASE_URL=... p5:validate <bundle> <output>");
}

const pool = new Pool({ connectionString: databaseUrl });
try {
  await mkdir(outputDirectory, { recursive: true });
  const parsed = await parseCatalogImportCsvBundle(bundleDirectory);
  const dryRun = await createCatalogImportDryRun(
    pool,
    parsed,
    new Date().toISOString(),
  );
  await writeFile(
    path.join(outputDirectory, "dry-run.json"),
    `${JSON.stringify(dryRun, null, 2)}\n`,
  );
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
  }
} finally {
  await pool.end();
}
