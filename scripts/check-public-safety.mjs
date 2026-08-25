#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  exitForFindings,
  inspectCurrentIdentity,
  scanCommitMessageFile,
  scanGithubEvent,
  scanPrePushInput,
  scanRange,
  scanStaged,
} from "./privacy/public-safety-lib.mjs";

const args = process.argv.slice(2);

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function usage() {
  process.stderr.write(
    [
      "Usage:",
      "  node scripts/check-public-safety.mjs --current-identity",
      "  node scripts/check-public-safety.mjs --staged",
      "  node scripts/check-public-safety.mjs --commit-message <file>",
      "  node scripts/check-public-safety.mjs --base <sha> --head <sha>",
      "  node scripts/check-public-safety.mjs --event <github-event-json>",
      "  node scripts/check-public-safety.mjs --pre-push",
    ].join("\n") + "\n",
  );
}

try {
  let findings;
  if (args.length === 0) {
    findings = [...inspectCurrentIdentity(), ...scanStaged()];
  } else if (args.length === 1 && args[0] === "--current-identity") {
    findings = inspectCurrentIdentity();
  } else if (args.length === 1 && args[0] === "--staged") {
    findings = scanStaged();
  } else if (args.length === 2 && args[0] === "--commit-message") {
    findings = scanCommitMessageFile(args[1]);
  } else if (
    args.length === 4 &&
    args.includes("--base") &&
    args.includes("--head")
  ) {
    const base = valueAfter("--base");
    const head = valueAfter("--head");
    if (!base || !head) throw new Error("missing range");
    findings = scanRange(base, head);
  } else if (args.length === 2 && args[0] === "--event") {
    findings = scanGithubEvent(args[1]);
  } else if (args.length === 1 && args[0] === "--pre-push") {
    findings = scanPrePushInput(readFileSync(0, "utf8"));
  } else {
    usage();
    process.exit(2);
  }
  process.exitCode = exitForFindings(findings);
} catch {
  process.stdout.write("PUBLIC-SAFETY FAIL\n");
  process.stdout.write(
    "- the requested scan could not complete without exposing private values\n",
  );
  process.exitCode = 1;
}
