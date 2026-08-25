import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";

export const APPROVED_NAME = "nontwo";
export const APPROVED_EMAIL = "163475477+nontwo@users.noreply.github.com";
export const PRIVATE_PATTERNS_FILENAME = "privacy-guard-private-patterns.json";
const LEGACY_BOUNDARY_PATH =
  "docs/governance/privacy/legacy-public-ref-boundary.json";
const LEGACY_BOUNDARY_SHA256 =
  "c14929c96486d45114e6bc0ad52d9770d692140db7204f522a65bd1649276746";

const ZERO_OID = /^0{40,64}$/;
const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".conf",
  ".cpp",
  ".css",
  ".csv",
  ".env.example",
  ".gitattributes",
  ".gitignore",
  ".h",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".properties",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const METADATA_EXTENSIONS = new Set([
  ".docm",
  ".docx",
  ".dotm",
  ".dotx",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".potm",
  ".potx",
  ".ppsm",
  ".ppsx",
  ".pptm",
  ".pptx",
  ".sldm",
  ".sldx",
  ".webp",
  ".xlsb",
  ".xlsm",
  ".xlsx",
  ".xltm",
  ".xltx",
  ".zip",
]);
const OOXML_EXTENSIONS = new Set([
  ".docm",
  ".docx",
  ".dotm",
  ".dotx",
  ".potm",
  ".potx",
  ".ppsm",
  ".ppsx",
  ".pptm",
  ".pptx",
  ".sldm",
  ".sldx",
  ".xlsb",
  ".xlsm",
  ".xlsx",
  ".xltm",
  ".xltx",
]);

function finding(kind, target, line, remediation) {
  return {
    kind,
    line: Number.isInteger(line) && line > 0 ? line : undefined,
    remediation,
    target,
  };
}

function lineNumberAt(text, index) {
  return text.slice(0, Math.max(0, index)).split("\n").length;
}

function isAllowedEmail(email) {
  const normalized = email.toLowerCase();
  if (normalized.endsWith(".invalid")) return true;
  if (normalized === "noreply@github.com") return true;
  if (
    /^\d+\+[a-z0-9][a-z0-9-]*(?:\[bot\])?@users\.noreply\.github\.com$/i.test(
      email,
    )
  ) {
    return true;
  }
  return false;
}

function collectMatches(text, expression) {
  return [...text.matchAll(expression)];
}

function scanPrivatePatterns(text, target, privatePatterns) {
  const findings = [];
  for (const pattern of privatePatterns ?? []) {
    if (typeof pattern !== "string" || pattern.length < 3) continue;
    let offset = text.indexOf(pattern);
    while (offset !== -1) {
      findings.push(
        finding(
          "machine-local-pattern",
          target.replaceAll(pattern, "[REDACTED_LOCAL]"),
          lineNumberAt(text, offset),
          "replace the machine-local value with neutral public wording",
        ),
      );
      offset = text.indexOf(pattern, offset + pattern.length);
    }
  }
  return findings;
}

export function scanText(text, options = {}) {
  const target = options.target ?? "public text";
  const findings = scanPrivatePatterns(text, target, options.privatePatterns);

  for (const match of collectMatches(
    text,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu,
  )) {
    if (!isAllowedEmail(match[0])) {
      findings.push(
        finding(
          "personal-email",
          target,
          lineNumberAt(text, match.index),
          "replace the address with an approved GitHub noreply identity",
        ),
      );
    }
  }

  const pathPatterns = [
    /(?:file:\/\/)?\/Users\/[^/\s<>{}]+(?:\/[^\s]*)?/giu,
    /(?:file:\/\/)?\/home\/[^/\s<>{}]+(?:\/[^\s]*)?/giu,
    /(?:file:\/\/)?[A-Z]:\\Users\\[^\\\s<>{}]+(?:\\[^\s]*)?/giu,
  ];
  for (const expression of pathPatterns) {
    for (const match of collectMatches(text, expression)) {
      findings.push(
        finding(
          "personal-path",
          target,
          lineNumberAt(text, match.index),
          "replace the absolute home path with a repository-relative or neutral path",
        ),
      );
    }
  }

  const privateKeyExpression = /-{5}BEGIN(?: [A-Z0-9]+)? PRIVATE\s+KEY-{5}/giu;
  for (const match of collectMatches(text, privateKeyExpression)) {
    findings.push(
      finding(
        "private-key",
        target,
        lineNumberAt(text, match.index),
        "remove the private key and rotate the affected credential",
      ),
    );
  }

  const tokenExpressions = [
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/gu,
    /\bAKIA[A-Z0-9]{16}\b/gu,
    /\b(?:sk|rk)_(?:live|prod)_[A-Za-z0-9]{16,}\b/gu,
    /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/gu,
  ];
  for (const expression of tokenExpressions) {
    for (const match of collectMatches(text, expression)) {
      findings.push(
        finding(
          "credential-token",
          target,
          lineNumberAt(text, match.index),
          "remove and rotate the credential",
        ),
      );
    }
  }

  for (const match of collectMatches(text, /\bhttps?:\/\/[^\s"'<>]+/giu)) {
    let parsedUrl;
    try {
      parsedUrl = new URL(match[0]);
    } catch {
      parsedUrl = undefined;
    }
    if (
      parsedUrl &&
      (parsedUrl.username || parsedUrl.password) &&
      parsedUrl.hostname !== "example.invalid" &&
      !parsedUrl.hostname.endsWith(".example.invalid")
    ) {
      findings.push(
        finding(
          "authenticated-url",
          target,
          lineNumberAt(text, match.index),
          "remove credentials from the URL and rotate them if real",
        ),
      );
    }
  }

  const assignmentExpression =
    /\b((?:[A-Za-z0-9]+[_-])*(?:password|passwd|token|secret|credential|api[_-]?key|private[_-]?key)(?:[_-][A-Za-z0-9]+)*)\b[ \t]*[:=](?:[ \t\r\n]*"([^",\r\n][^"\r\n]*)"(?=$|[ \t,;}])|[ \t\r\n]*'([^',\r\n][^'\r\n]*)'(?=$|[ \t,;}])|[ \t]*([^\s,"'`;}{][^\s,"'`;}{]*))/giu;
  for (const match of collectMatches(text, assignmentExpression)) {
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    const safeSynthetic =
      value === "" ||
      value === "$" ||
      /^(?:placeholder|example|dummy|synthetic|test|moya_test)(?:[_-][A-Za-z0-9]+)*$/iu.test(
        value,
      ) ||
      /^\$\{[A-Z_][A-Z0-9_]*\}$/u.test(value) ||
      /^<[^>]+>$|^\{\{[^}]+\}\}$/u.test(value) ||
      /^(?:process\.env(?:\.[A-Z_][A-Z0-9_]*|\[["'][A-Z_][A-Z0-9_]*["']\])|Deno\.env\.get\(["'][A-Z_][A-Z0-9_]*["']\))$/u.test(
        value,
      ) ||
      /^(?:example\.invalid|localhost|127\.0\.0\.1)$/iu.test(value);
    if (!safeSynthetic) {
      findings.push(
        finding(
          "credential-assignment",
          target,
          lineNumberAt(text, match.index),
          "replace the value with an empty placeholder or a clearly synthetic fixture",
        ),
      );
    }
  }

  for (const match of collectMatches(
    text,
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/giu,
  )) {
    let parsedConnection;
    try {
      parsedConnection = new URL(match[0]);
    } catch {
      parsedConnection = undefined;
    }
    const hostname = parsedConnection?.hostname.toLowerCase();
    const safeHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "example.invalid" ||
      hostname?.endsWith(".example.invalid");
    if (!safeHost) {
      findings.push(
        finding(
          "production-connection-string",
          target,
          lineNumberAt(text, match.index),
          "remove the production connection string and use an empty placeholder",
        ),
      );
    }
  }

  const labeledPersonalExpressions = [
    /\b(?:phone|mobile|telephone|tel)\s*[:=]\s*\+?[0-9][0-9 ()-]{6,}/giu,
    /\b(?:home|mailing)\s+address\s*[:=]\s*\S.+/giu,
    /\b(?:student|government|passport|tax|bank|account|card|medical|immigration)\s+(?:id|identifier|number|record|document)\s*[:=]\s*\S+/giu,
  ];
  for (const expression of labeledPersonalExpressions) {
    for (const match of collectMatches(text, expression)) {
      findings.push(
        finding(
          "regulated-personal-data",
          target,
          lineNumberAt(text, match.index),
          "remove the labeled personal or regulated identifier",
        ),
      );
    }
  }

  for (const match of collectMatches(
    text,
    /(?:private|non[- ]public).{0,80}(?:github\.com|gitlab\.com|bitbucket\.org)[A-Za-z0-9_.:/@-]*[/:][A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?/giu,
  )) {
    findings.push(
      finding(
        "private-repository-locator",
        target,
        lineNumberAt(text, match.index),
        "replace the repository locator with neutral provenance",
      ),
    );
  }

  for (const match of collectMatches(
    text,
    /\b(?:private|non[- ]public)[ _-]+(?:source[ _-]+)?(?:repository|repo)(?:[ _-]+(?:locator|url|slug))?\b[ \t]*[:=][ \t]*(?:(?:https?|ssh):\/\/[^/\s"']+\/[^/\s"']+\/[^\s"']+|git@[^:\s"']+:[^/\s"']+\/[^\s"']+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/giu,
  )) {
    findings.push(
      finding(
        "private-repository-locator",
        target,
        lineNumberAt(text, match.index),
        "replace the repository locator with neutral provenance",
      ),
    );
  }

  for (const match of collectMatches(
    text,
    /(?:private|non[- ]public).{0,80}s3:\/\/[A-Za-z0-9._/-]+/giu,
  )) {
    findings.push(
      finding(
        "private-storage-locator",
        target,
        lineNumberAt(text, match.index),
        "replace the private storage locator with neutral provenance",
      ),
    );
  }

  for (const match of collectMatches(
    text,
    /\bprivate[ _-](?:research[ _-])?(?:export|evidence(?:[ _-]store)?|storage|dataset|artifact|database|sqlite|source)(?:[ _-](?:path|file|locator|url|bucket))?\b[ \t]*[:=][ \t]*(?:(?:s3:\/\/|file:\/\/|\/|[A-Z]:\\|(?:\.{0,2}\/)?[A-Za-z0-9_.-]+[/\\])[^\s"',]+|[^\s"',]+\.(?:csv|xlsx|xlsm|sqlite|db|zip|json))/giu,
  )) {
    findings.push(
      finding(
        "private-export-locator",
        target,
        lineNumberAt(text, match.index),
        "replace the private export or storage locator with neutral provenance",
      ),
    );
  }

  const certificateHeader = ["-----BEGIN", "CERTIFICATE-----"].join(" ");
  for (let offset = text.indexOf(certificateHeader); offset !== -1;) {
    findings.push(
      finding(
        "certificate-material",
        target,
        lineNumberAt(text, offset),
        "remove certificate material and publish only a documented fingerprint if required",
      ),
    );
    offset = text.indexOf(certificateHeader, offset + certificateHeader.length);
  }

  for (const match of collectMatches(
    text,
    /(?:(?:private\s+research|research\s+source).{0,80}\b[0-9a-f]{40,64}\b|\b[0-9a-f]{40,64}\b.{0,80}(?:private\s+research|research\s+source))/giu,
  )) {
    findings.push(
      finding(
        "private-research-commit",
        target,
        lineNumberAt(text, match.index),
        "remove the private commit identity and use neutral provenance",
      ),
    );
  }

  if (/^(?:[A-Z_][A-Z0-9_]*=.+\n){8,}/mu.test(text)) {
    findings.push(
      finding(
        "raw-environment-dump",
        target,
        1,
        "replace the environment dump with a redacted summary",
      ),
    );
  }

  return deduplicateFindings(findings);
}

export function scanFilename(filename, target = filename, options = {}) {
  const findings = [];
  const basename = path.basename(filename);
  findings.push(
    ...scanText(filename, {
      privatePatterns: options.privatePatterns,
      target,
    }),
  );
  for (const match of basename.matchAll(/\+?[0-9][0-9 ()-]{7,}[0-9]/gu)) {
    const digitCount = match[0].replace(/\D/gu, "").length;
    if (digitCount >= 10 && digitCount <= 15) {
      findings.push(
        finding(
          "unsafe-filename-phone",
          target,
          undefined,
          "rename the file without personal contact information",
        ),
      );
    }
  }
  if (
    /(?:passport|student[-_ ]?id|government[-_ ]?id|bank[-_ ]?account|medical[-_ ]?record|immigration)/iu.test(
      basename,
    )
  ) {
    findings.push(
      finding(
        "unsafe-filename-identity",
        target,
        undefined,
        "rename the file without identity-document context",
      ),
    );
  }
  if (
    /(?:gmail|outlook|wechat|whatsapp|bank|passport|account)[-_ ]?(?:screen|screenshot|capture)/iu.test(
      basename,
    )
  ) {
    findings.push(
      finding(
        "unsafe-screenshot-filename",
        target,
        undefined,
        "rename the screenshot with neutral public context",
      ),
    );
  }
  return deduplicateFindings(findings);
}

function parseGithubNoreply(email) {
  const match = email.match(
    /^(\d+)\+([a-z0-9][a-z0-9-]*(?:\[bot\])?)@users\.noreply\.github\.com$/iu,
  );
  return match ? { handle: match[2] } : undefined;
}

function isAiIdentity(value) {
  return /(?:^|[^a-z])(?:ai|codex|chatgpt|openai|artificial[ _-]?intelligence)(?:[^a-z]|$)/iu.test(
    value,
  );
}

export function validateGitIdentity(name, email, options = {}) {
  const target = options.target ?? "Git identity";
  if (
    isAiIdentity(name) ||
    isAiIdentity(parseGithubNoreply(email)?.handle ?? "")
  ) {
    return [
      finding(
        "email-bearing-ai-identity",
        target,
        undefined,
        "use an accountable human GitHub ID-based noreply identity and record tool assistance without an email",
      ),
    ];
  }
  if (name === APPROVED_NAME && email === APPROVED_EMAIL) return [];
  if (name === "GitHub" && email.toLowerCase() === "noreply@github.com")
    return [];

  const noreply = parseGithubNoreply(email);
  if (noreply && name.toLowerCase() === noreply.handle.toLowerCase()) return [];

  const kind = isAllowedEmail(email)
    ? "git-identity-name-email-mismatch"
    : "unsafe-git-identity";
  return [
    finding(
      kind,
      target,
      undefined,
      "use a matching GitHub ID-based noreply identity",
    ),
  ];
}

function scanEmailTrailers(text, target) {
  const findings = [];
  for (const match of text.matchAll(
    /^[A-Za-z][A-Za-z-]*-by:\s*(.+?)\s*<([^<>]+)>\s*$/gimu,
  )) {
    const trailerName = match[1].trim();
    const trailerEmail = match[2].trim();
    if (
      /(?:codex|chatgpt|openai|artificial intelligence|\bai\b)/iu.test(
        trailerName,
      )
    ) {
      findings.push(
        finding(
          "email-bearing-ai-trailer",
          target,
          lineNumberAt(text, match.index),
          "replace the trailer with Assisted-by: Codex or omit it",
        ),
      );
    } else {
      findings.push(
        ...validateGitIdentity(trailerName, trailerEmail, {
          target,
        }),
      );
    }
  }
  return findings;
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd,
    encoding: options.binary ? null : "utf8",
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 && !options.allowFailure) {
    const operation = args[0] ?? "operation";
    throw new Error(
      `Git ${operation} failed without emitting sensitive output.`,
    );
  }
  return result;
}

export function repositoryRoot(cwd = process.cwd()) {
  return git(["rev-parse", "--show-toplevel"], { cwd }).stdout.trim();
}

export function gitCommonDirectory(cwd = process.cwd()) {
  const common = git(
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    {
      cwd,
    },
  ).stdout.trim();
  return common;
}

export function loadPrivatePatterns(cwd = process.cwd()) {
  const privateFile = path.join(
    gitCommonDirectory(cwd),
    PRIVATE_PATTERNS_FILENAME,
  );
  if (!existsSync(privateFile)) return [];
  try {
    const parsed = JSON.parse(readFileSync(privateFile, "utf8"));
    return Array.isArray(parsed.patterns)
      ? parsed.patterns.filter((item) => typeof item === "string")
      : [];
  } catch {
    throw new Error("The private local-pattern file is unreadable or invalid.");
  }
}

export function writePrivatePatterns(patterns, cwd = process.cwd()) {
  const privateFile = path.join(
    gitCommonDirectory(cwd),
    PRIVATE_PATTERNS_FILENAME,
  );
  const unique = [
    ...new Set(patterns.filter((value) => typeof value === "string" && value)),
  ];
  writeFileSync(
    privateFile,
    `${JSON.stringify({ policyVersion: 1, patterns: unique }, null, 2)}\n`,
    { mode: 0o600 },
  );
  chmodSync(privateFile, 0o600);
  return { path: privateFile, mode: statSync(privateFile).mode & 0o777 };
}

export function inspectCurrentIdentity(cwd = process.cwd()) {
  const findings = [];
  const author = git(["var", "GIT_AUTHOR_IDENT"], { cwd }).stdout;
  const committer = git(["var", "GIT_COMMITTER_IDENT"], { cwd }).stdout;
  const parse = (value) => {
    const match = value.match(/^(.*) <([^<>]+)> /u);
    return match ? { name: match[1], email: match[2] } : undefined;
  };
  const parsedAuthor = parse(author);
  const parsedCommitter = parse(committer);
  if (!parsedAuthor) {
    findings.push(
      finding(
        "unparseable-git-identity",
        "current Author",
        undefined,
        "repair Git identity configuration",
      ),
    );
  } else {
    findings.push(
      ...validateGitIdentity(parsedAuthor.name, parsedAuthor.email, {
        target: "current Author",
      }),
    );
  }
  if (!parsedCommitter) {
    findings.push(
      finding(
        "unparseable-git-identity",
        "current Committer",
        undefined,
        "repair Git identity configuration",
      ),
    );
  } else {
    findings.push(
      ...validateGitIdentity(parsedCommitter.name, parsedCommitter.email, {
        target: "current Committer",
      }),
    );
  }

  for (const variable of [
    "GIT_AUTHOR_NAME",
    "GIT_AUTHOR_EMAIL",
    "GIT_COMMITTER_NAME",
    "GIT_COMMITTER_EMAIL",
    "EMAIL",
  ]) {
    if (!(variable in process.env) || process.env[variable] === "") continue;
    const expected = variable.endsWith("_NAME")
      ? APPROVED_NAME
      : APPROVED_EMAIL;
    if (process.env[variable] !== expected) {
      findings.push(
        finding(
          "git-environment-override",
          variable,
          undefined,
          "remove the conflicting environment override",
        ),
      );
    }
  }
  return deduplicateFindings(findings);
}

function extensionFor(filename) {
  if (filename.endsWith(".env.example")) return ".env.example";
  return path.extname(filename).toLowerCase();
}

function looksTextual(buffer, filename) {
  if (TEXT_EXTENSIONS.has(extensionFor(filename))) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (sample.includes(0)) return false;
  if (sample.length === 0) return true;
  let printable = 0;
  for (const byte of sample) {
    if (
      byte === 9 ||
      byte === 10 ||
      byte === 13 ||
      (byte >= 32 && byte <= 126) ||
      byte >= 128
    ) {
      printable += 1;
    }
  }
  return printable / sample.length > 0.85;
}

function decodePngMetadata(buffer) {
  const values = [];
  if (buffer.length < 8 || buffer.subarray(1, 4).toString("ascii") !== "PNG")
    return values;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "tEXt") values.push(data.toString("utf8").replace("\0", ": "));
    if (type === "eXIf") values.push(data.toString("utf8"));
    if (type === "zTXt") {
      const separator = data.indexOf(0);
      if (separator > -1 && separator + 2 < data.length) {
        try {
          values.push(data.subarray(0, separator).toString("utf8"));
          values.push(
            inflateSync(data.subarray(separator + 2)).toString("utf8"),
          );
        } catch {
          values.push("unreadable compressed PNG metadata");
        }
      }
    }
    if (type === "iTXt") values.push(data.toString("utf8"));
    offset = dataEnd + 4;
  }
  return values;
}

function decodeJpegMetadata(buffer) {
  const values = [];
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8)
    return values;
  let offset = 2;
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) {
      values.push(
        buffer.subarray(offset + 4, offset + 2 + length).toString("latin1"),
      );
    }
    offset += 2 + length;
  }
  return values;
}

function decodeWebpMetadata(buffer) {
  const values = [];
  if (
    buffer.length < 12 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return values;
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    const length = buffer.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (end > buffer.length) break;
    if (type === "EXIF" || type === "XMP ") {
      values.push(buffer.subarray(offset + 8, end).toString("latin1"));
    }
    offset = end + (length % 2);
  }
  return values;
}

function decodePdfMetadata(buffer) {
  if (!buffer.subarray(0, 5).toString("ascii").startsWith("%PDF-")) return [];
  const text = buffer.toString("latin1");
  const values = [];
  for (const match of text.matchAll(
    /\/(?:Author|Creator|Producer|Subject|Title|Keywords)\s*(?:\(([^)]*)\)|<([^>]*)>)/giu,
  )) {
    values.push(match[0]);
  }
  for (const match of text.matchAll(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/giu)) {
    values.push(match[0]);
  }
  return values;
}

function readZipEntries(buffer) {
  const minimumEocd = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= minimumEocd; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1) throw new Error("ZIP central directory was not found.");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    ) {
      throw new Error("ZIP central directory is malformed.");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");
    if ((flags & 0x1) !== 0) {
      throw new Error("Encrypted ZIP entries cannot be privacy-scanned.");
    }
    if (method !== 0 && method !== 8) {
      throw new Error("Unsupported ZIP compression cannot be privacy-scanned.");
    }
    if (uncompressedSize > 32 * 1024 * 1024) {
      throw new Error("ZIP entry exceeds the privacy scanner size limit.");
    }
    if (
      localOffset + 30 > buffer.length ||
      buffer.readUInt32LE(localOffset) !== 0x04034b50
    ) {
      throw new Error("ZIP local entry is malformed.");
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : inflateRawSync(compressed);
    entries.push({ data, method, name });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function scanMetadataText(text, target, privatePatterns) {
  const findings = scanText(text, { target, privatePatterns });
  const authorExpressions = [
    /<(?:dc:creator|cp:lastModifiedBy|Company|Manager)[^>]*>\s*([^<]+)\s*</giu,
    /\/(?:Author|Creator)\s*\(([^)]+)\)/giu,
    /\b(?:Author|Artist|Creator|Owner(?:Name)?|DeviceOwner|Company|Manager|Contact|Account(?:Name)?)(?:\[\d+\])?\s*[:=]\s*([^\r\n;]+)/giu,
  ];
  for (const expression of authorExpressions) {
    for (const match of text.matchAll(expression)) {
      const value = match[1]?.trim();
      if (
        !value ||
        value === APPROVED_NAME ||
        /^(?:GitHub|github-actions\[bot\]|dependabot\[bot\])$/iu.test(value)
      ) {
        continue;
      }
      findings.push(
        finding(
          "personal-document-author",
          target,
          lineNumberAt(text, match.index),
          "remove or replace personal author, creator, owner, or company metadata",
        ),
      );
    }
  }
  if (/\b(?:GPS|GPSLatitude|GPSLongitude|Location)\s*[:=]/iu.test(text)) {
    findings.push(
      finding(
        "location-metadata",
        target,
        undefined,
        "remove GPS or private location metadata",
      ),
    );
  }
  return deduplicateFindings(findings);
}

function scanZipMetadata(buffer, filename, privatePatterns) {
  const findings = [];
  let entries;
  try {
    entries = readZipEntries(buffer);
  } catch {
    return [
      finding(
        "unreadable-archive-metadata",
        filename,
        undefined,
        "provide a valid inspectable archive or document",
      ),
    ];
  }
  const isOoxml = OOXML_EXTENSIONS.has(extensionFor(filename));
  for (const entry of entries) {
    findings.push(
      ...scanFilename(entry.name, `${filename}:${entry.name}`, {
        privatePatterns,
      }),
    );
    const activeContent =
      /(?:^|\/)(?:vbaProject\.bin|macros?|embeddings?\/|externalLinks?\/)/iu.test(
        entry.name,
      );
    if (activeContent) {
      findings.push(
        finding(
          "unexpected-active-content",
          `${filename}:${entry.name}`,
          undefined,
          "remove macros, embedded files, or external links",
        ),
      );
    }
    const inspectEntry =
      !isOoxml ||
      /^docProps\//u.test(entry.name) ||
      /(?:comments?|\.rels$|externalLinks?|customXml)/iu.test(entry.name);
    if (!inspectEntry || entry.data.length === 0) continue;
    const text = entry.data.toString("utf8");
    findings.push(
      ...scanMetadataText(text, `${filename}:${entry.name}`, privatePatterns),
    );
    if (/TargetMode\s*=\s*["']External["']/iu.test(text)) {
      findings.push(
        finding(
          "external-document-relationship",
          `${filename}:${entry.name}`,
          undefined,
          "remove external document relationships",
        ),
      );
    }
  }
  return deduplicateFindings(findings);
}

function flattenExiftoolMetadata(value, prefix = "", output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      flattenExiftoolMetadata(item, `${prefix}[${index}]`, output),
    );
    return output;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (
        ["SourceFile", "Directory", "FileName", "FilePermissions"].includes(key)
      )
        continue;
      flattenExiftoolMetadata(child, prefix ? `${prefix}.${key}` : key, output);
    }
    return output;
  }
  if (value !== null && value !== undefined)
    output.push(`${prefix}: ${String(value)}`);
  return output;
}

function scanWithExiftool(buffer, filename, privatePatterns) {
  if (process.env.MOYA_USE_EXIFTOOL !== "1") return [];
  const version = spawnSync("exiftool", ["-ver"], { encoding: "utf8" });
  if (version.status !== 0) {
    return [
      finding(
        "exiftool-unavailable",
        filename,
        undefined,
        "install ExifTool for CI metadata enforcement",
      ),
    ];
  }
  const directory = mkdtempSync(path.join(os.tmpdir(), "moya-metadata-"));
  const temporaryFile = path.join(
    directory,
    `artifact${extensionFor(filename)}`,
  );
  try {
    writeFileSync(temporaryFile, buffer, { mode: 0o600 });
    const result = spawnSync(
      "exiftool",
      ["-json", "-G1", "-a", "-s", temporaryFile],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    if (result.status !== 0) {
      return [
        finding(
          "exiftool-inspection-failed",
          filename,
          undefined,
          "provide metadata that ExifTool can inspect",
        ),
      ];
    }
    const metadata = JSON.parse(result.stdout);
    const text = flattenExiftoolMetadata(metadata).join("\n");
    return scanMetadataText(text, `${filename}:ExifTool`, privatePatterns);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function scanBinaryMetadata(buffer, filename, options = {}) {
  const extension = extensionFor(filename);
  const privatePatterns = options.privatePatterns ?? [];
  let values = [];
  if (extension === ".png") values = decodePngMetadata(buffer);
  else if (extension === ".jpg" || extension === ".jpeg")
    values = decodeJpegMetadata(buffer);
  else if (extension === ".webp") values = decodeWebpMetadata(buffer);
  else if (extension === ".pdf") values = decodePdfMetadata(buffer);
  else if (extension === ".zip" || OOXML_EXTENSIONS.has(extension)) {
    return deduplicateFindings([
      ...scanZipMetadata(buffer, filename, privatePatterns),
      ...scanWithExiftool(buffer, filename, privatePatterns),
    ]);
  }
  const findings = [];
  for (const value of values) {
    findings.push(
      ...scanMetadataText(value, `${filename}:metadata`, privatePatterns),
    );
  }
  findings.push(...scanWithExiftool(buffer, filename, privatePatterns));
  return deduplicateFindings(findings);
}

function scanStructuralContent(filename, text) {
  const findings = [];
  const normalized = filename.replaceAll("\\", "/");
  if (normalized.endsWith("docs/prototypes/mobile-preview/README.md")) {
    if (/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/iu.test(text)) {
      findings.push(
        finding(
          "prototype-private-source-locator",
          filename,
          undefined,
          "use neutral prototype provenance without a repository slug",
        ),
      );
    }
    if (/(?:export|source)[^\n]{0,60}\.(?:csv|xlsx|sqlite)\b/iu.test(text)) {
      findings.push(
        finding(
          "prototype-private-export-locator",
          filename,
          undefined,
          "use neutral prototype provenance without an export filename",
        ),
      );
    }
  }
  if (
    normalized.endsWith(
      "docs/prototypes/mobile-preview/fixtures/p5-pilot.snapshot.js",
    )
  ) {
    if (
      /(?:source|research)[^\n]{0,80}\bcommit\b[^\n]{0,80}\b[0-9a-f]{7,40}\b/iu.test(
        text,
      )
    ) {
      findings.push(
        finding(
          "fixture-private-source-commit",
          filename,
          undefined,
          "retain only the approved canonical input fingerprint",
        ),
      );
    }
  }
  if (
    normalized.endsWith(
      "tests/unit/backend/catalog-importer-security-boundaries.test.ts",
    )
  ) {
    if (
      /(?:github\.com\/|private[-_ ]?repo|research[-_ ]?repository)/iu.test(
        text,
      )
    ) {
      findings.push(
        finding(
          "importer-test-private-repository-coupling",
          filename,
          undefined,
          "use generic architecture-boundary patterns",
        ),
      );
    }
  }
  return findings;
}

export function scanFileBuffer(buffer, filename, options = {}) {
  const privatePatterns = options.privatePatterns ?? [];
  const findings = scanFilename(filename, filename, { privatePatterns });
  if (METADATA_EXTENSIONS.has(extensionFor(filename))) {
    findings.push(...scanBinaryMetadata(buffer, filename, { privatePatterns }));
  } else if (looksTextual(buffer, filename)) {
    const text = buffer.toString("utf8");
    findings.push(...scanText(text, { privatePatterns, target: filename }));
    findings.push(...scanStructuralContent(filename, text));
  } else {
    const printable = buffer
      .toString("latin1")
      .replace(/[^\x20-\x7e\r\n\t]+/gu, "\n");
    findings.push(
      ...scanText(printable, {
        privatePatterns,
        target: `${filename}:binary-strings`,
      }),
    );
  }
  return deduplicateFindings(findings);
}

function parseNameStatusZ(buffer) {
  const fields = buffer.toString("utf8").split("\0");
  const changes = [];
  let index = 0;
  while (index < fields.length && fields[index]) {
    const status = fields[index];
    index += 1;
    if (status.startsWith("R") || status.startsWith("C")) {
      const oldPath = fields[index];
      const newPath = fields[index + 1];
      index += 2;
      changes.push({ status, oldPath, path: newPath });
    } else {
      const changedPath = fields[index];
      index += 1;
      changes.push({ status, path: changedPath });
    }
  }
  return changes;
}

function objectBuffer(revision, filename, cwd) {
  const objectName =
    revision === ":" ? `:${filename}` : `${revision}:${filename}`;
  const result = git(["show", objectName], {
    allowFailure: true,
    binary: true,
    cwd,
  });
  return result.status === 0 ? result.stdout : undefined;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function requiresWholeTextScan(filename) {
  const normalized = filename.replaceAll("\\", "/");
  return (
    normalized === LEGACY_BOUNDARY_PATH ||
    normalized.endsWith("docs/prototypes/mobile-preview/README.md") ||
    normalized.endsWith(
      "docs/prototypes/mobile-preview/fixtures/p5-pilot.snapshot.js",
    ) ||
    normalized.endsWith(
      "tests/unit/backend/catalog-importer-security-boundaries.test.ts",
    )
  );
}

function addedTextForChange(change, revision, baseRevision, cwd) {
  const argumentsForDiff =
    revision === ":" ? ["diff", "--cached"] : ["diff", baseRevision, revision];
  const result = git(
    [
      ...argumentsForDiff,
      "--unified=0",
      "--no-color",
      "--no-ext-diff",
      "--",
      change.path,
    ].filter(Boolean),
    { cwd },
  );
  const addedLines = [];
  let inHunk = false;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("diff --git ")) {
      inHunk = false;
      continue;
    }
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (inHunk && line.startsWith("+")) addedLines.push(line.slice(1));
  }
  return addedLines.join("\n");
}

function scanChanges(changes, revision, cwd, privatePatterns, baseRevision) {
  const findings = [];
  for (const change of changes) {
    findings.push(
      ...scanFilename(change.path, change.path, { privatePatterns }),
    );
    if (change.oldPath)
      findings.push(
        ...scanFilename(change.oldPath, change.oldPath, { privatePatterns }),
      );
    const touchesBoundary = [change.path, change.oldPath]
      .filter(Boolean)
      .some(
        (filename) => filename.replaceAll("\\", "/") === LEGACY_BOUNDARY_PATH,
      );
    const renamesBoundary = change.status.startsWith("R") && touchesBoundary;
    if (change.status.startsWith("D")) {
      if (touchesBoundary) {
        findings.push(
          finding(
            "legacy-boundary-modification",
            LEGACY_BOUNDARY_PATH,
            undefined,
            "preserve the frozen legacy boundary and obtain an explicit Owner decision for any exception",
          ),
        );
      }
      continue;
    }
    const buffer = objectBuffer(revision, change.path, cwd);
    if (!buffer) {
      findings.push(
        finding(
          "unreadable-changed-object",
          change.path,
          undefined,
          "make the changed object available for scanning",
        ),
      );
      continue;
    }
    if (
      touchesBoundary &&
      (renamesBoundary || sha256(buffer) !== LEGACY_BOUNDARY_SHA256)
    ) {
      findings.push(
        finding(
          "legacy-boundary-modification",
          LEGACY_BOUNDARY_PATH,
          undefined,
          "preserve the frozen legacy boundary and obtain an explicit Owner decision for any exception",
        ),
      );
    }

    const fullObjectRequired =
      change.status.startsWith("A") ||
      METADATA_EXTENSIONS.has(extensionFor(change.path)) ||
      requiresWholeTextScan(change.path) ||
      !looksTextual(buffer, change.path);
    if (fullObjectRequired) {
      findings.push(
        ...scanFileBuffer(buffer, change.path, { privatePatterns }),
      );
      continue;
    }

    const addedText = addedTextForChange(change, revision, baseRevision, cwd);
    findings.push(
      ...scanText(addedText, { privatePatterns, target: change.path }),
    );
  }
  return findings;
}

function readLegacyBoundary(cwd, override) {
  if (override) return override;
  const root = repositoryRoot(cwd);
  const boundaryPath = path.join(root, LEGACY_BOUNDARY_PATH);
  if (!existsSync(boundaryPath)) {
    return { annotatedTags: [], activePullRequests: [], branchTips: {} };
  }
  const content = readFileSync(boundaryPath);
  if (sha256(content) !== LEGACY_BOUNDARY_SHA256) {
    return { annotatedTags: [], activePullRequests: [], branchTips: {} };
  }
  return JSON.parse(content.toString("utf8"));
}

function legacyCommitSet(cwd, override) {
  const boundary = readLegacyBoundary(cwd, override);
  const roots = [
    ...Object.values(boundary.branchTips ?? {}),
    ...(boundary.annotatedTags ?? []).map((tag) => tag.peeledTarget),
    ...(boundary.activePullRequests ?? []).map(
      (pullRequest) => pullRequest.headSha,
    ),
  ].filter(Boolean);
  if (roots.length === 0) return new Set();
  const availableRoots = [...new Set(roots)].filter(
    (root) =>
      git(["cat-file", "-e", `${root}^{commit}`], {
        allowFailure: true,
        cwd,
      }).status === 0,
  );
  if (availableRoots.length === 0) return new Set();
  const result = git(["rev-list", ...availableRoots], { cwd });
  return new Set(result.stdout.trim().split("\n").filter(Boolean));
}

function legacyTagSet(cwd, override) {
  const boundary = readLegacyBoundary(cwd, override);
  return new Set((boundary.annotatedTags ?? []).map((tag) => tag.objectId));
}

function commitMetadata(commit, cwd) {
  const output = git(
    ["show", "-s", "--format=%an%x00%ae%x00%cn%x00%ce%x00%B", commit],
    { cwd },
  ).stdout;
  const [
    authorName,
    authorEmail,
    committerName,
    committerEmail,
    ...messageParts
  ] = output.split("\0");
  return {
    authorEmail,
    authorName,
    committerEmail,
    committerName,
    message: messageParts.join("\0"),
  };
}

function changesForCommit(commit, cwd) {
  const [current, ...parents] = git(
    ["rev-list", "--parents", "-n", "1", commit],
    { cwd },
  )
    .stdout.trim()
    .split(/\s+/u);
  const argumentsForDiff =
    parents.length === 0
      ? [
          "diff-tree",
          "--root",
          "--no-commit-id",
          "--name-status",
          "-r",
          "-z",
          current,
        ]
      : ["diff", "--name-status", "-z", parents[0], current];
  const output = git(argumentsForDiff, { binary: true, cwd }).stdout;
  return parseNameStatusZ(output);
}

function firstParentForCommit(commit, cwd) {
  const result = git(["rev-parse", "--verify", `${commit}^1`], {
    allowFailure: true,
    cwd,
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

export function scanCommit(commit, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const privatePatterns = options.privatePatterns ?? loadPrivatePatterns(cwd);
  const metadata = commitMetadata(commit, cwd);
  const findings = [
    ...validateGitIdentity(metadata.authorName, metadata.authorEmail, {
      target: `commit ${commit}:Author`,
    }),
    ...validateGitIdentity(metadata.committerName, metadata.committerEmail, {
      target: `commit ${commit}:Committer`,
    }),
    ...scanText(metadata.message, {
      privatePatterns,
      target: `commit ${commit}:message`,
    }),
  ];
  findings.push(
    ...scanEmailTrailers(metadata.message, `commit ${commit}:trailer`),
  );
  findings.push(
    ...scanChanges(
      changesForCommit(commit, cwd),
      commit,
      cwd,
      privatePatterns,
      firstParentForCommit(commit, cwd),
    ),
  );
  return deduplicateFindings(findings);
}

export function scanAnnotatedTag(tagObject, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  if (legacyTagSet(cwd, options.legacyBoundary).has(tagObject)) return [];
  const objectType = git(["cat-file", "-t", tagObject], { cwd }).stdout.trim();
  if (objectType !== "tag") return [];
  const content = git(["cat-file", "-p", tagObject], { cwd }).stdout;
  const separator = content.indexOf("\n\n");
  const headers = separator === -1 ? content : content.slice(0, separator);
  const message = separator === -1 ? "" : content.slice(separator + 2);
  const tagger = headers.match(/^tagger (.*) <([^<>]+)> \d+ [+-]\d+$/mu);
  const findings = [];
  if (!tagger) {
    findings.push(
      finding(
        "unparseable-tag-identity",
        `tag ${tagObject}`,
        undefined,
        "create the annotated tag with an approved Git identity",
      ),
    );
  } else {
    findings.push(
      ...validateGitIdentity(tagger[1], tagger[2], {
        target: `tag ${tagObject}:tagger`,
      }),
    );
  }
  findings.push(
    ...scanText(message, {
      privatePatterns: options.privatePatterns ?? loadPrivatePatterns(cwd),
      target: `tag ${tagObject}:message`,
    }),
    ...scanEmailTrailers(message, `tag ${tagObject}:trailer`),
  );
  return deduplicateFindings(findings);
}

export function scanRange(base, head, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const privatePatterns = options.privatePatterns ?? loadPrivatePatterns(cwd);
  const legacy = legacyCommitSet(cwd, options.legacyBoundary);
  const rangeArguments =
    !base || ZERO_OID.test(base) ? [head] : [`${base}..${head}`];
  const commits = git(["rev-list", "--reverse", ...rangeArguments], { cwd })
    .stdout.trim()
    .split("\n")
    .filter(Boolean)
    .filter((commit) => !legacy.has(commit));
  const findings = [];
  for (const commit of commits) {
    findings.push(...scanCommit(commit, { cwd, privatePatterns }));
  }
  return deduplicateFindings(findings);
}

export function scanStaged(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const privatePatterns = options.privatePatterns ?? loadPrivatePatterns(cwd);
  const result = git(
    ["diff", "--cached", "--name-status", "-z", "--diff-filter=ACMRT"],
    {
      binary: true,
      cwd,
    },
  );
  const changes = parseNameStatusZ(result.stdout);
  return deduplicateFindings([
    ...inspectCurrentIdentity(cwd),
    ...scanChanges(changes, ":", cwd, privatePatterns, "HEAD"),
  ]);
}

export function scanCommitMessageFile(filename, options = {}) {
  const privatePatterns =
    options.privatePatterns ?? loadPrivatePatterns(options.cwd);
  const text = readFileSync(filename, "utf8");
  const findings = scanText(text, {
    privatePatterns,
    target: "commit message",
  });
  findings.push(...scanEmailTrailers(text, "commit message trailer"));
  return deduplicateFindings(findings);
}

export function scanRefName(refName, options = {}) {
  return scanFilename(refName, `ref ${refName}`, {
    privatePatterns: options.privatePatterns,
  });
}

export function scanPrePushInput(input, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const privatePatterns = options.privatePatterns ?? loadPrivatePatterns(cwd);
  const findings = [];
  for (const line of input.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const [localRef, localSha, remoteRef, remoteSha] = line
      .trim()
      .split(/\s+/u);
    findings.push(
      ...scanRefName(localRef, { privatePatterns }),
      ...scanRefName(remoteRef, { privatePatterns }),
    );
    if (ZERO_OID.test(localSha)) continue;
    const type = git(["cat-file", "-t", localSha], { cwd }).stdout.trim();
    if (localRef.startsWith("refs/tags/") && type === "tag") {
      findings.push(...scanAnnotatedTag(localSha, { cwd }));
      const target = git(["rev-parse", `${localSha}^{commit}`], {
        cwd,
      }).stdout.trim();
      findings.push(...scanRange(undefined, target, { cwd }));
    } else if (type === "commit") {
      findings.push(
        ...scanRange(
          ZERO_OID.test(remoteSha) ? undefined : remoteSha,
          localSha,
          { cwd },
        ),
      );
    }
  }
  return deduplicateFindings(findings);
}

export function scanGithubEvent(eventPath, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const privatePatterns = options.privatePatterns ?? loadPrivatePatterns(cwd);
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const findings = [];
  if (event.pull_request) {
    findings.push(
      ...scanText(event.pull_request.title ?? "", {
        privatePatterns,
        target: "pull request title",
      }),
      ...scanText(event.pull_request.body ?? "", {
        privatePatterns,
        target: "pull request body",
      }),
    );
    const base = event.pull_request.base?.sha;
    const head = event.pull_request.head?.sha;
    if (base && head) findings.push(...scanRange(base, head, { cwd }));
    const headRef = event.pull_request.head?.ref;
    if (headRef)
      findings.push(
        ...scanRefName(`refs/heads/${headRef}`, { privatePatterns }),
      );
  } else if (event.ref && event.after) {
    findings.push(...scanRefName(event.ref, { privatePatterns }));
    if (!ZERO_OID.test(event.after)) {
      const resolvedRef = event.ref.startsWith("refs/tags/")
        ? git(["rev-parse", event.ref], {
            allowFailure: true,
            cwd,
          }).stdout.trim()
        : "";
      const object = resolvedRef || event.after;
      const type = git(["cat-file", "-t", object], { cwd }).stdout.trim();
      if (event.ref.startsWith("refs/tags/") && type === "tag") {
        findings.push(...scanAnnotatedTag(object, { cwd }));
        const target = git(["rev-parse", `${object}^{commit}`], {
          cwd,
        }).stdout.trim();
        findings.push(...scanRange(undefined, target, { cwd }));
      } else if (type === "commit") {
        findings.push(
          ...scanRange(
            event.before && !ZERO_OID.test(event.before)
              ? event.before
              : undefined,
            event.after,
            {
              cwd,
            },
          ),
        );
      }
    }
  }
  return deduplicateFindings(findings);
}

export function deduplicateFindings(findings) {
  const seen = new Set();
  return findings.filter((item) => {
    const key = `${item.kind}\0${item.target}\0${item.line ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function formatFindings(findings) {
  if (findings.length === 0) return "PUBLIC-SAFETY PASS";
  const lines = ["PUBLIC-SAFETY FAIL"];
  for (const item of findings) {
    const fullyRedactTarget =
      /^(?:machine-local-pattern|personal-email|personal-path|private-key|credential-token|authenticated-url|credential-assignment|production-connection-string|regulated-personal-data|private-repository-locator|private-storage-locator|private-export-locator|private-research-commit|certificate-material|raw-environment-dump|unsafe-filename-|unsafe-screenshot-filename)/u.test(
        item.kind,
      );
    const redactedTarget = fullyRedactTarget
      ? "[REDACTED_TARGET]"
      : redactForOutput(item.target);
    const location = item.line
      ? `${redactedTarget}:${item.line}`
      : redactedTarget;
    lines.push(`- ${item.kind} at ${location}; ${item.remediation}`);
  }
  return lines.join("\n");
}

function redactForOutput(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/gu, "?")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[REDACTED_EMAIL]")
    .replace(
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s]+/giu,
      "[REDACTED_CONNECTION]",
    )
    .replace(/\bhttps?:\/\/[^\s]+/giu, "[REDACTED_URL]")
    .replace(/\bs3:\/\/[^\s]+/giu, "[REDACTED_STORAGE]")
    .replace(
      /(?:file:\/\/)?\/Users\/[^/\s<>{}]+(?:\/[^\s]*)?/giu,
      "[REDACTED_PATH]",
    )
    .replace(
      /(?:file:\/\/)?\/home\/[^/\s<>{}]+(?:\/[^\s]*)?/giu,
      "[REDACTED_PATH]",
    )
    .replace(
      /(?:file:\/\/)?[A-Z]:\\Users\\[^\\\s<>{}]+(?:\\[^\s]*)?/giu,
      "[REDACTED_PATH]",
    )
    .replace(
      /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{12,}\b/gu,
      "[REDACTED_TOKEN]",
    )
    .replace(/\bAKIA[A-Z0-9]{16}\b/gu, "[REDACTED_TOKEN]")
    .replace(
      /\b(?:sk|rk)_(?:live|prod)_[A-Za-z0-9]{12,}\b/gu,
      "[REDACTED_TOKEN]",
    )
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/gu, "[REDACTED_TOKEN]")
    .replace(/\b[0-9a-f]{40,64}\b/giu, "[REDACTED_OBJECT]")
    .replace(
      /\b((?:[A-Za-z0-9]+[_-])*(?:password|passwd|token|secret|credential|api[_-]?key|private[_-]?key)(?:[_-][A-Za-z0-9]+)*)\b[ \t]*[:=][ \t]*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s]+)/giu,
      "$1=[REDACTED_CREDENTIAL]",
    )
    .replace(/\+?[0-9][0-9 ()-]{7,}[0-9]/gu, (candidate) => {
      const digitCount = candidate.replace(/\D/gu, "").length;
      return digitCount >= 10 && digitCount <= 15
        ? "[REDACTED_PHONE]"
        : candidate;
    })
    .replace(
      /\b(?:home|mailing)[ _-]?address[ \t]*[:=][ \t]*[^/\\\s]+/giu,
      "[REDACTED_ADDRESS]",
    )
    .replace(
      /\b(?:student|government|passport|tax|bank|account|card|medical|immigration)[ _-]?(?:id|identifier|number|record|document)[ \t]*[:=][ \t]*[^/\\\s]+/giu,
      "[REDACTED_IDENTIFIER]",
    );
}

export function exitForFindings(findings) {
  process.stdout.write(`${formatFindings(findings)}\n`);
  return findings.length === 0 ? 0 : 1;
}

export function isZeroOid(value) {
  return ZERO_OID.test(value);
}
