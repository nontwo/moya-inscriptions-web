import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalReq, getPayload, type TypedUser } from "payload";

import config from "admin/config";
import { readDraft, saveDraft } from "admin/editorial";
import { prepareLegacyEditorialMigration } from "admin/migration";
import { runLegacyEditorialMigration } from "admin/migration-runner";

if (process.env.CMS_ENVIRONMENT !== "synthetic" || !process.env.CMS_MEDIA_DIR)
  throw new Error("An isolated synthetic CMS database is required");

const run = randomUUID();
const original = "合成異體字𠮷\r\n甲  乙\n〔闕〕";
const snapshot = (name: string) => {
  const catalogId = `synthetic-migrate-${run}-${name}`;
  const sourceId = `source-migrate-${run}-${name}`;
  const mediaId = `media-migrate-${run}-${name}`;
  const stateColumns = [
    "dynasty",
    "date_text",
    "province",
    "prefecture",
    "county",
    "current_location",
    "current_custodian",
    "description",
    "script_style",
    "historical_context",
    "scholarly_research",
  ];
  return {
    catalog_entries: [
      {
        catalog_id: catalogId,
        kind: "calligraphy",
        title: "合成迁移标题",
        summary: null,
        period_label: null,
        ...Object.fromEntries(
          stateColumns.flatMap((field) => [
            [field, null],
            [`${field}_state`, "UNSUPPLIED"],
          ]),
        ),
        transcription: original,
        transcription_state: "VALUE",
      },
    ],
    catalog_import_sources: [
      {
        catalog_id: catalogId,
        source_id: sourceId,
        source_title: "合成来源",
        source_type_raw: null,
        source_url: null,
        source_note: original,
      },
    ],
    catalog_aliases: [],
    catalog_contributors: [],
    catalog_source_citations: [],
    catalog_source_citation_scopes: [],
    catalog_media: [
      {
        catalog_id: catalogId,
        media_id: mediaId,
        position: 0,
        is_representative: true,
        kind: "image",
        alt_text: "合成原图",
        width: 2,
        height: 3,
        object_key: `synthetic/${run}/${name}-${run}.png`,
      },
    ],
    mediaMetadata: [
      {
        catalogId,
        sourceId,
        mediaId,
        objectKey: `synthetic/${run}/${name}-${run}.png`,
        sha256: "b".repeat(64),
        filesize: 1024,
        mimeType: "image/png",
        width: 2,
        height: 3,
        alt: "合成原图",
        position: 0,
        isRepresentative: true,
        rights: "合成原始权利",
        orderConfidence: "LOW",
      },
    ],
  };
};
const settings = {
  target: "synthetic-migration",
  baseURL: "http://127.0.0.1",
  ownerApiKey: "synthetic-test-only",
  environment: "synthetic",
};
let payload: Awaited<ReturnType<typeof getPayload>>;
let owner: TypedUser;
const req = () => createLocalReq({ user: owner }, payload);

beforeAll(async () => {
  payload = await getPayload({ config });
  owner = await payload.create({
    collection: "users",
    overrideAccess: true,
    data: {
      email: `migration-owner-${run}@example.invalid`,
      password: randomUUID(),
      role: "owner",
    },
  });
}, 30_000);
afterAll(async () => {
  await payload?.destroy();
});

/** Synthetic HTTP transport exercises the real authorized Payload operations. */
function transport(
  options: {
    loseDraftReply?: boolean;
    loseMediaReply?: boolean;
    role?: "automation";
  } = {},
) {
  const calls: string[] = [];
  const failures: { route: string; status: number | null; category: string }[] =
    [];
  let lost = false;
  let lostMedia = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(`${init?.method} ${url.pathname}`);
    expect(init?.redirect).toBe("error");
    if (url.pathname === "/api/users/me")
      return Response.json({
        user: {
          id: owner.id,
          collection: "users",
          role: options.role ?? "owner",
        },
      });
    const request = await req();
    if (init?.method === "GET") {
      const collection = url.pathname === "/api/media" ? "media" : "catalogs";
      const fields =
        collection === "media"
          ? ["mediaId", "objectKey"]
          : ["catalogId", "sourceId"];
      const docs = await payload.find({
        collection,
        req: request,
        user: owner,
        overrideAccess: false,
        draft: true,
        depth: 0,
        limit: 2,
        where: {
          or: fields.map((field, index) => ({
            [field]: {
              equals: url.searchParams.get(
                `where[or][${index}][${field}][equals]`,
              ),
            },
          })),
        },
      });
      return Response.json(docs);
    }
    expect(typeof init?.body).toBe("string");
    const body: Record<string, unknown> = JSON.parse(String(init?.body));
    expect(body).not.toHaveProperty("_status");
    expect(body).not.toHaveProperty("file");
    if (url.pathname === "/api/media") {
      expect(body.origin).toBe("existing");
      const doc = await payload.create({
        collection: "media",
        req: request,
        user: owner,
        overrideAccess: false,
        data: body as never,
      });
      if (options.loseMediaReply && !lostMedia) {
        lostMedia = true;
        throw new Error("Synthetic lost metadata reply");
      }
      return Response.json({ doc });
    }
    if (url.pathname === "/api/editorial/save-draft") {
      const result = await saveDraft(request, body);
      if (options.loseDraftReply && !lost) {
        lost = true;
        throw new Error("Synthetic lost reply");
      }
      return Response.json({ ok: true, result });
    }
    if (url.pathname === "/api/editorial/read-draft")
      return Response.json({
        ok: true,
        result: await readDraft(request, body),
      });
    throw new Error("Unexpected migration route");
  };
  const guarded: typeof fetch = async (input, init) => {
    try {
      return await fetcher(input, init);
    } catch (error) {
      const record = error as {
        status?: unknown;
        code?: unknown;
        message?: unknown;
      };
      const known = new Set([
        "MEDIA_REGISTRATION_FORBIDDEN",
        "MEDIA_IDENTITY_EXISTS",
        "MEDIA_REGISTRATION_INVALID",
        "MEDIA_REFERENCE_INVALID",
        "MEDIA_OBJECT_KEY_MISMATCH",
        "MEDIA_OBJECT_KEY_REQUIRES_ADAPTER_EXTENSION",
        "IDENTITY_ALREADY_BOUND",
        "TRANSACTION_REQUIRED",
        "REVISION_CONFLICT",
      ]);
      const candidate = record.code ?? record.message;
      failures.push({
        route: new URL(String(input)).pathname,
        status: typeof record.status === "number" ? record.status : null,
        category:
          typeof candidate === "string" && known.has(candidate)
            ? candidate
            : error instanceof Error &&
                error.message.startsWith("Synthetic lost")
              ? "SYNTHETIC_LOST_REPLY"
              : "SYNTHETIC_OPERATION_FAILED",
      });
      if (error instanceof Error && error.message.startsWith("Synthetic lost"))
        throw error;
      return Response.json(
        { error: { code: "SYNTHETIC_API_REJECTED" } },
        { status: typeof record.status === "number" ? record.status : 500 },
      );
    }
  };
  return { fetcher: guarded, calls, failures };
}

describe.sequential(
  "legacy migration execution against real Payload PostgreSQL",
  () => {
    it("dry-runs offline and blocks invalid input without connecting", async () => {
      let called = false;
      const fetcher: typeof fetch = async () => {
        called = true;
        throw new Error("Offline");
      };
      const ready = await runLegacyEditorialMigration({
        snapshot: snapshot("offline"),
        mode: "dry-run",
        fetch: fetcher,
      });
      expect(ready.status).toBe("READY");
      const blocked = await runLegacyEditorialMigration({
        snapshot: {},
        mode: "apply",
        target: settings.target,
        settings,
        fetch: fetcher,
      });
      expect(blocked.status).toBe("BLOCKED");
      const incompatible = snapshot("incompatible");
      incompatible.catalog_media[0]!.object_key = "synthetic/a/../image.png";
      incompatible.mediaMetadata[0]!.objectKey = "synthetic/a/../image.png";
      expect(
        (
          await runLegacyEditorialMigration({
            snapshot: incompatible,
            mode: "dry-run",
            fetch: fetcher,
          })
        ).category,
      ).toBe("MEDIA_OBJECT_KEY_REQUIRES_ADAPTER_EXTENSION");
      expect(called).toBe(false);
    });

    it("registers metadata without bytes, saves exact drafts, and reconciles repeat execution without new versions", async () => {
      const input = snapshot("apply");
      const beforeFiles = (await readdir(process.env.CMS_MEDIA_DIR!)).sort();
      const api = transport({ loseDraftReply: true, loseMediaReply: true });
      const first = await runLegacyEditorialMigration({
        snapshot: input,
        mode: "apply",
        target: settings.target,
        settings,
        fetch: api.fetcher,
      });
      expect(
        first.status,
        JSON.stringify({
          report: first,
          failures: api.failures,
          calls: api.calls,
        }),
      ).toBe("APPLIED");
      expect(first.execution).toMatchObject({
        mediaRegistered: 1,
        draftsSaved: 1,
        serverReplayed: 1,
      });
      const doc = (
        await payload.find({
          collection: "catalogs",
          where: {
            catalogId: { equals: input.catalog_entries[0]!.catalog_id },
          },
          draft: true,
          req: await req(),
          overrideAccess: false,
        })
      ).docs[0]!;
      const saved = await readDraft(await req(), { id: doc.id });
      expect(saved.content).toEqual(
        prepareLegacyEditorialMigration(input).drafts[0]!.content,
      );
      expect(saved.content.transcription?.state).toBe("VALUE");
      if (saved.content.transcription?.state !== "VALUE")
        throw new Error("Synthetic transcription missing");
      expect(
        Buffer.from(saved.content.transcription.value).equals(
          Buffer.from(original),
        ),
      ).toBe(true);
      expect(doc._status).toBe("draft");
      const versions = await payload.countVersions({
        collection: "catalogs",
        where: { parent: { equals: doc.id } },
        req: await req(),
        overrideAccess: false,
      });
      const again = transport();
      const replay = await runLegacyEditorialMigration({
        snapshot: input,
        mode: "apply",
        target: settings.target,
        settings,
        fetch: again.fetcher,
      });
      expect(replay.status).toBe("APPLIED");
      expect(replay.execution).toMatchObject({
        mediaMatched: 1,
        draftsMatched: 1,
        draftsSaved: 0,
        mediaRegistered: 0,
      });
      expect(again.calls.some((call) => call.startsWith("POST"))).toBe(false);
      expect(
        (
          await payload.countVersions({
            collection: "catalogs",
            where: { parent: { equals: doc.id } },
            req: await req(),
            overrideAccess: false,
          })
        ).totalDocs,
      ).toBe(versions.totalDocs);
      expect((await readdir(process.env.CMS_MEDIA_DIR!)).sort()).toEqual(
        beforeFiles,
      );
      expect(JSON.stringify(first)).not.toContain(original);
      expect(JSON.stringify(first)).not.toContain(
        input.catalog_entries[0]!.catalog_id,
      );
    });

    it("preflights content and media conflicts before any writes and requires an explicit Owner target", async () => {
      const input = snapshot("apply");
      input.catalog_entries[0]!.title = "合成不同原文";
      const api = transport();
      const conflict = await runLegacyEditorialMigration({
        snapshot: input,
        mode: "apply",
        target: settings.target,
        settings,
        fetch: api.fetcher,
      });
      expect(conflict.category).toBe("CATALOG_CONTENT_CONFLICT");
      expect(api.calls.some((call) => call.startsWith("POST"))).toBe(false);
      const mediaChanged = snapshot("apply");
      mediaChanged.mediaMetadata[0]!.sha256 = "c".repeat(64);
      expect(
        (
          await runLegacyEditorialMigration({
            snapshot: mediaChanged,
            mode: "apply",
            target: settings.target,
            settings,
            fetch: transport().fetcher,
          })
        ).category,
      ).toBe("MEDIA_IDENTITY_CONFLICT");
      const denied = transport({ role: "automation" });
      expect(
        (
          await runLegacyEditorialMigration({
            snapshot: snapshot("denied"),
            mode: "apply",
            target: settings.target,
            settings,
            fetch: denied.fetcher,
          })
        ).category,
      ).toBe("OWNER_AUTHORIZATION_REQUIRED");
      expect(denied.calls).toEqual(["GET /api/users/me"]);
      expect(
        (
          await runLegacyEditorialMigration({
            snapshot: snapshot("target"),
            mode: "apply",
            target: "wrong-target",
            settings,
            fetch: denied.fetcher,
          })
        ).category,
      ).toBe("EXPLICIT_TARGET_REQUIRED");
    });
    it("stops at the batch deadline before starting another operation", async () => {
      let elapsed = 0;
      const api = transport();
      const result = await runLegacyEditorialMigration({
        snapshot: snapshot("deadline"),
        mode: "apply",
        target: settings.target,
        settings,
        now: () => elapsed,
        fetch: async (input, init) => {
          const response = await api.fetcher(input, init);
          elapsed = 120_001;
          return response;
        },
      });
      expect(result.category).toBe("MIGRATION_BUDGET_EXHAUSTED");
      expect(api.calls).toEqual(["GET /api/users/me"]);
      expect(result.execution).toEqual({
        mediaRegistered: 0,
        mediaMatched: 0,
        draftsSaved: 0,
        draftsMatched: 0,
        serverReplayed: 0,
      });
    });
  },
);
