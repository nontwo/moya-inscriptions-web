import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { versionedImportApprovalSchema } from "@moya/contracts/internal/catalog-import";
import { Pool } from "pg";

import {
  applyCatalogImport,
  createCatalogImportDryRun,
  hashApproval,
  parseCatalogImportCsvBundle,
} from "./index.js";
import type {
  CatalogIdAllocator,
  CatalogImportApplicationResult,
} from "./index.js";
import type { PoolClient } from "pg";

/** Internal operational scope. This is neither a Public DTO nor publication authority. */
export interface PilotScope {
  readonly purpose:
    "LOCAL_NON_PRODUCTION_PILOT" | "REMOTE_NON_PRODUCTION_PILOT";
  readonly operationId: string;
  readonly target: {
    readonly host: string;
    readonly port: number;
    readonly database: string;
    readonly user: string;
    readonly databaseOid: string;
    readonly serverAddress: string;
    readonly serverPort: number;
    readonly versionNum: string;
    readonly systemIdentifier?: string;
  };
  readonly catalogs: readonly {
    readonly catalogImportId: string;
    readonly sourceId: string;
    readonly mediaCount: number;
  }[];
  readonly mediaManifestSha256: string;
  readonly cos: {
    readonly bucket: string;
    readonly region: string;
    readonly mediaOrigin: string;
  };
}

export interface PilotMedia {
  readonly catalogImportId: string;
  readonly sourceId: string;
  readonly mediaId: string;
  readonly objectKey: string;
  readonly relativePath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  readonly position: number;
  readonly isRepresentative: boolean;
  readonly altText: string;
  readonly orderConfidence: "HIGH" | "LOW";
}

export interface PilotMediaTransport {
  ensureObject(
    objectKey: string,
    bytes: Buffer,
  ): Promise<{
    readonly objectKey: string;
    readonly sha256: string;
    readonly sizeBytes: number;
    readonly outcome: "uploaded" | "reused";
    readonly verifiedAt: string;
  }>;
}

export const pilotSha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
const digest = (value: unknown): string => {
  const stable = (item: unknown): string => {
    if (item === null || typeof item !== "object") return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(stable).join(",")}]`;
    return `{${Object.entries(item)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  };
  return pilotSha256(stable(value));
};
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim() === value && value.length > 0;
const sha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export const parsePilotScope = (input: unknown): PilotScope => {
  const scope = input as PilotScope;
  assert(
    scope &&
      ["LOCAL_NON_PRODUCTION_PILOT", "REMOTE_NON_PRODUCTION_PILOT"].includes(
        scope.purpose,
      ),
    "Explicit non-production Pilot purpose required",
  );
  assert(
    nonempty(scope.operationId) &&
      /^[a-zA-Z0-9._-]{1,120}$/.test(scope.operationId),
    "Invalid Pilot operation ID",
  );
  assert(
    scope.target &&
      [
        scope.target.host,
        scope.target.database,
        scope.target.user,
        scope.target.databaseOid,
        scope.target.serverAddress,
        scope.target.versionNum,
      ].every(nonempty),
    "Incomplete actual database identity",
  );
  assert(
    Number.isInteger(scope.target.port) &&
      scope.target.port > 0 &&
      scope.target.port <= 65535,
    "Invalid target port",
  );
  assert(
    Number.isInteger(scope.target.serverPort) && scope.target.serverPort > 0,
    "Invalid actual server port",
  );
  assert(
    scope.target.systemIdentifier === undefined ||
      /^\d+$/.test(scope.target.systemIdentifier),
    "Invalid system identifier",
  );
  assert(
    Array.isArray(scope.catalogs) && scope.catalogs.length === 3,
    "Pilot scope requires exactly three Catalogs",
  );
  assert(
    new Set(scope.catalogs.map((r) => r.sourceId)).size === 3 &&
      new Set(scope.catalogs.map((r) => r.catalogImportId)).size === 3,
    "Duplicate Catalog identity",
  );
  assert(
    scope.catalogs.every(
      (r) => nonempty(r.sourceId) && nonempty(r.catalogImportId),
    ),
    "Incomplete Catalog identity",
  );
  assert(
    scope.catalogs
      .map((r) => r.mediaCount)
      .sort((a, b) => a - b)
      .join(",") === "4,8,8",
    "Pilot media allocation must be 8+8+4",
  );
  assert(
    sha(scope.mediaManifestSha256),
    "Exact media working-manifest hash required",
  );
  assert(
    scope.cos &&
      /^[a-z0-9][a-z0-9-]+-[0-9]{5,20}$/.test(scope.cos.bucket) &&
      /^[a-z]{2}-[a-z]+(?:-[a-z]+)?$/.test(scope.cos.region),
    "Exact COS target required",
  );
  const mediaOrigin = new URL(scope.cos.mediaOrigin);
  assert(
    mediaOrigin.protocol === "https:" &&
      mediaOrigin.origin === scope.cos.mediaOrigin &&
      !mediaOrigin.username &&
      !mediaOrigin.password,
    "Exact HTTPS media origin required",
  );
  return scope;
};

export const pilotScopeSha256 = (scope: PilotScope): string =>
  digest(parsePilotScope(scope));

export const readPilotMedia = async (
  file: string,
  scope: PilotScope,
): Promise<readonly PilotMedia[]> => {
  const bytes = await readFile(file);
  assert(
    pilotSha256(bytes) === scope.mediaManifestSha256,
    "Media manifest changed since scope approval",
  );
  const document = JSON.parse(bytes.toString("utf8")) as { rows: PilotMedia[] };
  const rows = document.rows;
  assert(
    Array.isArray(rows) && rows.length === 20,
    "Pilot requires exactly 20 media rows",
  );
  assert(
    new Set(rows.map((r) => r.mediaId)).size === 20 &&
      new Set(rows.map((r) => r.objectKey)).size === 20,
    "Duplicate frozen media identity",
  );
  for (const row of rows) {
    assert(
      /^media_[a-f0-9]{32}$/.test(row.mediaId) && sha(row.sha256),
      "Invalid existing media binding",
    );
    assert(
      row.objectKey === `display/v1/${row.mediaId}/${row.sha256}.webp`,
      "Frozen objectKey does not match identity/hash",
    );
    assert(
      nonempty(row.relativePath) &&
        !path.isAbsolute(row.relativePath) &&
        !row.relativePath.split(/[\\/]/).includes(".."),
      "Unsafe selected photo path",
    );
    assert(
      [row.width, row.height, row.sizeBytes].every(
        (v) => Number.isSafeInteger(v) && v > 0,
      ) && row.sizeBytes <= 32 * 1024 * 1024,
      "Invalid media dimensions or size",
    );
    assert(
      nonempty(row.altText) &&
        row.altText.length <= 2000 &&
        ["HIGH", "LOW"].includes(row.orderConfidence),
      "Missing original media metadata",
    );
    assert(
      typeof row.isRepresentative === "boolean" &&
        Number.isInteger(row.position) &&
        row.position >= 0,
      "Invalid frozen media order",
    );
    assert(
      scope.catalogs.some(
        (c) =>
          c.catalogImportId === row.catalogImportId &&
          c.sourceId === row.sourceId,
      ),
      "Media belongs to a different Catalog",
    );
  }
  for (const catalog of scope.catalogs) {
    const group = rows
      .filter((r) => r.sourceId === catalog.sourceId)
      .sort((a, b) => a.position - b.position);
    assert(
      group.length === catalog.mediaCount &&
        group.every((r, i) => r.position === i),
      "Frozen media allocation/order mismatch",
    );
    assert(
      group.filter((r) => r.isRepresentative).length === 1,
      "Exactly one representative per Catalog required",
    );
  }
  return rows;
};

export const readPilotPhoto = async (
  root: string,
  row: PilotMedia,
): Promise<Buffer> => {
  const canonicalRoot = await realpath(root);
  const file = await realpath(path.resolve(canonicalRoot, row.relativePath));
  assert(
    file.startsWith(canonicalRoot + path.sep),
    "Selected photo escapes its explicit root",
  );
  const metadata = await stat(file);
  assert(
    metadata.isFile() && metadata.size === row.sizeBytes,
    "Selected photo size changed",
  );
  const bytes = await readFile(file);
  assert(
    bytes.length === row.sizeBytes && pilotSha256(bytes) === row.sha256,
    "Selected photo content changed",
  );
  assert(
    bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP",
    "Selected photo is not WebP",
  );
  const dimensions = webpDimensions(bytes);
  assert(
    dimensions.width === row.width && dimensions.height === row.height,
    "Selected photo dimensions do not match frozen manifest",
  );
  return bytes;
};

export const webpDimensions = (
  bytes: Buffer,
): { width: number; height: number } => {
  assert(
    bytes.length >= 20 &&
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP" &&
      bytes.readUInt32LE(4) + 8 === bytes.length,
    "Invalid WebP container",
  );
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const tag = bytes.subarray(offset, offset + 4).toString();
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    assert(start + size <= bytes.length, "Truncated WebP chunk");
    if (tag === "VP8X" && size >= 10)
      return {
        width: bytes.readUIntLE(start + 4, 3) + 1,
        height: bytes.readUIntLE(start + 7, 3) + 1,
      };
    if (
      tag === "VP8 " &&
      size >= 10 &&
      bytes
        .subarray(start + 3, start + 6)
        .equals(Buffer.from([0x9d, 0x01, 0x2a]))
    )
      return {
        width: bytes.readUInt16LE(start + 6) & 0x3fff,
        height: bytes.readUInt16LE(start + 8) & 0x3fff,
      };
    if (tag === "VP8L" && size >= 5 && bytes[start] === 0x2f) {
      const bits = bytes.readUInt32LE(start + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    offset = start + size + (size % 2);
  }
  throw new Error("WebP dimensions unavailable");
};

/** Query only after the explicit connection endpoint has matched the supplied scope. */
export const assertPilotDatabase = async (
  client: PoolClient,
  scope: PilotScope,
): Promise<void> => {
  const { rows } =
    await client.query(`SELECT current_database() AS database, current_user AS "user",
    (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS "databaseOid",
    inet_server_addr()::text AS "serverAddress", inet_server_port() AS "serverPort",
    current_setting('server_version_num') AS "versionNum", current_schema() AS schema`);
  const actual = rows[0];
  for (const field of [
    "database",
    "user",
    "databaseOid",
    "serverAddress",
    "serverPort",
    "versionNum",
  ] as const) {
    assert(
      actual[field] === scope.target[field],
      `Pilot database identity mismatch: ${field}`,
    );
  }
  assert(
    actual.schema === "public",
    "Pilot requires its dedicated database public schema",
  );
  if (scope.target.systemIdentifier !== undefined) {
    const system = await client.query(
      "SELECT system_identifier::text AS id FROM pg_control_system()",
    );
    assert(
      system.rows[0].id === scope.target.systemIdentifier,
      "Pilot database system identity mismatch",
    );
  }
};

export const createPilotPool = (
  connectionString: string,
  input: PilotScope,
): Pool => {
  const scope = parsePilotScope(input);
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Invalid Pilot PostgreSQL connection URL");
  }
  assert(
    ["postgres:", "postgresql:"].includes(url.protocol),
    "PostgreSQL connection required",
  );
  assert(!url.hash, "Pilot connection must not contain a URL fragment");
  assert(
    url.hostname === scope.target.host &&
      Number(url.port || 5432) === scope.target.port &&
      decodeURIComponent(url.pathname.slice(1)) === scope.target.database &&
      decodeURIComponent(url.username) === scope.target.user,
    "Connection does not match explicit Pilot endpoint",
  );
  // pg-connection-string gives query host/user/port precedence over the URI,
  // and takes the last duplicate value. Validate exactly what will reach pg.
  const parameterNames = new Set<string>();
  for (const [name, value] of url.searchParams) {
    assert(
      ["sslmode", "sslrootcert"].includes(name),
      "Pilot connection query cannot override its target or server options",
    );
    assert(!parameterNames.has(name), "Duplicate Pilot connection parameter");
    assert(nonempty(value), "Empty Pilot TLS parameter");
    parameterNames.add(name);
  }
  const sslmode = url.searchParams.get("sslmode");
  assert(
    sslmode === null || sslmode === "verify-full" || sslmode === "disable",
    "Unsupported Pilot TLS mode",
  );
  assert(
    !url.searchParams.has("sslrootcert") || sslmode === "verify-full",
    "Pilot CA certificate requires verified TLS",
  );
  if (scope.purpose === "REMOTE_NON_PRODUCTION_PILOT") {
    assert(
      sslmode === "verify-full",
      "Remote Pilot requires verified database TLS",
    );
  } else {
    assert(
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
      "Local Pilot must use loopback",
    );
  }
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
    max: 4,
  });
  pool.on("error", () => {
    console.error("[pilot] database connection unavailable");
  });
  return guardPilotPool(pool, scope);
};

const guardPilotPool = (pool: Pool, scope: PilotScope): Pool => {
  const connect = async () => {
    const client = await pool.connect();
    try {
      await assertPilotDatabase(client, scope);
      return client;
    } catch (error) {
      client.release(true);
      throw error;
    }
  };
  // Every checked-out connection is verified, including apply's transaction and replay.
  return new Proxy(pool, {
    get(target, property) {
      if (property === "connect") return connect;
      if (property === "query")
        return async (text: string, values?: unknown[]) => {
          const client = await connect();
          try {
            return await client.query(text, values);
          } finally {
            client.release();
          }
        };
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
};

const parseBundle = async (directory: string, scope: PilotScope) => {
  const parsed = await parseCatalogImportCsvBundle(directory);
  assert(
    parsed.envelope.importContractVersion === "catalog-import/v2",
    "Persistent Pilot accepts v2 only",
  );
  assert(
    parsed.envelope.catalogRows.length === 3 &&
      parsed.envelope.catalogRows.every(
        (r) =>
          r.catalogId === undefined &&
          scope.catalogs.some(
            (c) =>
              c.catalogImportId === r.catalogImportId &&
              c.sourceId === r.sourceId,
          ),
      ),
    "Pilot input must match the three frozen create identities",
  );
  return parsed;
};

export const preparePilotImport = async (
  pool: Pool,
  directory: string,
  scope: PilotScope,
) => {
  const parsed = await parseBundle(directory, scope);
  const client = await pool.connect();
  try {
    await assertPilotDatabase(client, scope);
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const dryRun = await createCatalogImportDryRun(
      client,
      parsed,
      new Date().toISOString(),
    );
    await client.query("ROLLBACK");
    return {
      operationId: scope.operationId,
      targetScopeSha256: pilotScopeSha256(scope),
      mediaManifestSha256: scope.mediaManifestSha256,
      publicationApproval: false,
      canonicalInputSha256: parsed.canonicalInputSha256,
      dryRun,
    };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
};

export interface PilotApprovalDocument {
  readonly purpose: "PERSISTENT_NON_PRODUCTION_PILOT";
  readonly nonProduction: true;
  readonly publicationApproval: false;
  readonly ownerInstructionReference: string;
  readonly operationId: string;
  readonly targetScopeSha256: string;
  readonly mediaManifestSha256: string;
  readonly approval: unknown;
}

export const assertPilotApproval = (
  scope: PilotScope,
  document: PilotApprovalDocument,
) => {
  assert(
    document.purpose === "PERSISTENT_NON_PRODUCTION_PILOT" &&
      document.nonProduction === true &&
      document.publicationApproval === false,
    "Explicit non-production write authority required",
  );
  assert(
    nonempty(document.ownerInstructionReference),
    "Actual Owner instruction reference required",
  );
  assert(
    document.operationId === scope.operationId &&
      document.targetScopeSha256 === pilotScopeSha256(scope) &&
      document.mediaManifestSha256 === scope.mediaManifestSha256,
    "Approval does not bind this operation, target and media manifest",
  );
  const approval = versionedImportApprovalSchema.parse(document.approval);
  assert(
    approval.state === "APPROVED" &&
      approval.importContractVersion === "catalog-import/v2",
    "Exact v2 approval required",
  );
  return approval;
};

export const applyPilotImport = async (
  pool: Pool,
  directory: string,
  scope: PilotScope,
  dryRun: Awaited<ReturnType<typeof preparePilotImport>>["dryRun"],
  document: PilotApprovalDocument,
  catalogIdAllocator: CatalogIdAllocator,
) => {
  const approval = assertPilotApproval(scope, document);
  const parsed = await parseBundle(directory, scope);
  return applyCatalogImport(guardPilotPool(pool, scope), {
    operationId: scope.operationId,
    parsed,
    dryRun,
    appliedAt: new Date().toISOString(),
    catalogIdAllocator,
    authorization: {
      runtime: "PILOT",
      purpose: "PERSISTENT_NON_PRODUCTION_PILOT",
      nonProduction: true,
      publicationApproval: false,
      ownerInstructionReference: document.ownerInstructionReference,
      targetScopeSha256: pilotScopeSha256(scope),
      approval,
    },
  });
};

const mediaRegistration = (row: PilotMedia, catalogId: string) => ({
  media_id: row.mediaId,
  catalog_id: catalogId,
  position: row.position,
  is_representative: row.isRepresentative,
  kind: "image",
  alt_text: row.altText,
  width: row.width,
  height: row.height,
  object_key: row.objectKey,
});

class PilotMediaRegistrationConflict extends Error {
  constructor() {
    super("Existing Pilot media conflicts with frozen scope");
  }
}

const assertExistingPilotMedia = async (
  client: PoolClient,
  expected: ReadonlyMap<string, ReturnType<typeof mediaRegistration>>,
  lock: boolean,
) => {
  const registrations = [...expected.values()];
  const existing = await client.query(
    `SELECT media_id,catalog_id,position,is_representative,kind,alt_text,width,height,object_key
     FROM catalog_media WHERE catalog_id=ANY($1::text[]) OR media_id=ANY($2::text[]) OR object_key=ANY($3::text[])
     ORDER BY media_id${lock ? " FOR UPDATE" : ""}`,
    [
      [...new Set(registrations.map((row) => row.catalog_id))],
      [...expected.keys()],
      registrations.map((row) => row.object_key),
    ],
  );
  for (const row of existing.rows) {
    const binding = expected.get(row.media_id);
    if (binding === undefined || digest(row) !== digest(binding)) {
      throw new PilotMediaRegistrationConflict();
    }
  }
};

export const syncPilotMedia = async (input: {
  pool: Pool;
  scope: PilotScope;
  approval: PilotApprovalDocument;
  manifestFile: string;
  photoRoot: string;
  transport: PilotMediaTransport;
  onProgress?: (results: readonly PilotMediaResult[]) => Promise<void>;
}): Promise<readonly PilotMediaResult[]> => {
  const approval = assertPilotApproval(input.scope, input.approval);
  const media = await readPilotMedia(input.manifestFile, input.scope);
  const client = await input.pool.connect();
  const results: PilotMediaResult[] = [];
  try {
    await assertPilotDatabase(client, input.scope);
    const operation = await client.query(
      "SELECT status,canonical_input_sha256,dry_run_result_sha256,approval_sha256,validation_context,result_json FROM catalog_import_operations WHERE operation_id=$1",
      [input.scope.operationId],
    );
    const stored = operation.rows[0];
    assert(
      stored?.status === "APPLIED" &&
        stored.canonical_input_sha256 === approval.canonicalInputSha256 &&
        stored.dry_run_result_sha256 === approval.dryRunResultSha256 &&
        stored.approval_sha256 === hashApproval(approval) &&
        stored.validation_context.targetScopeSha256 ===
          pilotScopeSha256(input.scope),
      "No matching approved Catalog operation on this target",
    );
    const map = (stored.result_json as CatalogImportApplicationResult)
      .catalogIdMap;
    assert(
      map.length === 3 &&
        input.scope.catalogs.every((c) =>
          map.some(
            (m) =>
              m.catalogImportId === c.catalogImportId &&
              m.sourceId === c.sourceId,
          ),
        ),
      "Stored Catalog mapping does not match Pilot scope",
    );
    const expectedRegistrations = new Map(
      media.map((row) => [
        row.mediaId,
        mediaRegistration(
          row,
          map.find((mapping) => mapping.sourceId === row.sourceId)!.catalogId,
        ),
      ]),
    );
    // Existing rows may be a valid partial previous run, but never a different
    // binding or an extra image on one of the three frozen Catalogs.
    await assertExistingPilotMedia(client, expectedRegistrations, false);
    for (const row of media) {
      let verified:
        Awaited<ReturnType<PilotMediaTransport["ensureObject"]>> | undefined;
      let stage: NonNullable<PilotMediaResult["stage"]> = "photo";
      try {
        const bytes = await readPilotPhoto(input.photoRoot, row);
        stage = "verification";
        verified = await input.transport.ensureObject(row.objectKey, bytes);
        assert(
          verified.objectKey === row.objectKey &&
            verified.sha256 === row.sha256 &&
            verified.sizeBytes === row.sizeBytes,
          "Remote verification does not match frozen media",
        );
        stage = "registration";
        const catalogId = map.find(
          (m) => m.sourceId === row.sourceId,
        )!.catalogId;
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await assertPilotDatabase(client, input.scope);
        const catalog = await client.query(
          "SELECT catalog_id FROM catalog_entries WHERE catalog_id=$1 FOR UPDATE",
          [catalogId],
        );
        assert(catalog.rowCount === 1, "Imported Catalog no longer exists");
        await assertExistingPilotMedia(client, expectedRegistrations, true);
        const existing = await client.query(
          "SELECT media_id,catalog_id,position,is_representative,kind,alt_text,width,height,object_key FROM catalog_media WHERE media_id=$1 OR object_key=$5 OR (catalog_id=$2 AND (position=$3 OR ($4 AND is_representative))) FOR UPDATE",
          [
            row.mediaId,
            catalogId,
            row.position,
            row.isRepresentative,
            row.objectKey,
          ],
        );
        const expected = expectedRegistrations.get(row.mediaId)!;
        if (existing.rows.length > 0) {
          if (
            existing.rows.length !== 1 ||
            digest(existing.rows[0]) !== digest(expected)
          )
            throw new PilotMediaRegistrationConflict();
        } else
          await client.query(
            "INSERT INTO catalog_media(media_id,catalog_id,position,is_representative,kind,alt_text,width,height,object_key) VALUES($1,$2,$3,$4,'image',$5,$6,$7,$8)",
            [
              row.mediaId,
              catalogId,
              row.position,
              row.isRepresentative,
              row.altText,
              row.width,
              row.height,
              row.objectKey,
            ],
          );
        await client.query("COMMIT");
        results.push({
          mediaId: row.mediaId,
          objectKey: row.objectKey,
          sha256: row.sha256,
          upload: verified.outcome,
          verifiedAt: verified.verifiedAt,
          registration: existing.rows.length ? "reused" : "created",
          catalogId,
        });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        // No cloud deletion; a retry verifies the existing bytes before registering again.
        const errorCode =
          error instanceof PilotMediaRegistrationConflict
            ? "REGISTRATION_CONFLICT"
            : stage === "photo"
              ? "PHOTO_VALIDATION_FAILED"
              : stage === "verification"
                ? "REMOTE_VERIFICATION_FAILED"
                : "REGISTRATION_FAILED";
        results.push({
          mediaId: row.mediaId,
          objectKey: row.objectKey,
          sha256: row.sha256,
          upload: verified?.outcome ?? "unverified",
          registration: "failed",
          stage,
          errorCode,
          ...(verified ? { verifiedAt: verified.verifiedAt } : {}),
        });
      }
      await input.onProgress?.(results);
    }
    return results;
  } finally {
    client.release();
  }
};

export interface PilotMediaResult {
  readonly mediaId: string;
  readonly objectKey: string;
  readonly sha256: string;
  readonly upload: "uploaded" | "reused" | "unverified";
  readonly registration: "created" | "reused" | "failed";
  readonly catalogId?: string;
  readonly verifiedAt?: string;
  readonly stage?: "photo" | "verification" | "registration";
  readonly errorCode?:
    | "PHOTO_VALIDATION_FAILED"
    | "REMOTE_VERIFICATION_FAILED"
    | "REGISTRATION_FAILED"
    | "REGISTRATION_CONFLICT";
}
