#!/usr/bin/env node
// Local preflight: inspect exact Git objects and outbound bytes, never excerpts.
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const VERSION = 1;
export const INSTALL_DIR = "confidentiality-hooks";
export const INSTALLED_FILES = [
  "pre-commit",
  "commit-msg",
  "pre-push",
  "confidentiality-scan.mjs",
];
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_COMMITS = 2000;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const ZERO = /^0+$/;
const PRIVATE_PATH =
  /(?:\/Users\/|\/home\/|\/private\/|[A-Za-z]:[\\/]Users[\\/])[^\s"'<>`]+/g;
const EMAIL =
  /[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*\.[A-Za-z]{2,})/g;
const SYNTHETIC =
  /^(?:<[^<>\r\n]+>|\$\{[A-Z_][A-Z0-9_]*\}|__[A-Z0-9_]+__|(?:EXAMPLE|PLACEHOLDER|REPLACE_ME|REDACTED|SYNTHETIC|TEST_ONLY)(?:[_-][A-Z0-9_-]+)?|(?:example|placeholder|synthetic|test-only)(?:[-_][a-z0-9_-]+)?)$/i;
const SECRET_KEY =
  /(?:password|passwd|secret(?:_?key)?|api[_-]?key|access[_-]?token|refresh[_-]?token|security[_-]?token|authorization|cookie|session[_-]?token)/i;

export class Stop extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}
export function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
export function git(args, options = {}) {
  const identityQuery = options.identityOnly === true;
  if (
    identityQuery &&
    !(
      args.length === 2 &&
      args[0] === "var" &&
      ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"].includes(args[1])
    )
  ) {
    throw new Stop("IDENTITY_QUERY_INVALID");
  }
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_SSH_COMMAND: "ssh",
    GIT_ALLOW_PROTOCOL: "file:https:ssh",
    GIT_NO_LAZY_FETCH: "1",
  };
  for (const key of Object.keys(env))
    if (
      /^GIT_(?:EXTERNAL_DIFF|SSH|PROXY_COMMAND|SSL_NO_VERIFY)$/.test(key) ||
      (!identityQuery &&
        /^GIT_(?:CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_.*|CONFIG_VALUE_.*)$/.test(
          key,
        ))
    )
      delete env[key];
  const result = spawnSync(
    "git",
    [
      "--no-lazy-fetch",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "diff.external=",
      "-c",
      "protocol.allow=never",
      "-c",
      "protocol.file.allow=always",
      "-c",
      "protocol.https.allow=always",
      "-c",
      "protocol.ssh.allow=always",
      "-c",
      "protocol.ext.allow=never",
      "-c",
      "http.sslVerify=true",
      ...args,
    ],
    {
      cwd: options.cwd,
      input: options.input,
      encoding: undefined,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60000,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0)
    throw new Stop("GIT_OPERATION_UNVERIFIABLE");
  if (options.binary) return result.stdout;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(result.stdout);
  } catch {
    throw new Stop("GIT_TEXT_UNINSPECTABLE");
  }
}
export function config(key) {
  return git(["config", "--local", "--get", key]).trim();
}
function optionalConfig(key) {
  const result = spawnSync("git", ["config", "--get", key], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 1) return "";
  if (result.error || result.status !== 0)
    throw new Stop("CONFIG_UNVERIFIABLE");
  return result.stdout.trim();
}
export function policy() {
  const name = config("confidentiality.approvedName");
  const email = config("confidentiality.approvedEmail");
  if (!name || !email || /[\r\n<>]/.test(name + email))
    throw new Stop("IDENTITY_POLICY_INVALID");
  if (optionalConfig("user.useConfigOnly") !== "true")
    throw new Stop("IDENTITY_CONFIG_REQUIRED");
  return { name, email };
}
function identity(value, approved) {
  const match = /^(.+) <([^<>]+)> \d+ [+-]\d{4}$/.exec(value);
  if (!match || match[1] !== approved.name || match[2] !== approved.email)
    throw new Stop("IDENTITY_NOT_APPROVED");
}
function effectiveIdentity(approved) {
  // Git exports command-line -c overrides to hooks. Preserve those only for
  // these two read-only identity queries so the actual committer is checked.
  identity(
    git(["var", "GIT_AUTHOR_IDENT"], { identityOnly: true }).trim(),
    approved,
  );
  identity(
    git(["var", "GIT_COMMITTER_IDENT"], { identityOnly: true }).trim(),
    approved,
  );
}
function syntheticEmail(email) {
  return /@(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|invalid|test)$/i.test(
    email,
  );
}
function allowedIP(value) {
  if (isIP(value) === 4) {
    const [a, b, c, d] = value.split(".").map(Number);
    return (
      a === 127 ||
      value === "0.0.0.0" ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 255 && b === 255 && c === 255 && d === 255)
    );
  }
  return /^(?:::|::1|2001:db8(?::[a-f0-9]*)*)$/i.test(value);
}
function javascriptCodePositions(text, filename) {
  if (!/\.(?:[cm]?js|jsx|tsx?)$/i.test(filename)) return null;
  const code = new Uint8Array(text.length);
  let state = "code";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (state === "line") {
      if (char === "\n") state = "code";
      continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") {
        state = "code";
        i++;
      }
      continue;
    }
    if (state !== "code") {
      if (char === "\\") i++;
      else if (char === state) state = "code";
      continue;
    }
    if (char === "/" && next === "/") {
      state = "line";
      i++;
    } else if (char === "/" && next === "*") {
      state = "block";
      i++;
    } else if (char === '"' || char === "'" || char === "`") state = char;
    else code[i] = 1;
  }
  return code;
}
function declaredMemberReference(text, match, code) {
  if (
    !code?.[match.index] ||
    match[2] ||
    !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(match[4] ?? "")
  )
    return false;
  const before = text.slice(
    text.lastIndexOf("\n", match.index - 1) + 1,
    match.index,
  );
  const end = text.indexOf("\n", match.index + match[0].length);
  const after = text.slice(
    match.index + match[0].length,
    end === -1 ? text.length : end,
  );
  return (
    /^\s*(?:export\s+)?(?:const|let|var)\s+$/.test(before) &&
    /^\s*;?\s*(?:\/\/.*)?$/.test(after)
  );
}
export function categories(text, filename = "") {
  const found = new Set();
  if (
    /-----BEGIN (?:[A-Z0-9 ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----/.test(text)
  )
    found.add("PRIVATE_KEY");
  if (
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|AKID[A-Za-z0-9]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,})\b/.test(
      text,
    )
  )
    found.add("CREDENTIAL_SHAPE");
  if (
    /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_-]{16,}\b/i.test(text) ||
    /\$(?:2[aby]\$\d\d\$|argon2(?:id|i|d)\$|[156]\$)[^\s"']{12,}/.test(text)
  )
    found.add("AUTH_MATERIAL");
  for (const match of text.matchAll(PRIVATE_PATH)) {
    if (
      !/^(?:\/(?:Users|home)\/|[A-Za-z]:[\\/]Users[\\/])(?:EXAMPLE|PLACEHOLDER|SYNTHETIC|test-only)(?:[\\/]|$)/i.test(
        match[0],
      )
    )
      found.add("PRIVATE_LOCAL_PATH");
  }
  for (const match of text.matchAll(EMAIL))
    if (!syntheticEmail(match[0])) found.add("PERSONAL_EMAIL");
  for (const match of text.matchAll(
    /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g,
  )) {
    if (isIP(match[0]) && !allowedIP(match[0])) found.add("DEPLOYMENT_ADDRESS");
  }
  for (const match of text.matchAll(
    /(?<![\w:])(?:[a-fA-F0-9]{0,4}:){2,}[a-fA-F0-9:]{0,39}(?![\w:])/g,
  )) {
    if (isIP(match[0]) && !allowedIP(match[0])) found.add("DEPLOYMENT_ADDRESS");
  }
  // A dotted literal is still a secret in configuration, prose and metadata.
  // Only explicit JavaScript/TypeScript declarations in code receive the narrow
  // member-reference exemption; strings, templates and comments never receive it.
  const code = javascriptCodePositions(text, filename);
  const assignment =
    /["']?([A-Za-z_][\w-]*)["']?\s*[:=]\s*(?:(["'])([^\r\n]*?)\2|([^\s,;#{}()[\]"'`]+))/g;
  for (const match of text.matchAll(assignment)) {
    if (!SECRET_KEY.test(match[1])) continue;
    const value = match[3] ?? match[4];
    if (
      !value ||
      SYNTHETIC.test(value) ||
      (/^(?:undefined|null|false|true)$/.test(value) && !match[2]) ||
      declaredMemberReference(text, match, code)
    )
      continue;
    if (/^(?:["']|`|\/|=>)$/.test(value)) continue;
    found.add("SECRET_LITERAL");
  }
  for (const match of text.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]+/gi)) {
    try {
      const url = new URL(match[0]);
      if (url.username || url.password) found.add("CREDENTIAL_URL");
      for (const [key, value] of url.searchParams) {
        if (
          /(?:signature|q-sign|x-amz-credential|x-amz-security-token|x-cos-security-token|token|password|secret|invite|reset|sig$)/i.test(
            key,
          ) &&
          value &&
          !SYNTHETIC.test(value)
        )
          found.add("SIGNED_OR_TOKEN_URL");
      }
      if (
        /\.(?:internal|local|lan)$/.test(url.hostname) &&
        url.hostname !== "localhost"
      )
        found.add("PRIVATE_HOSTNAME");
      if (
        /(?:\.cos\.[a-z0-9-]+\.myqcloud\.com|\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com|\.blob\.core\.windows\.net)$/i.test(
          url.hostname,
        ) &&
        !/^(?:example|placeholder|synthetic)(?:[-.])/.test(url.hostname)
      )
        found.add("CLOUD_RESOURCE");
    } catch {
      /* Textual code fragments are not complete URLs. */
    }
  }
  if (
    /\b(?:ins|sg|subnet|vpc)-[a-z0-9]{8,}\b|\bqcs::[^\s"']*:(?:uid|uin)\/\d+|\barn:aws:[^\s"']*:\d{12}:/i.test(
      text,
    )
  )
    found.add("CLOUD_RESOURCE");
  if (/^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?$/m.test(text))
    found.add("UNINSPECTABLE_LFS");
  return [...found].sort();
}
function safePath(value) {
  // Even a relative attachment name can itself reveal a person's identity.
  return [
    ".",
    "[commit-message]",
    "[commit-metadata]",
    "[tag-metadata]",
    "[ref-name]",
    "[outbound-file]",
  ].includes(value)
    ? value
    : "[redacted-path]";
}
const TEXT_SUFFIX =
  /\.(?:[cm]?js|jsx|tsx?|json|md|txt|ya?ml|toml|py|sh|sql|css|html?|csv|tsv|xml|ini|conf|template|example|env|lock)$/i;
const TEXT_NAME =
  /^(?:Dockerfile|Makefile|LICENSE|NOTICE|pre-commit|commit-msg|pre-push|\.(?:gitignore|gitattributes|editorconfig|npmrc|nvmrc|env))$/;
export function inspect(bytes, label = ".", filename = label) {
  const findings = [];
  const report = (category) =>
    findings.push({ path: safePath(label), category });
  for (const category of categories(filename)) report(category);
  if (/[\x00-\x1f\x7f]/.test(filename)) report("UNSAFE_FILENAME");
  if (bytes.length > MAX_BYTES) {
    report("INPUT_TOO_LARGE");
    return findings;
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    report("UNINSPECTABLE_BINARY");
    return findings;
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) {
    report("UNINSPECTABLE_BINARY");
    return findings;
  }
  const internal =
    filename === "." ||
    /^\[(?:commit-message|commit-metadata|tag-metadata|ref-name)\]$/.test(
      filename,
    );
  const basename = path.basename(filename);
  if (
    bytes.length &&
    !internal &&
    !TEXT_SUFFIX.test(basename) &&
    !TEXT_NAME.test(basename)
  )
    report("UNCLASSIFIED_ARTIFACT");
  if (
    /^\s*(?:%PDF-|%!PS|<svg\b|<\?xml[^>]*>\s*<svg\b|SQLite format 3|PK\x03\x04)/i.test(
      text,
    ) ||
    /(?:^|[^A-Za-z0-9+/])[A-Za-z0-9+/]{256,}={0,2}(?:$|[^A-Za-z0-9+/=])/.test(
      text,
    )
  )
    report("OPAQUE_ARTIFACT");
  for (const category of categories(text, filename)) report(category);
  return findings;
}
function regularBytes(filename) {
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES)
    throw new Stop("FILE_UNINSPECTABLE");
  return readFileSync(filename);
}
function commonDir() {
  return realpathSync(
    git(["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim(),
  );
}
export function rejectConditionalConfig() {
  const names = git(["config", "--list", "--name-only"]).split("\n");
  if (names.some((name) => /^includeif\./i.test(name))) {
    throw new Stop("CONDITIONAL_GIT_CONFIG_REQUIRES_REVIEW");
  }
}
export function rejectWorktreeConfig(common) {
  function statOrAbsent(filename) {
    try {
      return lstatSync(filename);
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw new Stop("WORKTREE_ADMIN_UNVERIFIABLE");
    }
  }
  function directory(filename) {
    const info = statOrAbsent(filename);
    if (!info?.isDirectory() || info.isSymbolicLink()) {
      throw new Stop("WORKTREE_ADMIN_UNVERIFIABLE");
    }
  }
  function noConfig(admin) {
    directory(admin);
    // lstat sees empty files, directories and dangling links without reading
    // their contents. No actual worktree configuration is approved here.
    if (statOrAbsent(path.join(admin, "config.worktree"))) {
      throw new Stop("WORKTREE_CONFIG_REQUIRES_REVIEW");
    }
  }
  noConfig(common);
  const linked = path.join(common, "worktrees");
  if (!statOrAbsent(linked)) return;
  directory(linked);
  let entries;
  try {
    entries = readdirSync(linked);
  } catch {
    throw new Stop("WORKTREE_ADMIN_UNVERIFIABLE");
  }
  for (const entry of entries) noConfig(path.join(linked, entry));
}
export function health() {
  rejectConditionalConfig();
  const common = commonDir();
  rejectWorktreeConfig(common);
  const directory = path.join(common, INSTALL_DIR);
  const directoryStat = lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Stop("INSTALL_DIRECTORY_CONFLICT");
  }
  if (
    optionalConfig("core.hooksPath") !== directory ||
    config("core.hooksPath") !== directory
  )
    throw new Stop("HOOKS_PATH_CONFLICT");
  const manifestBytes = regularBytes(path.join(directory, "manifest.json"));
  if (digest(manifestBytes) !== config("confidentiality.manifestSha256"))
    throw new Stop("INSTALL_MANIFEST_CHANGED");
  const manifest = JSON.parse(manifestBytes);
  if (
    manifest.version !== VERSION ||
    JSON.stringify(Object.keys(manifest.files).sort()) !==
      JSON.stringify([...INSTALLED_FILES].sort())
  )
    throw new Stop("INSTALL_VERSION_INVALID");
  for (const file of INSTALLED_FILES) {
    if (
      digest(regularBytes(path.join(directory, file))) !== manifest.files[file]
    )
      throw new Stop("INSTALLED_FILE_CHANGED");
    if (
      file !== "confidentiality-scan.mjs" &&
      !(lstatSync(path.join(directory, file)).mode & 0o111)
    )
      throw new Stop("HOOK_NOT_EXECUTABLE");
  }
  if (
    digest(readFileSync(fileURLToPath(import.meta.url))) !==
    manifest.files["confidentiality-scan.mjs"]
  )
    throw new Stop("SCANNER_VERSION_MISMATCH");
  const approved = policy();
  if (
    digest(Buffer.from(approved.name + "\0" + approved.email)) !==
    manifest.identitySha256
  ) {
    throw new Stop("IDENTITY_POLICY_CHANGED");
  }
  return { version: VERSION, manifestSha256: digest(manifestBytes) };
}
function blob(oid, label, mode, findings) {
  if (!OID.test(oid) || !["100644", "100755"].includes(mode))
    throw new Stop("GIT_OBJECT_UNINSPECTABLE");
  const size = Number(git(["cat-file", "-s", oid]).trim());
  if (!Number.isSafeInteger(size) || size > MAX_BYTES)
    throw new Stop("INPUT_TOO_LARGE");
  findings.push(
    ...inspect(git(["cat-file", "blob", oid], { binary: true }), label),
  );
}
export function staged() {
  effectiveIdentity(policy());
  const findings = [];
  const changed = git([
    "diff",
    "--cached",
    "--name-only",
    "-z",
    "--no-renames",
    "--no-ext-diff",
    "--no-textconv",
  ])
    .split("\0")
    .filter(Boolean);
  const index = new Map();
  for (const item of git(["ls-files", "--stage", "-z"])
    .split("\0")
    .filter(Boolean)) {
    const match = /^(\d{6}) ([a-f0-9]+) ([0-3])\t([\s\S]+)$/.exec(item);
    if (!match || match[3] !== "0") throw new Stop("UNMERGED_INDEX");
    index.set(match[4], { mode: match[1], oid: match[2] });
  }
  for (const file of changed) {
    findings.push(...inspect(Buffer.alloc(0), file));
    if (index.has(file)) {
      const entry = index.get(file);
      blob(entry.oid, file, entry.mode, findings);
    }
  }
  return findings;
}
export function message(filename) {
  effectiveIdentity(policy());
  return inspect(regularBytes(filename), "[commit-message]");
}
function metadata(oid, type, approved, findings) {
  const raw = git(["cat-file", type, oid]);
  const boundary = raw.indexOf("\n\n");
  if (boundary < 0) throw new Stop("OBJECT_METADATA_INVALID");
  const headers = raw.slice(0, boundary).split("\n");
  const required = type === "commit" ? ["author", "committer"] : ["tagger"];
  for (const field of required) {
    const fields = headers.filter((line) => line.startsWith(field + " "));
    if (fields.length !== 1) throw new Stop("OBJECT_METADATA_INVALID");
    identity(fields[0].slice(field.length + 1), approved);
  }
  const nonIdentity = headers
    .filter((line) => !required.some((field) => line.startsWith(field + " ")))
    .join("\n");
  findings.push(
    ...inspect(
      Buffer.from(nonIdentity + "\n" + raw.slice(boundary + 2)),
      "[" + type + "-metadata]",
    ),
  );
}
function peel(oid, approved, findings, inspectTags) {
  for (let depth = 0; depth < 8; depth++) {
    if (!OID.test(oid)) throw new Stop("GIT_OBJECT_UNVERIFIABLE");
    const type = git(["cat-file", "-t", oid]).trim();
    if (type === "commit") return oid;
    if (type !== "tag") throw new Stop("REF_TARGET_UNINSPECTABLE");
    if (inspectTags) metadata(oid, "tag", approved, findings);
    const match = /^object ([a-f0-9]+)\n/.exec(git(["cat-file", "tag", oid]));
    if (!match) throw new Stop("TAG_UNVERIFIABLE");
    oid = match[1];
  }
  throw new Stop("TAG_DEPTH_LIMIT");
}
function changedBlobs(commit, findings) {
  const rawCommit = git(["cat-file", "commit", commit]);
  const header = rawCommit.slice(0, rawCommit.indexOf("\n\n"));
  const parents = [...header.matchAll(/^parent ([a-f0-9]+)$/gm)].map(
    (match) => match[1],
  );
  const seen = new Set();
  // Union every parent's changed result blobs, including merge resolutions.
  for (const parent of parents.length ? parents : [null]) {
    const revisions = parent ? [parent, commit] : ["--root", commit];
    const records = git([
      "diff-tree",
      "--no-commit-id",
      "-r",
      "--raw",
      "-z",
      "--no-renames",
      "--no-ext-diff",
      "--no-textconv",
      ...revisions,
    ]).split("\0");
    for (let i = 0; i < records.length && records[i]; i += 2) {
      const match = /^:(\d{6}) (\d{6}) ([a-f0-9]+) ([a-f0-9]+) ([A-Z])$/.exec(
        records[i],
      );
      const file = records[i + 1];
      if (!match || !file) throw new Stop("TREE_DIFF_UNVERIFIABLE");
      const key = records[i] + "\0" + file;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(...inspect(Buffer.alloc(0), file));
      if (match[5] !== "D") blob(match[4], file, match[2], findings);
    }
  }
}
export function push(remote, stdin) {
  const approved = policy();
  effectiveIdentity(approved);
  const findings = [];
  const lines = stdin.trim().split("\n").filter(Boolean);
  if (!lines.length) return findings;
  const updates = lines.map((line) => {
    const fields = line.split(" ");
    if (fields.length !== 4 || !OID.test(fields[1]) || !OID.test(fields[3]))
      throw new Stop("PUSH_INPUT_INVALID");
    if (!/^refs\/(?:heads|tags)\//.test(fields[2]))
      throw new Stop("REF_NAMESPACE_UNSUPPORTED");
    for (const ref of [fields[0], fields[2]])
      findings.push(...inspect(Buffer.from(ref), "[ref-name]"));
    return fields;
  });
  const localHelpers = spawnSync(
    "git",
    [
      "config",
      "--local",
      "--includes",
      "--get-regexp",
      "^(credential\\..*helper|core\\.sshcommand|remote\\..*\\.vcs)$",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (localHelpers.status !== 1)
    throw new Stop("LOCAL_TRANSPORT_HELPER_REQUIRES_REVIEW");
  // Query the actual remote. A stale tracking ref cannot establish a new-ref baseline.
  const advertised = new Map();
  for (const row of git([
    "ls-remote",
    "--refs",
    "--",
    remote,
    "refs/heads/*",
    "refs/tags/*",
  ])
    .trim()
    .split("\n")
    .filter(Boolean)) {
    const [oid, ref, extra] = row.split("\t");
    if (extra || !OID.test(oid) || !ref?.startsWith("refs/"))
      throw new Stop("REMOTE_BASELINE_UNVERIFIABLE");
    advertised.set(ref, oid);
  }
  const baseline = new Set();
  for (const oid of advertised.values())
    baseline.add(peel(oid, approved, findings, false));
  const tips = new Set();
  for (const [, localOid, remoteRef, remoteOid] of updates) {
    if (
      (advertised.get(remoteRef) ?? "0".repeat(remoteOid.length)) !== remoteOid
    )
      throw new Stop("REMOTE_BASELINE_CHANGED");
    if (!ZERO.test(localOid))
      tips.add(peel(localOid, approved, findings, true));
  }
  if (!tips.size) return findings;
  const revisionInput =
    [...tips, ...[...baseline].map((oid) => "^" + oid)].join("\n") + "\n";
  const commits = git(["rev-list", "--reverse", "--topo-order", "--stdin"], {
    input: revisionInput,
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  if (commits.length > MAX_COMMITS) throw new Stop("OUTGOING_COMMIT_LIMIT");
  for (const commit of commits) {
    if (!OID.test(commit)) throw new Stop("COMMIT_UNVERIFIABLE");
    metadata(commit, "commit", approved, findings);
    changedBlobs(commit, findings);
  }
  return findings;
}
export function outbound(files) {
  if (!files.length) throw new Stop("EXACT_OUTBOUND_FILE_REQUIRED");
  const root = process.cwd();
  return files.flatMap((file) => {
    const absolute = path.resolve(file);
    const relative = path.relative(root, absolute);
    const label = relative.startsWith("..") ? "[outbound-file]" : relative;
    const filenameFindings = inspect(Buffer.alloc(0), path.basename(file));
    return [
      ...filenameFindings,
      ...inspect(regularBytes(absolute), label, path.basename(file)),
    ];
  });
}
function pushInput() {
  const bytes = readFileSync(0);
  if (bytes.length > MAX_BYTES) throw new Stop("PUSH_INPUT_INVALID");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Stop("PUSH_INPUT_INVALID");
  }
}
export function main(args = process.argv.slice(2)) {
  try {
    const [mode, ...rest] = args;
    if (mode === "health" && !rest.length) {
      console.log(JSON.stringify({ ok: true, ...health() }));
      return 0;
    }
    health();
    let findings;
    if (mode === "staged" && !rest.length) findings = staged();
    else if (mode === "message" && rest.length === 1)
      findings = message(rest[0]);
    else if (mode === "push" && rest.length === 2)
      findings = push(rest[1], pushInput());
    else if (mode === "outbound") findings = outbound(rest);
    else throw new Stop("COMMAND_INVALID");
    const unique = [
      ...new Map(
        findings.map((finding) => [JSON.stringify(finding), finding]),
      ).values(),
    ];
    console.log(JSON.stringify({ ok: unique.length === 0, findings: unique }));
    return unique.length ? 1 : 0;
  } catch (error) {
    console.log(
      JSON.stringify({
        ok: false,
        findings: [
          {
            path: ".",
            category:
              error instanceof Stop ? error.category : "PREFLIGHT_UNVERIFIABLE",
          },
        ],
      }),
    );
    return 1;
  }
}
export function isEntryPoint(url) {
  if (!process.argv[1] || process.argv[1] === "-") return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(url);
  } catch {
    console.log(
      JSON.stringify({
        ok: false,
        findings: [{ path: ".", category: "ENTRYPOINT_UNVERIFIABLE" }],
      }),
    );
    process.exitCode = 1;
    return false;
  }
}
if (isEntryPoint(import.meta.url)) process.exitCode = main();
