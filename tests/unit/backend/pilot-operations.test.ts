import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  assertPilotApproval,
  assertPilotDatabase,
  createPilotPool,
  parsePilotScope,
  pilotScopeSha256,
  pilotSha256,
  readPilotMedia,
  readPilotPhoto,
} from "@moya/catalog-importer";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  PilotApprovalDocument,
  PilotMedia,
  PilotScope,
} from "@moya/catalog-importer";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const fixtureDirectory = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pilot-unit-synthetic-"));
  directories.push(directory);
  return directory;
};

const fixtureScope = (): PilotScope => ({
  purpose: "LOCAL_NON_PRODUCTION_PILOT",
  operationId: "synthetic-pilot-operation",
  target: {
    host: "127.0.0.1",
    port: 5432,
    database: "synthetic_pilot",
    user: "synthetic_user",
    databaseOid: "123456",
    serverAddress: "127.0.0.1",
    serverPort: 5432,
    versionNum: "170000",
    systemIdentifier: "1234567890123456789",
  },
  catalogs: [8, 8, 4].map((mediaCount, index) => ({
    catalogImportId: `synthetic-item-${index}`,
    sourceId: `synthetic-source-${index}`,
    mediaCount,
  })),
  mediaManifestSha256: "a".repeat(64),
  cos: {
    bucket: "synthetic-pilot-123456",
    region: "ap-test",
    mediaOrigin: "https://synthetic-media.invalid",
  },
});

const fixtureApproval = (scope: PilotScope): PilotApprovalDocument => ({
  purpose: "PERSISTENT_NON_PRODUCTION_PILOT",
  nonProduction: true,
  publicationApproval: false,
  ownerInstructionReference: "synthetic test authority; no real operation",
  operationId: scope.operationId,
  targetScopeSha256: pilotScopeSha256(scope),
  mediaManifestSha256: scope.mediaManifestSha256,
  approval: {
    importContractVersion: "catalog-import/v2",
    canonicalInputSha256: "b".repeat(64),
    dryRunResultSha256: "c".repeat(64),
    state: "APPROVED",
    approvedFindingIds: [],
    decidedBy: "synthetic test fixture",
    decidedAt: "2026-01-01T00:00:00.000Z",
  },
});

// Synthetic canvas container used only for byte/hash/path boundary checks.
const photoBytes = (): Buffer => {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WEBPVP8X", 8);
  bytes.writeUInt32LE(10, 16);
  return bytes;
};

const fixtureRows = (): PilotMedia[] => {
  let number = 0;
  return fixtureScope().catalogs.flatMap((catalog, group) =>
    Array.from({ length: catalog.mediaCount }, (_, position) => {
      const mediaId = `media_${(++number).toString(16).padStart(32, "0")}`;
      const sha256 = pilotSha256(photoBytes());
      return {
        catalogImportId: catalog.catalogImportId,
        sourceId: catalog.sourceId,
        mediaId,
        objectKey: `display/v1/${mediaId}/${sha256}.webp`,
        relativePath: `synthetic-${number}.webp`,
        sha256,
        sizeBytes: photoBytes().length,
        width: 1,
        height: 1,
        position,
        isRepresentative: position === (group === 2 ? 2 : 0),
        altText: `Synthetic fixture ${number}`,
        orderConfidence: group === 2 ? "LOW" : "HIGH",
      };
    }),
  );
};

const writeManifest = async (rows: readonly PilotMedia[]) => {
  const directory = await fixtureDirectory();
  const file = path.join(directory, "synthetic-manifest.json");
  const bytes = JSON.stringify({ rows });
  await writeFile(file, bytes);
  const scope = { ...fixtureScope(), mediaManifestSha256: pilotSha256(bytes) };
  return { directory, file, scope };
};

describe("persistent non-production Pilot authority", () => {
  it("rejects Production intent, incomplete identities and altered allocation", () => {
    expect(parsePilotScope(fixtureScope())).toEqual(fixtureScope());
    expect(() =>
      parsePilotScope({ ...fixtureScope(), purpose: "PRODUCTION" }),
    ).toThrow();
    expect(() =>
      parsePilotScope({ ...fixtureScope(), operationId: "../operation" }),
    ).toThrow();
    expect(() =>
      parsePilotScope({
        ...fixtureScope(),
        target: { ...fixtureScope().target, databaseOid: "" },
      }),
    ).toThrow();
    expect(() =>
      parsePilotScope({
        ...fixtureScope(),
        catalogs: fixtureScope().catalogs.slice(1),
      }),
    ).toThrow();
    expect(() =>
      parsePilotScope({
        ...fixtureScope(),
        catalogs: fixtureScope().catalogs.map((row) => ({
          ...row,
          mediaCount: 7,
        })),
      }),
    ).toThrow();
  });

  it.each([
    "postgresql://synthetic_user@other.invalid:5432/synthetic_pilot",
    "postgresql://synthetic_user@127.0.0.1:5433/synthetic_pilot",
    "postgresql://synthetic_user@127.0.0.1:5432/other_database",
    "postgresql://other_user@127.0.0.1:5432/synthetic_pilot",
    "postgresql://synthetic_user@127.0.0.1:5432/synthetic_pilot?options=-c%20search_path%3Dother",
    "postgresql://synthetic_user@127.0.0.1:5432/synthetic_pilot?host=other.invalid",
    "postgresql://synthetic_user@127.0.0.1:5432/synthetic_pilot?port=6543",
    "postgresql://synthetic_user@127.0.0.1:5432/synthetic_pilot?user=other_user",
  ])("rejects an unapproved endpoint before any connection: %s", (url) => {
    expect(typeof createPilotPool).toBe("function");
    expect(() => createPilotPool(url, fixtureScope())).toThrow();
  });

  it("requires verify-full for a remote target even with matching endpoint labels", () => {
    const scope: PilotScope = {
      ...fixtureScope(),
      purpose: "REMOTE_NON_PRODUCTION_PILOT",
      target: { ...fixtureScope().target, host: "synthetic.invalid" },
    };
    expect(() =>
      createPilotPool(
        "postgresql://synthetic_user@synthetic.invalid/synthetic_pilot?sslmode=require",
        scope,
      ),
    ).toThrow(/TLS/);
  });

  it.each([
    "sslmode=verify-full&sslmode=require",
    "sslmode=verify-full&host=other.invalid",
    "sslmode=verify-full&user=other_user",
    "sslmode=verify-full&port=6543",
    "sslmode=verify-full&options=-c%20search_path%3Dother",
    "sslmode=verify-full&sslrootcert=one&sslrootcert=two",
  ])("rejects ambiguous remote connection query overrides: %s", (query) => {
    const scope: PilotScope = {
      ...fixtureScope(),
      purpose: "REMOTE_NON_PRODUCTION_PILOT",
      target: { ...fixtureScope().target, host: "synthetic.invalid" },
    };
    expect(typeof createPilotPool).toBe("function");
    expect(() =>
      createPilotPool(
        `postgresql://synthetic_user@synthetic.invalid/synthetic_pilot?${query}`,
        scope,
      ),
    ).toThrow();
  });

  it.each([
    "database",
    "user",
    "databaseOid",
    "serverAddress",
    "serverPort",
    "versionNum",
    "schema",
  ])(
    "checks actual server %s instead of trusting endpoint names",
    async (field) => {
      const scope = fixtureScope();
      const query = vi.fn().mockResolvedValue({
        rows: [{ ...scope.target, schema: "public", [field]: "different" }],
      });
      await expect(
        assertPilotDatabase(
          { query } as unknown as Parameters<typeof assertPilotDatabase>[0],
          scope,
        ),
      ).rejects.toThrow();
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects a restored or replaced instance with a different system identifier", async () => {
    const scope = fixtureScope();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ ...scope.target, schema: "public" }] })
      .mockResolvedValueOnce({ rows: [{ id: "9999999999999999999" }] });
    await expect(
      assertPilotDatabase(
        { query } as unknown as Parameters<typeof assertPilotDatabase>[0],
        scope,
      ),
    ).rejects.toThrow(/system identity/);
  });

  it("binds approval to the operation, target, media bytes and non-publication status", () => {
    const scope = fixtureScope();
    const approval = fixtureApproval(scope);
    expect(assertPilotApproval(scope, approval)).toMatchObject({
      state: "APPROVED",
    });
    for (const changed of [
      { ...approval, operationId: "different-operation" },
      { ...approval, targetScopeSha256: "0".repeat(64) },
      { ...approval, mediaManifestSha256: "0".repeat(64) },
      { ...approval, publicationApproval: true },
      { ...approval, ownerInstructionReference: " " },
    ]) {
      expect(() =>
        assertPilotApproval(scope, changed as PilotApprovalDocument),
      ).toThrow();
    }
    expect(() =>
      assertPilotApproval(
        { ...scope, target: { ...scope.target, databaseOid: "999999" } },
        approval,
      ),
    ).toThrow();
    expect(() =>
      assertPilotApproval(
        { ...scope, cos: { ...scope.cos, bucket: "other-synthetic-123456" } },
        approval,
      ),
    ).toThrow();
  });
});

describe("frozen Pilot media inputs", () => {
  it("retains all twenty identities and the provisional third-catalog representative", async () => {
    const rows = fixtureRows();
    const fixture = await writeManifest(rows);
    const actual = await readPilotMedia(fixture.file, fixture.scope);
    expect(actual).toEqual(rows);
    expect(
      actual
        .slice(16)
        .map((row) => [
          row.position,
          row.isRepresentative,
          row.orderConfidence,
        ]),
    ).toEqual([
      [0, false, "LOW"],
      [1, false, "LOW"],
      [2, true, "LOW"],
      [3, false, "LOW"],
    ]);
  });

  it.each([
    [
      "duplicate identity",
      (rows: PilotMedia[]) => [rows[0]!, ...rows.slice(0, 19)],
    ],
    ["missing row", (rows: PilotMedia[]) => rows.slice(1)],
    [
      "wrong source",
      (rows: PilotMedia[]) => [
        { ...rows[0]!, sourceId: "unrelated-source" },
        ...rows.slice(1),
      ],
    ],
    [
      "duplicate position",
      (rows: PilotMedia[]) => [{ ...rows[0]!, position: 1 }, ...rows.slice(1)],
    ],
    [
      "missing representative",
      (rows: PilotMedia[]) => [
        { ...rows[0]!, isRepresentative: false },
        ...rows.slice(1),
      ],
    ],
    [
      "key/hash mismatch",
      (rows: PilotMedia[]) => [
        { ...rows[0]!, sha256: "f".repeat(64) },
        ...rows.slice(1),
      ],
    ],
    [
      "path escape",
      (rows: PilotMedia[]) => [
        { ...rows[0]!, relativePath: "../outside.webp" },
        ...rows.slice(1),
      ],
    ],
    [
      "Windows path escape",
      (rows: PilotMedia[]) => [
        { ...rows[0]!, relativePath: "..\\outside.webp" },
        ...rows.slice(1),
      ],
    ],
    [
      "absolute path",
      (rows: PilotMedia[]) => [
        { ...rows[0]!, relativePath: "/outside.webp" },
        ...rows.slice(1),
      ],
    ],
  ] as const)(
    "rejects %s even if its changed manifest has a freshly supplied hash",
    async (_name, mutate) => {
      const fixture = await writeManifest(mutate(fixtureRows()));
      await expect(
        readPilotMedia(fixture.file, fixture.scope),
      ).rejects.toThrow();
    },
  );

  it("rejects changed frozen position or alt text against the approved manifest hash", async () => {
    const rows = fixtureRows();
    const fixture = await writeManifest(rows);
    await writeFile(
      fixture.file,
      JSON.stringify({
        rows: [{ ...rows[0]!, altText: "changed" }, ...rows.slice(1)],
      }),
    );
    await expect(readPilotMedia(fixture.file, fixture.scope)).rejects.toThrow(
      /manifest changed/,
    );
  });

  it("checks actual photo bytes and rejects a symlink outside the selected root", async () => {
    const row = fixtureRows()[0]!;
    const directory = await fixtureDirectory();
    const root = path.join(directory, "selected");
    await mkdir(root);
    const outside = path.join(directory, "outside.webp");
    await writeFile(outside, photoBytes());
    await symlink(outside, path.join(root, row.relativePath));
    await expect(readPilotPhoto(root, row)).rejects.toThrow(/escapes/);
  });

  it("rejects changed content even when the file size is unchanged", async () => {
    const row = fixtureRows()[0]!;
    const root = await fixtureDirectory();
    const changed = photoBytes();
    changed[29] = 1;
    await writeFile(path.join(root, row.relativePath), changed);
    await expect(readPilotPhoto(root, row)).rejects.toThrow(/content changed/);
  });

  it("rejects a declared canvas size that disagrees with the actual WebP dimensions", async () => {
    const row = fixtureRows()[0]!;
    const root = await fixtureDirectory();
    await writeFile(path.join(root, row.relativePath), photoBytes());
    await expect(readPilotPhoto(root, { ...row, width: 2 })).rejects.toThrow(
      /dimension|canvas/i,
    );
  });
});
