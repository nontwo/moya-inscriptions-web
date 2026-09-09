import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { z } from "zod";
import { getFileKey } from "@payloadcms/plugin-cloud-storage/utilities";

import {
  editorialContentFromDocument,
  editorialDraftSchema,
} from "@moya/contracts/internal/editorial";

import { prepareLegacyEditorialMigration } from "./legacy";

const MAX_BYTES = 64 * 1024 * 1024;
const settingsSchema = z.strictObject({
  target: z.string().regex(/^[A-Za-z0-9._-]{1,80}$/),
  baseURL: z.string(),
  ownerApiKey: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[^\s]+$/),
  environment: z.enum(["synthetic", "production"]),
});
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const equal = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

class MigrationFailure extends Error {
  constructor(readonly category: string) {
    super(category);
  }
}
function fail(category: string): never {
  throw new MigrationFailure(category);
}

/** Reads protected program-produced files without printing values or paths. */
export async function readProtectedMigrationJSON(filePath: string) {
  let file;
  try {
    file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await file.stat();
    if (
      !info.isFile() ||
      (info.mode & 0o077) !== 0 ||
      (process.getuid && info.uid !== process.getuid()) ||
      info.size > MAX_BYTES
    )
      fail("PROTECTED_INPUT_REQUIRED");
    const bytes = await file.readFile();
    if (bytes.byteLength > MAX_BYTES) fail("INPUT_TOO_LARGE");
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (error) {
    if (error instanceof MigrationFailure) throw error;
    fail("PROTECTED_INPUT_UNAVAILABLE");
  } finally {
    await file?.close();
  }
}

/**
 * No connection is made in dry-run. Apply preflights the complete plan, never
 * updates an existing record, registers metadata without files, then saves
 * drafts. Partial failures can be rerun: existing content is compared exactly,
 * and uncertain draft responses retry the same server idempotency request.
 * Returned data consists only of fixed categories and aggregate counts.
 */
export async function runLegacyEditorialMigration(options: {
  snapshot: unknown;
  mode: "dry-run" | "apply";
  target?: string;
  settings?: unknown;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  const plan = prepareLegacyEditorialMigration(options.snapshot);
  const execution = {
    mediaRegistered: 0,
    mediaMatched: 0,
    draftsSaved: 0,
    draftsMatched: 0,
    serverReplayed: 0,
  };
  const report = (
    status: "READY" | "BLOCKED" | "APPLIED",
    category?: string,
  ) => ({
    mode: options.mode,
    status,
    counts: plan.dryRun.counts,
    findings: plan.dryRun.findings,
    execution,
    ...(category ? { category } : {}),
  });
  if (plan.dryRun.status === "BLOCKED") return report("BLOCKED");
  if (plan.drafts.length > 10_000 || plan.mediaRegistrations.length > 10_000)
    return report("BLOCKED", "MIGRATION_ITEM_LIMIT");
  for (const { objectKey } of plan.mediaRegistrations) {
    const segments = objectKey.split("/");
    const filename = segments.pop()!;
    try {
      if (
        getFileKey({ docPrefix: segments.join("/"), filename }).fileKey !==
        objectKey
      )
        return report("BLOCKED", "MEDIA_OBJECT_KEY_REQUIRES_ADAPTER_EXTENSION");
    } catch {
      return report("BLOCKED", "MEDIA_OBJECT_KEY_REQUIRES_ADAPTER_EXTENSION");
    }
  }
  if (options.mode === "dry-run") return report("READY");
  if (options.mode !== "apply") return report("BLOCKED", "MODE_REQUIRED");
  try {
    const now = options.now ?? (() => performance.now());
    const deadline = now() + 120_000;
    const remaining = () => {
      const value = Math.floor(deadline - now());
      if (value <= 0) fail("MIGRATION_BUDGET_EXHAUSTED");
      return value;
    };
    const parsed = settingsSchema.safeParse(options.settings);
    if (!parsed.success) fail("PROTECTED_SETTINGS_INVALID");
    const settings = parsed.data;
    if (!options.target || options.target !== settings.target)
      fail("EXPLICIT_TARGET_REQUIRED");
    let base: URL;
    try {
      base = new URL(settings.baseURL);
    } catch {
      return report("BLOCKED", "TARGET_INVALID");
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      base.hostname,
    );
    if (
      base.username ||
      base.password ||
      base.hash ||
      base.search ||
      base.pathname !== "/" ||
      (settings.environment === "synthetic" && !loopback) ||
      (base.protocol !== "https:" &&
        !(
          settings.environment === "synthetic" &&
          loopback &&
          base.protocol === "http:"
        ))
    )
      fail("TARGET_INVALID");
    const fetcher = options.fetch ?? fetch;
    const request = async (
      route: string,
      body?: unknown,
      reconcile?: () => Promise<Record<string, unknown> | undefined>,
    ): Promise<Record<string, unknown>> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const timeout = Math.min(15_000, remaining());
        let response: Response;
        try {
          response = await fetcher(new URL(route, base), {
            method: body === undefined ? "GET" : "POST",
            headers: {
              Authorization: `users API-Key ${settings.ownerApiKey}`,
              ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(timeout),
          });
        } catch {
          remaining();
          const reconciled = await reconcile?.();
          if (reconciled) return reconciled;
          if (attempt < 2) continue;
          fail("TARGET_UNAVAILABLE");
        }
        remaining();
        if (!response.ok) {
          const reconciled = await reconcile?.();
          if (reconciled) return reconciled;
        }
        if ((response.status === 429 || response.status >= 500) && attempt < 2)
          continue;
        if (!response.ok)
          fail(
            response.status === 401 || response.status === 403
              ? "OWNER_AUTHORIZATION_REQUIRED"
              : response.status === 409
                ? "TARGET_CONFLICT"
                : "TARGET_REQUEST_REJECTED",
          );
        try {
          const reader = response.body?.getReader();
          if (!reader) fail("TARGET_RESPONSE_INVALID");
          const chunks: Uint8Array[] = [];
          let size = 0;
          for (;;) {
            remaining();
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > MAX_BYTES) {
              await reader.cancel();
              fail("TARGET_RESPONSE_INVALID");
            }
            chunks.push(next.value);
          }
          const value: unknown = JSON.parse(
            Buffer.concat(chunks).toString("utf8"),
          );
          if (!value || typeof value !== "object" || Array.isArray(value))
            fail("TARGET_RESPONSE_INVALID");
          return value as Record<string, unknown>;
        } catch {
          remaining();
          const reconciled = await reconcile?.();
          if (reconciled) return reconciled;
          if (attempt < 2) continue;
          fail("TARGET_RESPONSE_INVALID");
        }
      }
      return fail("TARGET_UNAVAILABLE");
    };
    const identity = await request("/api/users/me");
    const user = identity.user as Record<string, unknown> | undefined;
    if (!user || user.role !== "owner" || user.collection !== "users")
      fail("OWNER_AUTHORIZATION_REQUIRED");
    const docs = (response: Record<string, unknown>) => {
      if (
        !Array.isArray(response.docs) ||
        response.docs.some(
          (doc) => !doc || typeof doc !== "object" || Array.isArray(doc),
        )
      )
        fail("TARGET_RESPONSE_INVALID");
      return response.docs as Record<string, unknown>[];
    };
    const query = (
      collection: "catalogs" | "media",
      conditions: [string, string][],
    ) => {
      const params = new URLSearchParams({
        limit: "2",
        depth: "0",
        draft: "true",
      });
      conditions.forEach(([field, value], index) =>
        params.set(`where[or][${index}][${field}][equals]`, value),
      );
      return `/api/${collection}?${params.toString()}`;
    };
    const pendingMedia: typeof plan.mediaRegistrations = [];
    const pendingDrafts: typeof plan.drafts = [];
    const matchingMedia = async (
      registration: (typeof plan.mediaRegistrations)[number],
    ) => {
      const existing = docs(
        await request(
          query("media", [
            ["mediaId", registration.mediaId],
            ["objectKey", registration.objectKey],
          ]),
        ),
      );
      if (!existing.length) return undefined;
      if (
        existing.length !== 1 ||
        Object.entries(registration).some(
          ([key, value]) => (existing[0]![key] ?? undefined) !== value,
        ) ||
        (existing[0]!.rights ?? undefined) !== registration.rights
      )
        fail("MEDIA_IDENTITY_CONFLICT");
      return existing[0]!;
    };
    for (const registration of plan.mediaRegistrations) {
      if (await matchingMedia(registration)) execution.mediaMatched++;
      else pendingMedia.push(registration);
    }
    for (const draft of plan.drafts) {
      const existing = docs(
        await request(
          query("catalogs", [
            ["catalogId", draft.content.catalogId],
            ["sourceId", draft.content.sourceId],
          ]),
        ),
      );
      if (!existing.length) pendingDrafts.push(draft);
      else {
        const parsed =
          existing.length === 1
            ? editorialDraftSchema.safeParse(
                editorialContentFromDocument(existing[0]!),
              )
            : undefined;
        if (!parsed?.success || !equal(parsed.data, draft.content))
          fail("CATALOG_CONTENT_CONFLICT");
        execution.draftsMatched++;
      }
    }
    for (const registration of pendingMedia) {
      const response = await request("/api/media", registration, async () => {
        const doc = await matchingMedia(registration);
        return doc ? { doc } : undefined;
      });
      const document = response.doc as Record<string, unknown> | undefined;
      if (
        !document ||
        Object.entries(registration).some(
          ([key, value]) => (document[key] ?? undefined) !== value,
        )
      )
        fail("MEDIA_REGISTRATION_UNVERIFIED");
      execution.mediaRegistered++;
    }
    for (const { content } of pendingDrafts) {
      const response = await request("/api/editorial/save-draft", {
        idempotencyKey: `legacy-v1:${digest(content)}`,
        content,
      });
      const result = response.result as Record<string, unknown> | undefined;
      if (
        response.ok !== true ||
        !result ||
        !Number.isSafeInteger(result.id) ||
        Number(result.id) < 1
      )
        fail("DRAFT_SAVE_UNVERIFIED");
      const verified = await request("/api/editorial/read-draft", {
        id: result.id,
      });
      const returned = verified.result as Record<string, unknown> | undefined;
      const parsed = editorialDraftSchema.safeParse(returned?.content);
      if (
        verified.ok !== true ||
        !parsed.success ||
        !equal(parsed.data, content)
      )
        fail("DRAFT_CONTENT_MISMATCH");
      execution.draftsSaved++;
      if (result.replayed === true) execution.serverReplayed++;
    }
    return report("APPLIED");
  } catch (error) {
    return report(
      "BLOCKED",
      error instanceof MigrationFailure ? error.category : "MIGRATION_FAILED",
    );
  }
}
