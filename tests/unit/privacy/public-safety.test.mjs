import { Buffer } from "node:buffer";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  APPROVED_EMAIL,
  APPROVED_NAME,
  formatFindings,
  scanAnnotatedTag,
  scanBinaryMetadata,
  scanCommit,
  scanFilename,
  scanGithubEvent,
  scanFileBuffer,
  scanRange,
  scanStaged,
  scanText,
  validateGitIdentity,
} from "../../../scripts/privacy/public-safety-lib.mjs";

const temporaryDirectories = new Set();
const sourceRepositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const personalEmail = ["person", "school.example"].join("@");
const macPath = ["", "Users", "sample-owner", "private", "notes.txt"].join("/");
const linuxPath = ["", "home", "sample-owner", "private", "notes.txt"].join(
  "/",
);
const windowsPath = [
  "C:",
  "Users",
  "sample-owner",
  "private",
  "notes.txt",
].join("\\");

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

function runGit(repository, args, environment = {}) {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  }).trim();
}

function createRepository() {
  const repository = mkdtempSync(path.join(os.tmpdir(), "moya-privacy-test-"));
  temporaryDirectories.add(repository);
  runGit(repository, ["init", "-q"]);
  runGit(repository, ["config", "user.name", APPROVED_NAME]);
  runGit(repository, ["config", "user.email", APPROVED_EMAIL]);
  runGit(repository, ["config", "user.useConfigOnly", "true"]);
  writeFileSync(
    path.join(repository, "README.md"),
    "safe repository fixture\n",
  );
  runGit(repository, ["add", "README.md"]);
  runGit(repository, ["commit", "-q", "-m", "test: establish safe baseline"]);
  return repository;
}

function writeBoundary(repository, boundary) {
  const directory = path.join(repository, "docs", "governance", "privacy");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "legacy-public-ref-boundary.json"),
    `${JSON.stringify(boundary, null, 2)}\n`,
  );
}

function createCommit(
  repository,
  message,
  environment = {},
  content = "safe change\n",
) {
  writeFileSync(path.join(repository, "fixture.txt"), content);
  runGit(repository, ["add", "fixture.txt"]);
  runGit(repository, ["commit", "-q", "-m", message], environment);
  return runGit(repository, ["rev-parse", "HEAD"]);
}

function writeEvent(repository, event) {
  const filename = path.join(repository, "event.json");
  writeFileSync(filename, `${JSON.stringify(event)}\n`);
  return filename;
}

function pngWithText(keyword, value) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const data = Buffer.from(`${keyword}\0${value}`, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const type = Buffer.from("tEXt", "ascii");
  const checksum = Buffer.alloc(4);
  return Buffer.concat([signature, length, type, data, checksum]);
}

function storedZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [entryName, entryValue] of entries) {
    const name = Buffer.from(entryName, "utf8");
    const data = Buffer.from(entryValue, "utf8");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + data.length;
  }
  const local = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, end]);
}

describe("public privacy scanner", () => {
  it("accepts the approved Owner identity", () => {
    expect(validateGitIdentity(APPROVED_NAME, APPROVED_EMAIL)).toEqual([]);
  });

  it("accepts another matching GitHub ID-based noreply contributor", () => {
    expect(
      validateGitIdentity(
        "example",
        "12345678+example@users.noreply.github.com",
      ),
    ).toEqual([]);
  });

  it.each(["Codex", "ChatGPT", "OpenAI"])(
    "rejects an email-bearing AI Git identity named %s",
    (name) => {
      const handle = name.toLowerCase();
      expect(
        validateGitIdentity(
          name,
          `12345678+${handle}@users.noreply.github.com`,
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "email-bearing-ai-identity" }),
        ]),
      );
    },
  );

  it.each(["AUTHOR", "COMMITTER"])(
    "rejects an email-bearing AI %s identity in commit metadata",
    (role) => {
      const repository = createRepository();
      const environment = {
        [`GIT_${role}_EMAIL`]: "12345678+codex@users.noreply.github.com",
        [`GIT_${role}_NAME`]: "Codex",
      };
      const commit = createCommit(
        repository,
        "test: unsafe AI identity",
        environment,
      );
      expect(scanCommit(commit, { cwd: repository })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "email-bearing-ai-identity" }),
        ]),
      );
    },
  );

  it("rejects a personal Author email", () => {
    const repository = createRepository();
    const commit = createCommit(repository, "test: unsafe author", {
      GIT_AUTHOR_EMAIL: personalEmail,
      GIT_AUTHOR_NAME: "sample-owner",
    });
    expect(scanCommit(commit, { cwd: repository })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "unsafe-git-identity" }),
      ]),
    );
  });

  it("rejects a personal Committer email", () => {
    const repository = createRepository();
    const commit = createCommit(repository, "test: unsafe committer", {
      GIT_AUTHOR_EMAIL: APPROVED_EMAIL,
      GIT_AUTHOR_NAME: APPROVED_NAME,
      GIT_COMMITTER_EMAIL: personalEmail,
      GIT_COMMITTER_NAME: "sample-owner",
    });
    expect(scanCommit(commit, { cwd: repository })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "unsafe-git-identity" }),
      ]),
    );
  });

  it("rejects a personal email in Co-authored-by", () => {
    const repository = createRepository();
    const message = `test: unsafe trailer\n\nCo-authored-by: Sample <${personalEmail}>`;
    const commit = createCommit(repository, message);
    expect(scanCommit(commit, { cwd: repository })).not.toEqual([]);
  });

  it("rejects an email-bearing AI trailer", () => {
    const repository = createRepository();
    const email = ["codex", "example.invalid"].join("@");
    const message = `test: unsafe AI trailer\n\nCo-authored-by: Codex <${email}>`;
    const commit = createCommit(repository, message);
    expect(scanCommit(commit, { cwd: repository })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "email-bearing-ai-trailer" }),
      ]),
    );
  });

  it("accepts Assisted-by: Codex", () => {
    const repository = createRepository();
    const commit = createCommit(
      repository,
      "test: safe assistance trailer\n\nAssisted-by: Codex",
    );
    expect(scanCommit(commit, { cwd: repository })).toEqual([]);
  });

  it.each([macPath, linuxPath, windowsPath])(
    "rejects a personal absolute path",
    (unsafePath) => {
      expect(scanText(`source: ${unsafePath}`)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "personal-path" }),
        ]),
      );
    },
  );

  it("accepts reserved .invalid synthetic addresses and URLs", () => {
    expect(
      scanText(
        "contact: fixture@example.invalid\nurl: https://example.invalid/source",
      ),
    ).toEqual([]);
  });

  it("accepts a localhost disposable database configuration", () => {
    expect(
      scanText(
        "DATABASE_URL=postgresql://moya_test:moya_test_password@127.0.0.1:5432/moya_test",
      ),
    ).toEqual([]);
  });

  it("rejects a non-local production connection string", () => {
    const authority = ["db-user", "db-password", "db.internal"].join(":");
    const connection = ["postgresql", `//${authority}/catalog`].join(":");
    expect(scanText(connection)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "production-connection-string" }),
      ]),
    );
  });

  it("accepts environment references instead of credential literals", () => {
    expect(scanText("token = process.env.PUBLIC_API_TOKEN")).toEqual([]);
  });

  it("accepts empty environment placeholders", () => {
    expect(scanText(["API_KEY=", "PASSWORD=", "TOKEN="].join("\n"))).toEqual(
      [],
    );
  });

  it("rejects a private-key header", () => {
    const header = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    expect(scanText(header)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "private-key" }),
      ]),
    );
  });

  it("rejects an authenticated URL", () => {
    const authentication = ["password", "example.com/private"].join("@");
    const url = ["https://user", authentication].join(":");
    expect(scanText(url)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "authenticated-url" }),
      ]),
    );
  });

  it("rejects a likely real token assignment", () => {
    const likelyToken = ["actual", "credential", "material", "1234567890"].join(
      "_",
    );
    const assignment = ["token", `"${likelyToken}"`].join(" = ");
    expect(scanText(assignment)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "credential-assignment" }),
      ]),
    );
  });

  it("rejects a quoted credential whose prefix only looks synthetic", () => {
    const value = ["placeholder", "actual-secret-value"].join(" ");
    const assignment = ["password", `"${value}"`].join(" = ");
    expect(scanText(assignment)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "credential-assignment" }),
      ]),
    );
  });

  it("does not accept localhost as a credential substring", () => {
    const value = ["actual-secret", "localhost", "copy"].join("-");
    const assignment = ["token", value].join(" = ");
    expect(scanText(assignment)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "credential-assignment" }),
      ]),
    );
  });

  it("rejects token-only authenticated URLs", () => {
    const userinfo = ["private", "access", "material"].join("-");
    const url = [`https://${userinfo}`, "10.0.0.2/archive"].join("@");
    expect(scanText(url)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "authenticated-url" }),
      ]),
    );
  });

  it("rejects a remote database even when localhost appears in its query", () => {
    const connection = [
      "postgresql",
      "//archive:fixture@10.0.0.2/catalog?label=localhost",
    ].join(":");
    expect(scanText(connection)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "production-connection-string" }),
      ]),
    );
  });

  it("rejects explicitly private repository, export, storage, and certificate locators", () => {
    const gitlab = [
      "private repository: https://gitlab.com",
      "team",
      "data",
    ].join("/");
    const storage = ["private storage: s3:/", "archive-bucket", "source"].join(
      "/",
    );
    const certificate = ["-----BEGIN", "CERTIFICATE-----"].join(" ");
    const text = [
      gitlab,
      storage,
      ["private_export_path", "/srv/archive/export.xlsx"].join(": "),
      certificate,
    ].join("\n");
    expect(scanText(text)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "private-repository-locator" }),
        expect.objectContaining({ kind: "private-storage-locator" }),
        expect.objectContaining({ kind: "private-export-locator" }),
        expect.objectContaining({ kind: "certificate-material" }),
      ]),
    );
  });

  it("rejects a PR body containing a personal path", () => {
    const repository = createRepository();
    const eventPath = writeEvent(repository, {
      pull_request: { body: `artifact: ${macPath}`, title: "Safe title" },
    });
    expect(scanGithubEvent(eventPath, { cwd: repository })).not.toEqual([]);
  });

  it("rejects a PR body containing a personal email", () => {
    const repository = createRepository();
    const eventPath = writeEvent(repository, {
      pull_request: { body: `contact: ${personalEmail}`, title: "Safe title" },
    });
    expect(scanGithubEvent(eventPath, { cwd: repository })).not.toEqual([]);
  });

  it("accepts a safe PR body", () => {
    const repository = createRepository();
    const eventPath = writeEvent(repository, {
      pull_request: {
        body: "Scoped privacy guard update.",
        title: "Safe title",
      },
    });
    expect(scanGithubEvent(eventPath, { cwd: repository })).toEqual([]);
  });

  it("rejects a new annotated tag with a personal tagger email", () => {
    const repository = createRepository();
    runGit(repository, ["tag", "-a", "unsafe-tag", "-m", "test tag"], {
      GIT_COMMITTER_EMAIL: personalEmail,
      GIT_COMMITTER_NAME: "sample-owner",
    });
    const tagObject = runGit(repository, ["rev-parse", "unsafe-tag"]);
    expect(scanAnnotatedTag(tagObject, { cwd: repository })).not.toEqual([]);
  });

  it("does not retroactively reject a grandfathered annotated tag", () => {
    const repository = createRepository();
    runGit(repository, ["tag", "-a", "legacy-tag", "-m", "legacy tag"], {
      GIT_COMMITTER_EMAIL: personalEmail,
      GIT_COMMITTER_NAME: "sample-owner",
    });
    const tagObject = runGit(repository, ["rev-parse", "legacy-tag"]);
    const target = runGit(repository, ["rev-parse", "legacy-tag^{}"]);
    const legacyBoundary = {
      activePullRequests: [],
      annotatedTags: [
        {
          objectId: tagObject,
          peeledTarget: target,
          ref: "refs/tags/legacy-tag",
        },
      ],
      branchTips: {},
      policyVersion: 1,
    };
    writeBoundary(repository, legacyBoundary);
    expect(
      scanAnnotatedTag(tagObject, { cwd: repository, legacyBoundary }),
    ).toEqual([]);
  });

  it("scans a new commit on a legacy branch", () => {
    const repository = createRepository();
    const legacyTip = runGit(repository, ["rev-parse", "HEAD"]);
    const legacyBoundary = {
      activePullRequests: [],
      annotatedTags: [],
      branchTips: { "refs/heads/legacy": legacyTip },
      policyVersion: 1,
    };
    writeBoundary(repository, legacyBoundary);
    const newCommit = createCommit(repository, "test: new unsafe commit", {
      GIT_AUTHOR_EMAIL: personalEmail,
      GIT_AUTHOR_NAME: "sample-owner",
    });
    expect(
      scanRange(undefined, newCommit, { cwd: repository, legacyBoundary }),
    ).not.toEqual([]);
  });

  it("rejects any later modification of the frozen legacy boundary", () => {
    const repository = createRepository();
    writeBoundary(repository, {
      activePullRequests: [],
      annotatedTags: [],
      branchTips: {},
      policyVersion: 1,
    });
    runGit(repository, [
      "add",
      "docs/governance/privacy/legacy-public-ref-boundary.json",
    ]);
    runGit(repository, ["commit", "-q", "-m", "test: add legacy boundary"]);

    writeBoundary(repository, {
      activePullRequests: [],
      annotatedTags: [],
      branchTips: { "refs/heads/unsafe": "0".repeat(40) },
      policyVersion: 1,
    });
    runGit(repository, [
      "add",
      "docs/governance/privacy/legacy-public-ref-boundary.json",
    ]);
    expect(scanStaged({ cwd: repository })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "legacy-boundary-modification" }),
      ]),
    );
  });

  it("does not trust a branch-local boundary that self-declares unsafe history", () => {
    const repository = createRepository();
    const unsafeCommit = createCommit(repository, "test: unsafe old branch", {
      GIT_AUTHOR_EMAIL: personalEmail,
      GIT_AUTHOR_NAME: "sample-owner",
    });
    writeBoundary(repository, {
      activePullRequests: [],
      annotatedTags: [],
      branchTips: { "refs/heads/self-declared": unsafeCommit },
      policyVersion: 1,
    });
    runGit(repository, [
      "add",
      "docs/governance/privacy/legacy-public-ref-boundary.json",
    ]);
    runGit(repository, ["commit", "-q", "-m", "test: self-declare legacy"]);
    const head = runGit(repository, ["rev-parse", "HEAD"]);
    expect(scanRange(undefined, head, { cwd: repository })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "unsafe-git-identity" }),
        expect.objectContaining({ kind: "legacy-boundary-modification" }),
      ]),
    );
  });

  it("scans only added text when a safe edit touches accepted legacy text", () => {
    const repository = createRepository();
    writeFileSync(
      path.join(repository, "legacy.txt"),
      `accepted historical contact: ${personalEmail}\n`,
    );
    runGit(repository, ["add", "legacy.txt"]);
    runGit(repository, ["commit", "-q", "-m", "test: legacy text fixture"]);
    const base = runGit(repository, ["rev-parse", "HEAD"]);
    writeFileSync(
      path.join(repository, "legacy.txt"),
      `accepted historical contact: ${personalEmail}\nsafe clarification\n`,
    );
    runGit(repository, ["add", "legacy.txt"]);
    runGit(repository, ["commit", "-q", "-m", "test: safe clarification"]);
    const head = runGit(repository, ["rev-parse", "HEAD"]);
    expect(scanRange(base, head, { cwd: repository })).toEqual([]);
  });

  it("rejects a stale branch that reintroduces private provenance", () => {
    const repository = createRepository();
    const legacyTip = runGit(repository, ["rev-parse", "HEAD"]);
    const legacyBoundary = {
      activePullRequests: [],
      annotatedTags: [],
      branchTips: { "refs/heads/legacy": legacyTip },
      policyVersion: 1,
    };
    writeBoundary(repository, legacyBoundary);
    const locator = [
      "https://github.com",
      "private-lab",
      "research-archive",
    ].join("/");
    const newCommit = createCommit(
      repository,
      "test: reintroduce provenance",
      {},
      `Private source authority: ${locator}\n`,
    );
    expect(
      scanRange(legacyTip, newCommit, { cwd: repository, legacyBoundary }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "private-repository-locator" }),
      ]),
    );
  });

  it("rejects a filename containing an email", () => {
    expect(scanFilename(`reports/${personalEmail}.txt`)).not.toEqual([]);
  });

  it("redacts sensitive values from failure reports", () => {
    const report = formatFindings(scanText(`contact: ${personalEmail}`));
    expect(report).toContain("personal-email");
    expect(report).not.toContain(personalEmail);

    const filenameReport = formatFindings(
      scanFilename(`reports/${personalEmail}.txt`),
    );
    expect(filenameReport).not.toContain(personalEmail);

    const phone = ["+1", "415", "555", "0123"].join("-");
    const awsKey = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
    const slackToken = ["xoxb", "1234567890", "abcdefghijklmnop"].join("-");
    const privateObject = "a".repeat(40);
    for (const protectedValue of [phone, awsKey, slackToken, privateObject]) {
      const prefix =
        protectedValue === privateObject ? "private research " : "";
      const protectedReport = formatFindings(
        scanFilename(`reports/${prefix}${protectedValue}.txt`),
      );
      expect(protectedReport).not.toContain(protectedValue);
    }
  });

  it("reruns Public Safety when PR title or body metadata is edited", () => {
    const workflow = readFileSync(
      path.join(sourceRepositoryRoot, ".github/workflows/public-safety.yml"),
      "utf8",
    );
    expect(workflow).toMatch(/pull_request:\n\s+types:\s*\[[^\]]*edited/u);
  });

  it("rejects binary metadata containing a personal author or path", () => {
    const unsafeAuthorPng = pngWithText("Author", "sample-owner");
    const unsafePathPng = pngWithText("Source", macPath);
    expect(scanBinaryMetadata(unsafeAuthorPng, "artifact.png")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "personal-document-author" }),
      ]),
    );
    expect(scanBinaryMetadata(unsafePathPng, "artifact.png")).not.toEqual([]);
  });

  it("accepts clean image metadata", () => {
    const cleanPng = pngWithText("Description", "Public archive preview");
    expect(scanBinaryMetadata(cleanPng, "artifact.png")).toEqual([]);
  });

  it("routes text-like PDFs through metadata inspection", () => {
    const pdf = Buffer.from(
      ["%PDF-1.4", "/Author (sample-owner)", "%%EOF"].join("\n"),
      "ascii",
    );
    expect(scanFileBuffer(pdf, "artifact.pdf")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "personal-document-author" }),
      ]),
    );
  });

  it("inspects macro-enabled OOXML properties and active content", () => {
    const document = storedZip([
      [
        "docProps/core.xml",
        "<cp:coreProperties><dc:creator>sample-owner</dc:creator></cp:coreProperties>",
      ],
      ["word/vbaProject.bin", "macro fixture"],
    ]);
    expect(scanFileBuffer(document, "artifact.docm")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "personal-document-author" }),
        expect.objectContaining({ kind: "unexpected-active-content" }),
      ]),
    );
  });

  it("inspects OOXML contact metadata and external relationships", () => {
    const phone = ["+1", "415", "555", "0123"].join(" ");
    const document = storedZip([
      ["docProps/custom.xml", `<Property>phone: ${phone}</Property>`],
      [
        "word/_rels/document.xml.rels",
        '<Relationship TargetMode="External" Target="https://example.invalid/public"/>',
      ],
    ]);
    expect(scanFileBuffer(document, "artifact.docx")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "regulated-personal-data" }),
        expect.objectContaining({ kind: "external-document-relationship" }),
      ]),
    );
  });

  it("enforces ExifTool metadata output when enabled", () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "moya-exiftool-test-"),
    );
    temporaryDirectories.add(directory);
    const executable = path.join(directory, "exiftool");
    writeFileSync(
      executable,
      [
        "#!/bin/sh",
        'if [ "$1" = "-ver" ]; then',
        '  echo "13.0"',
        "else",
        '  echo \'[{"EXIF:OwnerName":"sample-owner"}]\'',
        "fi",
      ].join("\n"),
      { mode: 0o755 },
    );
    const previousFlag = process.env.MOYA_USE_EXIFTOOL;
    const previousPath = process.env.PATH;
    process.env.MOYA_USE_EXIFTOOL = "1";
    process.env.PATH = `${directory}${path.delimiter}${previousPath}`;
    try {
      expect(
        scanBinaryMetadata(pngWithText("Description", "safe"), "artifact.png"),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "personal-document-author" }),
        ]),
      );
    } finally {
      if (previousFlag === undefined) delete process.env.MOYA_USE_EXIFTOOL;
      else process.env.MOYA_USE_EXIFTOOL = previousFlag;
      process.env.PATH = previousPath;
    }
  });

  it("accepts a safe new-branch push event", () => {
    const repository = createRepository();
    const head = runGit(repository, ["rev-parse", "HEAD"]);
    const eventPath = writeEvent(repository, {
      after: head,
      before: "0".repeat(40),
      ref: "refs/heads/safe-branch",
    });
    expect(scanGithubEvent(eventPath, { cwd: repository })).toEqual([]);
  });

  it("rejects an unsafe new-tag event", () => {
    const repository = createRepository();
    runGit(repository, [
      "tag",
      "-a",
      "new-tag",
      "-m",
      `contact ${personalEmail}`,
    ]);
    const tagObject = runGit(repository, ["rev-parse", "new-tag"]);
    const eventPath = writeEvent(repository, {
      after: tagObject,
      before: "0".repeat(40),
      ref: "refs/tags/new-tag",
    });
    expect(scanGithubEvent(eventPath, { cwd: repository })).not.toEqual([]);
  });

  it("enforces all local hooks in a disposable repository", () => {
    const repository = createRepository();
    cpSync(
      path.join(sourceRepositoryRoot, ".githooks"),
      path.join(repository, ".githooks"),
      { recursive: true },
    );
    cpSync(
      path.join(sourceRepositoryRoot, "scripts"),
      path.join(repository, "scripts"),
      { recursive: true },
    );
    for (const hook of ["pre-commit", "commit-msg", "pre-push"]) {
      chmodSync(path.join(repository, ".githooks", hook), 0o755);
    }

    const setup = spawnSync(
      process.execPath,
      ["scripts/setup-safe-git-identity.mjs", "--verify-and-apply"],
      { cwd: repository, encoding: "utf8" },
    );
    expect(setup.status).toBe(0);

    writeFileSync(path.join(repository, "safe.txt"), "safe public content\n");
    runGit(repository, ["add", "safe.txt"]);
    const safeCommit = spawnSync(
      "git",
      ["commit", "-q", "-m", "test: safe hook commit"],
      { cwd: repository, encoding: "utf8" },
    );
    expect(safeCommit.status).toBe(0);

    const unsafeMessage = path.join(repository, "unsafe-message.txt");
    writeFileSync(unsafeMessage, `contact: ${personalEmail}\n`);
    const messageResult = spawnSync(
      path.join(repository, ".githooks", "commit-msg"),
      [unsafeMessage],
      { cwd: repository, encoding: "utf8" },
    );
    expect(messageResult.status).toBe(1);
    expect(messageResult.stdout).not.toContain(personalEmail);

    writeFileSync(path.join(repository, "unsafe.txt"), `source: ${macPath}\n`);
    runGit(repository, ["add", "unsafe.txt"]);
    const preCommit = spawnSync(
      path.join(repository, ".githooks", "pre-commit"),
      [],
      { cwd: repository, encoding: "utf8" },
    );
    expect(preCommit.status).toBe(1);
    expect(preCommit.stdout).not.toContain(macPath);

    runGit(repository, [
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-q",
      "-m",
      "test: unsafe bypass fixture",
    ]);
    const unsafeHead = runGit(repository, ["rev-parse", "HEAD"]);
    const prePush = spawnSync(
      path.join(repository, ".githooks", "pre-push"),
      [],
      {
        cwd: repository,
        encoding: "utf8",
        input: `refs/heads/test ${unsafeHead} refs/heads/test ${"0".repeat(40)}\n`,
      },
    );
    expect(prePush.status).toBe(1);
    expect(prePush.stdout).not.toContain(macPath);
  });
});
