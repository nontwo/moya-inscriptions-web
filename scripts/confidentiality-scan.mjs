#!/usr/bin/env node
// Incremental core-credential checks; exact content, one delivery budget.
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  realpathSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  existsSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const VERSION = 2;
export const INSTALL_DIR = "confidentiality-hooks";
export const INSTALLED_FILES = [
  "pre-commit",
  "commit-msg",
  "pre-push",
  "confidentiality-scan.mjs",
];
const MAX_BYTES = 64 * 1024 * 1024;
const BUDGET_MS = 120000;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const ZERO = /^0+$/;
const SELF = fileURLToPath(import.meta.url);
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const RULE_VERSION = digest(readFileSync(SELF));
let deadline = Infinity;
let cache = {};
let stats = { scanned: 0, reused: 0, commits: 0 };
export class Stop extends Error {
  constructor(category, location = ".") {
    super(category);
    this.category = category;
    this.location = location;
  }
}
function remaining() {
  const ms = Math.floor(deadline - Date.now());
  if (ms <= 0) throw new Stop("BUDGET_EXHAUSTED");
  return Math.min(BUDGET_MS, ms);
}
export function git(args, options = {}) {
  const result = spawnSync(
    "git",
    [
      "--no-lazy-fetch",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "diff.external=",
      ...args,
    ],
    {
      cwd: options.cwd,
      input: options.input,
      maxBuffer: MAX_BYTES,
      timeout: remaining(),
      killSignal: "SIGKILL",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_NO_REPLACE_OBJECTS: "1",
        GIT_NO_LAZY_FETCH: "1",
        GIT_OPTIONAL_LOCKS: "0",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0)
    throw new Stop(
      result.error?.code === "ETIMEDOUT"
        ? "BUDGET_EXHAUSTED"
        : "GIT_READ_FAILED",
    );
  if (options.binary) return result.stdout;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(result.stdout);
  } catch {
    throw new Stop("GIT_TEXT_UNREADABLE");
  }
}
export function config(key) {
  return git(["config", "--local", "--get", key]).trim();
}
function commonDir() {
  return realpathSync(
    git(["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim(),
  );
}
function currentRepository() {
  let dir = process.cwd(),
    admin = process.env.GIT_DIR;
  if (!admin) {
    for (;;) {
      const candidate = path.join(dir, ".git");
      if (existsSync(candidate)) {
        admin = candidate;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) throw new Stop("NOT_A_GIT_WORKTREE");
      dir = parent;
    }
  }
  admin = path.resolve(admin);
  if (lstatSync(admin).isFile()) {
    const match = /^gitdir: (.+)\s*$/.exec(readFileSync(admin, "utf8"));
    if (!match) throw new Stop("GIT_DIRECTORY_UNREADABLE");
    admin = path.resolve(path.dirname(admin), match[1]);
  }
  const gitDir = realpathSync(admin);
  const commonFile = path.join(gitDir, "commondir");
  const common = process.env.GIT_COMMON_DIR
    ? path.resolve(process.env.GIT_COMMON_DIR)
    : existsSync(commonFile)
      ? path.resolve(gitDir, readFileSync(commonFile, "utf8").trim())
      : gitDir;
  return { gitDir, common: realpathSync(common) };
}
function regularBytes(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.size > MAX_BYTES)
    throw new Stop("TEXT_INPUT_UNREADABLE", path.basename(file));
  return readFileSync(file);
}
const PLACEHOLDER =
  /^(?:<[^<>\r\n]+>|\$\{[^{}\r\n]+\}|\$[A-Z_][A-Z0-9_]*|__[A-Z0-9_]+__|(?:EXAMPLE|PLACEHOLDER|REPLACE_ME|REDACTED|SYNTHETIC|TEST_ONLY|YOUR)(?:[_-][A-Z0-9_-]+)?|(?:example|placeholder|synthetic|test-only|dummy|fake|changeme|test|testing)(?:[-_][a-z0-9_-]+)?)$/i;
const PRIMITIVE =
  /^(?:string|number|boolean|unknown|never|any|void|undefined|null|false|true)$/;
const CREDENTIAL_NAME =
  /^(?:(?:[A-Za-z0-9]+[_-])*(?:password|passwd|pwd|secret[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token|security[_-]?token|session[_-]?token|client[_-]?secret|token)|(?:db|database|cos|cloud)?(?:Password|SecretKey|ApiKey|AccessToken|RefreshToken)|authorization|cookie)$/i;
function syntax(filename) {
  return /\.(?:[cm]?js|jsx|tsx?|py)$/i.test(filename)
    ? "code"
    : /(?:^|\.)env(?:\.|$)|\.(?:ini|conf|service|timer|ya?ml|json|toml)$/i.test(
          filename,
        )
      ? "config"
      : "text";
}
function placeholder(value) {
  return !value || value === "..." || PLACEHOLDER.test(value);
}
function literalFindings(text, filename) {
  const hits = [];
  const add = (at, category) =>
    hits.push({
      line: text.slice(0, at).split("\n").length,
      category,
      severity: "BLOCK",
    });
  for (const m of text.matchAll(
    /-----BEGIN (?:[A-Z0-9 ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----/g,
  ))
    add(m.index, "PRIVATE_KEY");
  for (const m of text.matchAll(
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,})\b/g,
  ))
    add(m.index, "API_TOKEN");
  for (const m of text.matchAll(
    /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/g,
  ))
    add(m.index, "AUTH_MATERIAL");
  const assignment =
    /(?:\b([A-Za-z_][\w-]*)|["']([A-Za-z_][\w-]*)["'])[ \t]*(?::=|!?={1,3}|:(?!=))[ \t]*(?:(["'])([^\r\n]*?)\3|([^\s,;#{}()[\]"'`]+))/g;
  let m;
  while ((m = assignment.exec(text))) {
    // Inspect nested assignments, e.g. systemd Environment="API_KEY=...".
    assignment.lastIndex = m.index + 1;
    const name = m[1] ?? m[2];
    if (!CREDENTIAL_NAME.test(name)) continue;
    let value = m[4] ?? m[5];
    if (!m[3] && syntax(filename) === "code") value = value.replace(/:$/, "");
    // A closing source string followed by concatenation is not a literal value.
    if (syntax(filename) === "code" && /^\s*\+\s*$/.test(value)) continue;
    // Package versions and auth field declarations are not auth material.
    if (
      /^authorization$/i.test(name) &&
      !/^(?:Bearer|Basic)\s+\S{12,}$/.test(value)
    )
      continue;
    if (/^cookie$/i.test(name) && !/\b[A-Za-z_][\w-]*=[^;\s]{12,}/.test(value))
      continue;
    if (
      !m[3] &&
      value === "$" &&
      /^\{[A-Za-z_][A-Za-z0-9_]*\}/.test(text.slice(m.index + m[0].length))
    )
      continue;
    if (placeholder(value) || (!m[3] && PRIMITIVE.test(value))) continue;
    if (
      !m[3] &&
      /^(?:process\.env(?:\.|$)|import\.meta\.env(?:\.|$)|os\.environ(?:\.|$)|getenv$|env$)/.test(
        value,
      )
    )
      continue;
    if (
      !m[3] &&
      syntax(filename) === "code" &&
      /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*$/.test(value)
    )
      continue;
    if (
      !m[3] &&
      syntax(filename) !== "config" &&
      m[0].includes(":") &&
      /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(value)
    )
      continue;
    if (m[3] || syntax(filename) === "config" || m[0].includes("="))
      add(m.index, "CREDENTIAL_LITERAL");
  }
  for (const m of text.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]+/gi)) {
    try {
      const u = new URL(m[0]);
      if (u.password && !placeholder(decodeURIComponent(u.password)))
        add(m.index, "PASSWORD_CONNECTION_URL");
      for (const [key, value] of u.searchParams) {
        if (
          /^(?:q-signature|x-amz-signature|signature|sig|access_token|refresh_token|token)$/i.test(
            key,
          ) &&
          value.length >= 12 &&
          !placeholder(value)
        )
          add(m.index, "AUTHORIZING_URL");
      }
    } catch {
      /* Incomplete code fragment. */
    }
  }
  return [...new Map(hits.map((h) => [JSON.stringify(h), h])).values()];
}
export function categories(text, filename = "") {
  return [
    ...new Set(literalFindings(text, filename).map((f) => f.category)),
  ].sort();
}
function safePath(label) {
  return categories(label).length
    ? "[credential-in-filename]"
    : label.replace(/[\x00-\x1f\x7f]/g, "?");
}
export function inspect(bytes, label = ".", filename = label) {
  remaining();
  const nameHits = literalFindings(filename, "");
  const key = digest(
    Buffer.from(RULE_VERSION + "\0" + syntax(filename) + "\0" + digest(bytes)),
  );
  let findings = cache[key];
  if (findings) stats.reused++;
  else {
    stats.scanned++;
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      /* Ordinary binary. */
    }
    findings =
      text === undefined || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)
        ? [{ line: 1, category: "BINARY_NOT_TEXT_SCANNED", severity: "WARN" }]
        : literalFindings(text, filename);
    cache[key] = findings;
  }
  remaining();
  return [...nameHits, ...findings].map((f) => ({
    path: safePath(label),
    ...f,
  }));
}
export function health() {
  const directory = path.join(commonDir(), INSTALL_DIR);
  const bytes = regularBytes(path.join(directory, "manifest.json"));
  const manifest = JSON.parse(bytes);
  if (
    digest(bytes) !== config("confidentiality.manifestSha256") ||
    manifest.version !== VERSION
  )
    throw new Stop("INSTALL_VERSION_MISMATCH");
  if (git(["config", "--get", "core.hooksPath"]).trim() !== directory)
    throw new Stop("ACTIVE_HOOKS_DIFFER");
  for (const f of INSTALLED_FILES) {
    const p = path.join(directory, f);
    if (digest(regularBytes(p)) !== manifest.files[f])
      throw new Stop("INSTALLED_FILE_CHANGED");
    if (f !== "confidentiality-scan.mjs" && !(lstatSync(p).mode & 0o111))
      throw new Stop("HOOK_NOT_EXECUTABLE");
  }
  if (manifest.files["confidentiality-scan.mjs"] !== RULE_VERSION)
    throw new Stop("SCANNER_VERSION_MISMATCH");
  return { version: VERSION, manifestSha256: digest(bytes) };
}
function blob(oid, label, mode, findings) {
  if (!OID.test(oid)) throw new Stop("GIT_OBJECT_UNREADABLE", label);
  if (mode === "160000") {
    findings.push({
      path: safePath(label),
      line: 1,
      category: "SUBMODULE_CONTENT_NOT_INCLUDED",
      severity: "WARN",
    });
    return;
  }
  if (!["100644", "100755", "120000"].includes(mode))
    throw new Stop("GIT_MODE_UNREADABLE", label);
  findings.push(
    ...inspect(git(["cat-file", "blob", oid], { binary: true }), label),
  );
}
function rawBlobs(records, findings) {
  for (let i = 0; i < records.length && records[i]; i += 2) {
    const m = /^:(\d{6}) (\d{6}) ([a-f0-9]+) ([a-f0-9]+) ([A-Z])$/.exec(
      records[i],
    );
    const file = records[i + 1];
    if (!m || !file || m[5] === "U")
      throw new Stop("CHANGED_CONTENT_UNDETERMINED");
    findings.push(...inspect(Buffer.alloc(0), file));
    if (m[5] !== "D") blob(m[4], file, m[2], findings);
  }
}
export function staged() {
  const findings = [];
  rawBlobs(
    git([
      "diff",
      "--cached",
      "--raw",
      "--abbrev=64",
      "-z",
      "--no-renames",
      "--no-ext-diff",
      "--no-textconv",
    ]).split("\0"),
    findings,
  );
  return findings;
}
export function message(file) {
  return inspect(regularBytes(file), "[commit-message]");
}
function metadata(oid, type, findings) {
  findings.push(
    ...inspect(
      Buffer.from(git(["cat-file", type, oid])),
      `[${type} ${oid.slice(0, 12)}]`,
      "[metadata]",
    ),
  );
}
function peel(oid, findings, inspectTags) {
  for (let depth = 0; depth < 8; depth++) {
    if (!OID.test(oid)) throw new Stop("PUSH_OBJECT_UNDETERMINED");
    const type = git(["cat-file", "-t", oid]).trim();
    if (type === "commit") return oid;
    if (type !== "tag") throw new Stop("PUSH_TARGET_UNDETERMINED");
    if (inspectTags) metadata(oid, "tag", findings);
    oid = /^object ([a-f0-9]+)\n/.exec(git(["cat-file", "tag", oid]))?.[1];
  }
  throw new Stop("TAG_DEPTH_LIMIT");
}
function changedBlobs(commit, findings) {
  const raw = git(["cat-file", "commit", commit]);
  const parents = [
    ...raw.slice(0, raw.indexOf("\n\n")).matchAll(/^parent ([a-f0-9]+)$/gm),
  ].map((m) => m[1]);
  for (const parent of parents.length ? parents : [null]) {
    rawBlobs(
      git([
        "diff-tree",
        "--no-commit-id",
        "-r",
        "--raw",
        "--abbrev=64",
        "-z",
        "--no-renames",
        "--no-ext-diff",
        "--no-textconv",
        ...(parent ? [parent, commit] : ["--root", commit]),
      ]).split("\0"),
      findings,
    );
  }
}
export function push(remote, input) {
  const findings = [],
    visited = new Set();
  let newBranchBase;
  for (const line of input.trim().split("\n").filter(Boolean)) {
    const fields = line.split(" ");
    if (fields.length !== 4 || !OID.test(fields[1]) || !OID.test(fields[3]))
      throw new Stop("PUSH_INPUT_UNDETERMINED");
    const [localRef, localOid, remoteRef, remoteOid] = fields;
    findings.push(
      ...inspect(Buffer.from(localRef + "\n" + remoteRef), "[ref-name]"),
    );
    if (ZERO.test(localOid)) continue;
    const tip = peel(localOid, findings, true);
    let base;
    if (!ZERO.test(remoteOid)) base = peel(remoteOid, findings, false);
    else {
      if (newBranchBase === undefined) {
        const rows = git(["ls-remote", "--symref", "--", remote, "HEAD"])
          .trim()
          .split("\n");
        const head = rows
          .map((row) => /^([a-f0-9]+)\tHEAD$/.exec(row)?.[1])
          .find(Boolean);
        newBranchBase = head ? peel(head, findings, false) : null;
      }
      base = newBranchBase;
    }
    const commits = git([
      "rev-list",
      "--reverse",
      "--topo-order",
      tip,
      ...(base ? ["^" + base] : []),
    ])
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const commit of commits) {
      if (visited.has(commit)) continue;
      visited.add(commit);
      stats.commits++;
      metadata(commit, "commit", findings);
      changedBlobs(commit, findings);
    }
  }
  return findings;
}
export function outbound(files) {
  if (!files.length) throw new Stop("EXACT_OUTBOUND_FILE_REQUIRED");
  return files.flatMap((file) => {
    const relative = path.relative(process.cwd(), path.resolve(file));
    return inspect(
      regularBytes(file),
      relative.startsWith("..")
        ? "[outbound]/" + path.basename(file)
        : relative,
      path.basename(file),
    );
  });
}
function atomicJSON(file, value) {
  const temp = file + "." + process.pid + ".tmp";
  writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  renameSync(temp, file);
}
function readJSON(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Stop("LOCAL_STATE_UNREADABLE");
  }
}
function result(findings) {
  const unique = [
    ...new Map(findings.map((f) => [JSON.stringify(f), f])).values(),
  ];
  const status = unique.some((f) => f.severity === "BLOCK")
    ? "BLOCK"
    : unique.length
      ? "WARN"
      : "PASS";
  return { status, ok: status !== "BLOCK", findings: unique, ...stats };
}
async function worker(args) {
  deadline = Number(process.env.CONFIDENTIALITY_WORKER_DEADLINE);
  cache = readJSON(process.env.CONFIDENTIALITY_CACHE_FILE, {});
  const [mode, ...rest] = args;
  let findings;
  if (mode === "health") return { status: "PASS", ok: true, ...health() };
  if (mode === "staged" && !rest.length) findings = staged();
  else if (mode === "message" && rest.length === 1) findings = message(rest[0]);
  else if (mode === "push" && rest.length === 2) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      remaining();
      chunks.push(chunk);
    }
    let input;
    try {
      input = new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks),
      );
    } catch {
      throw new Stop("PUSH_INPUT_UNDETERMINED");
    }
    findings = push(rest[1], input);
  } else if (mode === "outbound") findings = outbound(rest);
  else throw new Stop("COMMAND_INVALID");
  remaining();
  atomicJSON(process.env.CONFIDENTIALITY_CACHE_FILE, cache);
  return result(findings);
}
function incomplete(error) {
  return {
    status: "INCOMPLETE",
    ok: false,
    findings: [
      {
        path: safePath(error.location ?? "."),
        line: 1,
        category: error instanceof Stop ? error.category : "CHECK_FAILED",
        severity: "INCOMPLETE",
      },
    ],
  };
}
// One persisted allowance is shared by commit, push and exact publication.
// Functional tests/review/idle time are excluded; each active invocation gets
// an absolute deadline from the SAME remaining allowance, never a fresh 120s.
export async function main(args = process.argv.slice(2)) {
  const started = Date.now();
  deadline = started + BUDGET_MS;
  let stateFile, state, lock;
  try {
    const { common, gitDir } = currentRepository();
    const directory = path.join(common, "confidentiality-check-state");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    stateFile = path.join(directory, digest(Buffer.from(gitDir)) + ".json");
    lock = stateFile + ".lock";
    try {
      mkdirSync(lock);
    } catch {
      lock = undefined;
      throw new Stop("CHECK_ALREADY_RUNNING");
    }
    const previous = readJSON(stateFile, null);
    state = previous
      ? { ...previous, rule: RULE_VERSION }
      : {
          rule: RULE_VERSION,
          batch: null,
          remainingMs: BUDGET_MS,
          usedMs: 0,
        };
    if (
      process.env.CONFIDENTIALITY_BATCH_ID &&
      state.batch !== process.env.CONFIDENTIALITY_BATCH_ID
    )
      state = {
        rule: RULE_VERSION,
        batch: process.env.CONFIDENTIALITY_BATCH_ID,
        remainingMs: BUDGET_MS,
        usedMs: 0,
      };
    deadline = started + Math.max(0, state.remainingMs);
    const batch =
      process.env.CONFIDENTIALITY_BATCH_ID || git(["write-tree"]).trim();
    state =
      previous?.batch === batch
        ? { ...previous, rule: RULE_VERSION }
        : { rule: RULE_VERSION, batch, remainingMs: BUDGET_MS, usedMs: 0 };
    deadline = started + state.remainingMs;
    const cacheFile = path.join(directory, RULE_VERSION + ".cache.json");
    const manifest = readJSON(
      path.join(common, INSTALL_DIR, "manifest.json"),
      null,
    );
    if (
      !manifest ||
      manifest.version !== VERSION ||
      manifest.files["confidentiality-scan.mjs"] !== RULE_VERSION
    )
      throw new Stop("SCANNER_VERSION_MISMATCH");
    for (const file of INSTALLED_FILES) {
      const installed = path.join(common, INSTALL_DIR, file);
      if (digest(regularBytes(installed)) !== manifest.files[file])
        throw new Stop("INSTALLED_FILE_CHANGED");
      if (
        file !== "confidentiality-scan.mjs" &&
        !(lstatSync(installed).mode & 0o111)
      )
        throw new Stop("HOOK_NOT_EXECUTABLE");
    }
    const output = await new Promise((resolve) => {
      const child = spawn(process.execPath, [SELF, "--worker", ...args], {
        detached: process.platform !== "win32",
        stdio: [args[0] === "push" ? "inherit" : "ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          CONFIDENTIALITY_WORKER_DEADLINE: String(deadline),
          CONFIDENTIALITY_CACHE_FILE: cacheFile,
        },
      });
      let bytes = "",
        finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        terminate();
        resolve(value);
      };
      const terminate = () => {
        try {
          process.kill(
            process.platform === "win32" ? child.pid : -child.pid,
            "SIGKILL",
          );
        } catch {
          /* Already exited. */
        }
      };
      const timer = setTimeout(
        () => {
          terminate();
          finish(incomplete(new Stop("BUDGET_EXHAUSTED")));
        },
        Math.max(1, deadline - Date.now()),
      );
      child.stdout.on("data", (chunk) => {
        bytes += chunk.toString();
        if (bytes.length > 2 * 1024 * 1024) {
          terminate();
          finish(incomplete(new Stop("RESULT_TOO_LARGE")));
        }
      });
      child.on("error", () =>
        finish(incomplete(new Stop("WORKER_START_FAILED"))),
      );
      child.on("close", () => {
        try {
          finish(JSON.parse(bytes));
        } catch {
          finish(incomplete(new Stop("WORKER_FAILED")));
        }
      });
    });
    const elapsedMs = Date.now() - started;
    state.usedMs += elapsedMs;
    state.remainingMs = Math.max(0, state.remainingMs - elapsedMs);
    atomicJSON(stateFile, state);
    console.log(
      JSON.stringify({
        ...output,
        elapsedMs,
        batchUsedMs: state.usedMs,
        batchRemainingMs: state.remainingMs,
      }),
    );
    return output.status === "BLOCK"
      ? 1
      : output.status === "INCOMPLETE"
        ? 2
        : 0;
  } catch (error) {
    if (state && stateFile) {
      const elapsed = Date.now() - started;
      state.usedMs += elapsed;
      state.remainingMs = Math.max(0, state.remainingMs - elapsed);
      try {
        atomicJSON(stateFile, state);
      } catch {
        /* Report once. */
      }
    }
    console.log(
      JSON.stringify({ ...incomplete(error), elapsedMs: Date.now() - started }),
    );
    return 2;
  } finally {
    if (lock) rmSync(lock, { recursive: true, force: true });
  }
}
export function isEntryPoint(url) {
  if (!process.argv[1] || process.argv[1] === "-") return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(url);
  } catch {
    return false;
  }
}
if (isEntryPoint(import.meta.url)) {
  if (process.argv[2] === "--worker") {
    try {
      console.log(JSON.stringify(await worker(process.argv.slice(3))));
    } catch (error) {
      console.log(JSON.stringify(incomplete(error)));
    }
  } else process.exitCode = await main();
}
