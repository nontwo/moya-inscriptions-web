import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const adminDirectory = path.join(root, "apps/admin");
const requireAdmin = createRequire(path.join(adminDirectory, "package.json"));
const payloadCLI = path.resolve(
  path.dirname(requireAdmin.resolve("payload")),
  "../bin.js",
);
const script: string = JSON.parse(
  readFileSync(path.join(adminDirectory, "package.json"), "utf8"),
).scripts["cms:legacy"];
const directory = mkdtempSync(path.join(tmpdir(), "moya-legacy-cli-"));
const source = path.join(directory, "synthetic-export.json");
const guard = path.join(directory, "no-network.cjs");
const networkMarker = path.join(directory, "network-attempted");
writeFileSync(
  guard,
  `const fs = require('node:fs');
const deny = () => { fs.writeFileSync(${JSON.stringify(networkMarker)}, 'blocked'); throw new Error('SYNTHETIC_NETWORK_FORBIDDEN'); };
const Socket = require('node:net').Socket;
const originalConnect = Socket.prototype.connect;
Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  // The official TypeScript loader uses a local Unix-domain IPC socket.
  if ((first && typeof first === 'object' && first.path && !first.port) ||
      (typeof first === 'string' && !/^\\d+$/.test(first)))
    return originalConnect.apply(this, args);
  return deny();
};
require('node:tls').connect = deny;
`,
  { mode: 0o600 },
);
const columns = [
  "dynasty",
  "date_text",
  "province",
  "prefecture",
  "county",
  "current_location",
  "current_custodian",
  "description",
  "script_style",
  "transcription",
  "historical_context",
  "scholarly_research",
];
const snapshot = {
  catalog_entries: [
    {
      catalog_id: "synthetic-cli-catalog",
      kind: "calligraphy",
      title: "合成 CLI 资料",
      summary: null,
      period_label: null,
      ...Object.fromEntries(
        columns.flatMap((field) => [
          [field, null],
          [`${field}_state`, "UNSUPPLIED"],
        ]),
      ),
    },
  ],
  catalog_import_sources: [
    {
      catalog_id: "synthetic-cli-catalog",
      source_id: "synthetic-cli-source",
      source_title: null,
      source_type_raw: null,
      source_url: null,
      source_note: null,
    },
  ],
  catalog_aliases: [],
  catalog_contributors: [],
  catalog_source_citations: [],
  catalog_source_citation_scopes: [],
  catalog_media: [],
};

const invoke = (input: unknown) => {
  writeFileSync(source, JSON.stringify(input), { mode: 0o600 });
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (/^(CMS_|PG|DATABASE_URL$|TEST_DATABASE_URL$)/.test(key))
      delete env[key];
  env.COREPACK_ENABLE_NETWORK = "0";
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --require ${JSON.stringify(guard)}`;
  const result = spawnSync(
    process.execPath,
    [
      payloadCLI,
      ...script.split(" ").slice(1),
      "--mode",
      "dry-run",
      "--source",
      source,
    ],
    {
      cwd: adminDirectory,
      env,
      encoding: "utf8",
      timeout: 10_000,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
    },
  );
  // Never expose package-manager output: it may contain a local input path.
  const reports = String(result.stdout)
    .split("\n")
    .flatMap((line) => {
      try {
        const parsed: unknown = JSON.parse(line);
        return parsed && typeof parsed === "object" && "status" in parsed
          ? [parsed]
          : [];
      } catch {
        return [];
      }
    });
  return {
    exit: result.status,
    report: reports.at(-1),
    attemptedNetwork: existsSync(networkMarker),
  };
};
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("official Payload migration CLI argument and lifetime boundary", () => {
  it("forwards the package command flags and waits for a legal offline dry-run", () => {
    expect(script.split(" ")[0]).toBe("payload");
    const result = invoke(snapshot);
    expect(result.exit).toBe(0);
    expect(result.report).toMatchObject({
      mode: "dry-run",
      status: "READY",
      counts: { catalogs: 1, sources: 1, media: 0 },
    });
    expect(result.attemptedNetwork).toBe(false);
  }, 25_000);

  it("keeps a blocked dry-run nonzero despite the Payload CLI exit wrapper", () => {
    const result = invoke({});
    expect(result.exit).not.toBe(0);
    expect(result.report).toMatchObject({ mode: "dry-run", status: "BLOCKED" });
    expect(result.attemptedNetwork).toBe(false);
  }, 25_000);
});
