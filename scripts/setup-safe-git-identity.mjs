#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  APPROVED_EMAIL,
  APPROVED_NAME,
  gitCommonDirectory,
  inspectCurrentIdentity,
  loadPrivatePatterns,
  repositoryRoot,
  writePrivatePatterns,
} from "./privacy/public-safety-lib.mjs";

const mode = process.argv[2];
if (
  !["--verify-and-apply", "--verify-only"].includes(mode) ||
  process.argv.length !== 3
) {
  process.stderr.write(
    "Usage: node scripts/setup-safe-git-identity.mjs --verify-and-apply|--verify-only\n",
  );
  process.exit(2);
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      "Git identity configuration failed without emitting sensitive output.",
    );
  }
  return result;
}

function collectUnsafeEmails(root) {
  const values = new Set(loadPrivatePatterns(root));
  values.add(os.homedir());

  const configured = git(
    ["config", "--includes", "--get-regexp", "^user\\.email$"],
    { allowFailure: true, cwd: root },
  );
  if (configured.status === 0) {
    for (const line of configured.stdout.split(/\r?\n/u)) {
      const email = line.match(/^\S+\s+(.*)$/u)?.[1]?.trim() ?? "";
      if (email && email !== APPROVED_EMAIL && !email.endsWith(".invalid"))
        values.add(email);
    }
  }

  for (const variable of ["GIT_AUTHOR_EMAIL", "GIT_COMMITTER_EMAIL", "EMAIL"]) {
    const email = process.env[variable];
    if (email && email !== APPROVED_EMAIL && !email.endsWith(".invalid"))
      values.add(email);
  }

  for (const filename of [
    ".zshrc",
    ".zprofile",
    ".bash_profile",
    ".bashrc",
    ".profile",
  ]) {
    const candidate = path.join(os.homedir(), filename);
    if (!existsSync(candidate)) continue;
    const source = readFileSync(candidate, "utf8");
    for (const match of source.matchAll(
      /^\s*(?:export\s+)?(?:GIT_AUTHOR_EMAIL|GIT_COMMITTER_EMAIL|EMAIL)\s*=\s*["']?([^\s"']+)/gimu,
    )) {
      const email = match[1];
      if (email !== APPROVED_EMAIL && !email.endsWith(".invalid"))
        values.add(email);
    }
  }
  return [...values];
}

function verifyHooks(root) {
  const findings = [];
  for (const hook of ["pre-commit", "commit-msg", "pre-push"]) {
    const filename = path.join(root, ".githooks", hook);
    if (!existsSync(filename)) {
      findings.push(`${hook}:missing`);
      continue;
    }
    if ((statSync(filename).mode & 0o111) === 0)
      findings.push(`${hook}:not-executable`);
  }
  return findings;
}

try {
  const root = repositoryRoot();
  if (mode === "--verify-and-apply") {
    const privatePatterns = collectUnsafeEmails(root);
    git(["config", "--local", "user.name", APPROVED_NAME], { cwd: root });
    git(["config", "--local", "user.email", APPROVED_EMAIL], { cwd: root });
    git(["config", "--local", "user.useConfigOnly", "true"], { cwd: root });
    git(["config", "--local", "core.hooksPath", ".githooks"], { cwd: root });
    writePrivatePatterns(privatePatterns, root);
  }

  const failures = [];
  const expectedConfig = [
    ["user.name", APPROVED_NAME],
    ["user.email", APPROVED_EMAIL],
    ["user.useConfigOnly", "true"],
    ["core.hooksPath", ".githooks"],
  ];
  for (const [key, expected] of expectedConfig) {
    const result = git(["config", "--local", "--get", key], {
      allowFailure: true,
      cwd: root,
    });
    if (result.status !== 0 || result.stdout.trim() !== expected)
      failures.push(`${key}:invalid`);
  }

  if (inspectCurrentIdentity(root).length > 0)
    failures.push("effective-identity:unsafe");
  failures.push(...verifyHooks(root));

  const privateFile = path.join(
    gitCommonDirectory(root),
    "privacy-guard-private-patterns.json",
  );
  if (!existsSync(privateFile)) failures.push("private-patterns:missing");
  else if ((statSync(privateFile).mode & 0o777) !== 0o600)
    failures.push("private-patterns:mode");

  if (failures.length > 0) {
    process.stdout.write("SAFE-GIT-IDENTITY FAIL\n");
    for (const failure of failures) process.stdout.write(`- ${failure}\n`);
    process.exit(1);
  }

  process.stdout.write("SAFE-GIT-IDENTITY PASS\n");
  process.stdout.write(
    "- repository identity: approved GitHub noreply identity\n",
  );
  process.stdout.write("- hooks path: .githooks\n");
  process.stdout.write("- private local patterns: present with mode 0600\n");
} catch {
  process.stdout.write("SAFE-GIT-IDENTITY FAIL\n");
  process.stdout.write(
    "- setup or verification failed without exposing private values\n",
  );
  process.exit(1);
}
