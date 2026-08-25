#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  exitForFindings,
  loadPrivatePatterns,
  scanText,
} from "./privacy/public-safety-lib.mjs";

if (process.argv.length !== 3) {
  process.stderr.write("Usage: node scripts/check-public-text.mjs <file>\n");
  process.exit(2);
}

try {
  const filename = process.argv[2];
  const text = readFileSync(filename, "utf8");
  const findings = scanText(text, {
    privatePatterns: loadPrivatePatterns(),
    target: "public text",
  });
  process.exitCode = exitForFindings(findings);
} catch {
  process.stdout.write("PUBLIC-SAFETY FAIL\n");
  process.stdout.write("- public text could not be read or scanned\n");
  process.exitCode = 1;
}
