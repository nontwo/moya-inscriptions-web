import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { CommunityNotFoundError } from "@moya/api";
import {
  createPostgresPool,
  parsePostgresConfig,
} from "@moya/catalog-postgres";
import {
  PostgresAuthorCommunityAdapter,
  PostgresCommunityCommentAdapter,
  PostgresCommunityContentOperatorAdapter,
  PostgresCommunityDiscoveryAdapter,
  PostgresPublishingOperatorAdapter,
  PostgresWorkPublishingAdapter,
  runCommunityMigrations,
  verifyCommunityMigrationLedger,
} from "@moya/community-postgres";
import { discoveryQuerySchema } from "@moya/contracts/schemas";
import type { WorkDraftContent, WorkSubmissionResult } from "@moya/contracts";
import { afterAll, describe, expect, it } from "vitest";

import {
  assertSyntheticTestDatabaseUrl,
  requireSyntheticTestDatabaseUrl,
} from "./synthetic-test-database.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const targetUrl = requireSyntheticTestDatabaseUrl();
const endpoint = new URL(targetUrl);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) ||
  endpoint.search ||
  endpoint.hash
)
  throw new Error(
    "App-role regression requires a loopback disposable target without overrides",
  );
const guard = (await import(
  new URL("../../../scripts/disposable-test-target.mjs", import.meta.url).href
)) as {
  disposableTestTargetProbeSql: string;
  assertDisposableTestTarget(rows: unknown, database: string): string;
};
type Pool = ReturnType<typeof createPostgresPool>;
const poolFor = (url: string) =>
  createPostgresPool(parsePostgresConfig({ DATABASE_URL: url }));
const administration = poolFor(targetUrl);
const resources: {
  database: string;
  role: string;
  setup?: Pool;
  app?: Pool;
  createdDatabase: boolean;
  createdRole: boolean;
}[] = [];
const opaque = (prefix: string) =>
  `${prefix}-${randomBytes(16).toString("hex")}`;
const commandId = () => ({ requestId: randomUUID() });
const now = new Date("2026-09-14T12:00:00Z");
const content = (title: string): WorkDraftContent => ({
  title,
  body: "",
  authorship: null,
  visibility: "public",
  items: [],
  coverKey: null,
  coverCrop: null,
});
const receipt = (result: WorkSubmissionResult) => {
  if (result.state !== "confirmed")
    throw new Error("Expected a confirmed submission");
  return result;
};

afterAll(async () => {
  for (const resource of resources) {
    await resource.app?.end();
    await resource.setup?.end();
    // Only successfully created, unpredictable resources from this invocation.
    if (resource.createdDatabase)
      await administration.query(`DROP DATABASE ${resource.database}`);
    if (resource.createdRole)
      await administration.query(`DROP ROLE ${resource.role}`);
  }
  await administration.end();
});

describe.each(["clean", "phase4-upgrade"] as const)(
  "publishing App-role %s",
  (kind) => {
    it("runs runtime commands with exact grants while denying ownership, identity and ledger writes", async () => {
      const probe = await administration.query(
        guard.disposableTestTargetProbeSql,
      );
      guard.assertDisposableTestTarget(
        probe.rows,
        assertSyntheticTestDatabaseUrl(targetUrl),
      );
      const suffix = randomBytes(6).toString("hex");
      const database = `wp_app_${suffix}_synthetic_test`;
      const role = `wp_app_${suffix}`;
      const resource = {
        database,
        role,
        createdDatabase: false,
        createdRole: false,
      } as (typeof resources)[number];
      resources.push(resource);
      expect(
        (
          await administration.query(
            "SELECT 1 FROM pg_database WHERE datname=$1 UNION ALL SELECT 1 FROM pg_roles WHERE rolname=$2",
            [database, role],
          )
        ).rows,
      ).toEqual([]);
      // Ephemeral login material exists only in this test process and PostgreSQL.
      const password = randomBytes(32).toString("hex");
      await administration.query(
        `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`,
      );
      resource.createdRole = true;
      await administration.query(`CREATE DATABASE ${database}`);
      resource.createdDatabase = true;
      const setupUrl = new URL(targetUrl);
      setupUrl.pathname = `/${database}`;
      resource.setup = poolFor(setupUrl.toString());
      const setup = resource.setup;
      expect(
        (await setup.query("SELECT current_database() AS name")).rows,
      ).toEqual([{ name: database }]);
      const migrationDirectory = `${root}/database/community-migrations`;
      await runCommunityMigrations(
        setup,
        migrationDirectory,
        kind === "phase4-upgrade" ? { through: "20260913120000" } : {},
      );
      const actor = opaque("user"),
        other = opaque("user"),
        legacy = opaque("work");
      await setup.query(
        "INSERT INTO community.public_users(id,handle,display_name) VALUES($1,$2,'合成作者'),($3,$4,'合成访客')",
        [actor, `qa-${suffix}-a`, other, `qa-${suffix}-b`],
      );
      if (kind === "phase4-upgrade") {
        await setup.query(
          "INSERT INTO community.works(id,author_id,title,text,first_published_at) VALUES($1,$2,'升级前作品','旧正文',$3)",
          [legacy, actor, now],
        );
        await setup.query(
          "INSERT INTO community.work_edit_drafts(id,work_id,author_id,version,base_work_version,base_draft_version,title,text,media_ids,conflicted) VALUES($1,$2,$3,1,1,0,'升级前草稿','保留内容','{}',FALSE)",
          [opaque("draft"), legacy, actor],
        );
      }
      const before = (
        await setup.query(
          "SELECT migration_id,filename,checksum,applied_at FROM community.schema_migrations ORDER BY migration_id",
        )
      ).rows;
      await runCommunityMigrations(setup, migrationDirectory);
      expect(await runCommunityMigrations(setup, migrationDirectory)).toEqual(
        [],
      );
      expect(
        (
          await setup.query(
            "SELECT migration_id,filename,checksum,applied_at FROM community.schema_migrations WHERE migration_id=ANY($1::text[]) ORDER BY migration_id",
            [before.map((row) => row.migration_id)],
          )
        ).rows,
      ).toEqual(before);
      // Empty, explicitly synthetic published Catalog projections for discovery.
      await setup.query(
        "CREATE TABLE public.catalog_discovery(catalog_id text PRIMARY KEY,kind text,title text,aliases varchar[],first_published_at timestamptz,filter_metadata jsonb); CREATE TABLE public.catalog_media(catalog_id text,media_id text,object_key text,width integer,height integer,is_representative boolean)",
      );
      const grantSql = (
        await readFile(
          `${root}/infra/development/work-publishing/grant-runtime.sql`,
          "utf8",
        )
      ).replaceAll(':"app_role"', `"${role}"`);
      await setup.query(grantSql);
      await setup.query(grantSql); // supported bootstrap is idempotent
      const appUrl = new URL(setupUrl);
      appUrl.username = role;
      appUrl.password = password;
      resource.app = poolFor(appUrl.toString());
      const app = resource.app;
      expect(
        (
          await app.query(
            "SELECT current_database() AS database,current_user,session_user,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user",
          )
        ).rows,
      ).toEqual([
        {
          database,
          current_user: role,
          session_user: role,
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
        },
      ]);
      expect(
        (
          await app.query(
            "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='community' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)",
          )
        ).rows,
      ).toEqual([]);
      await verifyCommunityMigrationLedger(app);
      const publishing = new PostgresWorkPublishingAdapter(app);
      const operators = new PostgresPublishingOperatorAdapter(app);
      const authors = new PostgresAuthorCommunityAdapter(app);
      const discovery = new PostgresCommunityDiscoveryAdapter(app);
      const comments = new PostgresCommunityCommentAdapter(app);
      const policy = async (value: "DIRECT_PUBLICATION" | "PRE_MODERATION") => {
        const settings = await operators.readSettings();
        await operators.setSettings(
          "qa-operator",
          {
            ...settings,
            ...commandId(),
            expectedVersion: settings.version,
            policy: value,
          },
          now,
        );
      };
      const publish = async (title: string) => {
        const draft = await publishing.createDraft(
          actor,
          { ...commandId(), content: content(title), deviceClass: "desktop" },
          now,
        );
        return receipt(
          await publishing.submit(
            actor,
            {
              ...commandId(),
              holder: { draftId: draft.id },
              baseRevisionId: draft.baseRevisionId,
              content: draft.content,
            },
            now,
          ),
        );
      };
      // Both conflict choices execute with the same non-owner App-role pool.
      for (const choice of ["device", "account"] as const) {
        const draft = await publishing.createDraft(
          actor,
          { ...commandId(), content: content("起点"), deviceClass: "desktop" },
          now,
        );
        await publishing.snapshotDraft(
          actor,
          draft.id,
          {
            baseRevision: draft.revision,
            content: content("账号版本"),
            deviceClass: "phone",
          },
          now,
        );
        const conflicted = await publishing.saveDraft(
          actor,
          draft.id,
          {
            baseRevision: draft.revision,
            content: content("设备版本"),
            deviceClass: "desktop",
          },
          new Date(now.getTime() + 1),
        );
        if (conflicted.status !== "conflict")
          throw new Error("Expected a real draft conflict");
        await expect(
          publishing.readDraft(other, draft.id),
        ).rejects.toBeInstanceOf(CommunityNotFoundError);
        if (choice === "device") {
          // Reproduce the retained environment's former narrow snapshot grant.
          // Setup alone changes permissions; the failing command still uses App.
          await setup.query(
            `REVOKE UPDATE (kind, pinned, source_revision, created_at)
             ON community.work_draft_snapshots FROM ${resource.role}`,
          );
          await expect(
            publishing.resolveConflict(
              actor,
              draft.id,
              { ...commandId(), conflictId: conflicted.conflict.id, choice },
              new Date(now.getTime() + 2),
            ),
          ).rejects.toMatchObject({ code: "42501" });
          await setup.query(grantSql);
        }
        const resolved = await publishing.resolveConflict(
          actor,
          draft.id,
          { ...commandId(), conflictId: conflicted.conflict.id, choice },
          new Date(now.getTime() + 2),
        );
        expect(resolved.content.title).toBe(
          choice === "device" ? "设备版本" : "账号版本",
        );
        const history = await publishing.listHistory(actor, draft.id, {
          page: 1,
          pageSize: 50,
        });
        expect(
          history.items.some(
            (snapshot) => snapshot.content.title === "账号版本",
          ),
        ).toBe(true);
        expect(
          history.items.some(
            (snapshot) => snapshot.content.title === "设备版本",
          ),
        ).toBe(true);
        await publishing.deleteDraft(
          actor,
          draft.id,
          { ...commandId(), expectedRevision: resolved.revision },
          now,
        );
        await expect(
          publishing.readDraft(actor, draft.id),
        ).rejects.toBeInstanceOf(CommunityNotFoundError);
      }
      await policy("DIRECT_PUBLICATION");
      const original = await publish("公开 V1");
      expect((await authors.readWork(original.workId, other)).title).toBe(
        "公开 V1",
      );
      await publishing.setVisibility(
        actor,
        original.workId,
        { ...commandId(), visibility: "self" },
        now,
      );
      await policy("PRE_MODERATION");
      await publishing.setVisibility(
        actor,
        original.workId,
        { ...commandId(), visibility: "public" },
        now,
      );
      for (const viewer of [null, other]) {
        await expect(
          authors.readWork(original.workId, viewer),
        ).rejects.toBeInstanceOf(CommunityNotFoundError);
        expect(
          (
            await discovery.browse(viewer, discoveryQuerySchema.parse({}))
          ).items.map((card) => card.target.id),
        ).not.toContain(original.workId);
        await expect(
          comments.readDiscussion(
            { type: "work", id: original.workId },
            viewer,
            { page: 1, pageSize: 10 },
          ),
        ).rejects.toBeInstanceOf(CommunityNotFoundError);
      }
      expect((await authors.readWork(original.workId, actor)).title).toBe(
        "公开 V1",
      );
      const pending = await operators.readSubmission(original.revisionId);
      await operators.moderateSubmission(
        original.revisionId,
        "qa-operator",
        { ...commandId(), action: "approve", expectedVersion: pending.version },
        now,
      );
      expect(
        (await authors.readWork(original.workId, other)).firstPublishedAt,
      ).toBe(now.toISOString());
      const edit = (
        await publishing.openEditDraft(
          actor,
          original.workId,
          { ...commandId(), deviceClass: "desktop" },
          now,
        )
      ).draft;
      const v2 = receipt(
        await publishing.submit(
          actor,
          {
            ...commandId(),
            holder: { draftId: edit.id },
            baseRevisionId: edit.baseRevisionId,
            content: { ...edit.content, title: "待审 V2" },
          },
          now,
        ),
      );
      expect((await authors.readWork(original.workId, other)).title).toBe(
        "公开 V1",
      );
      expect((await authors.readWork(original.workId, actor)).title).toBe(
        "待审 V2",
      );
      await expect(
        operators.moderateSubmission(
          original.revisionId,
          "qa-operator",
          {
            ...commandId(),
            action: "approve",
            expectedVersion: pending.version,
          },
          now,
        ),
      ).rejects.toThrow();
      const managed = await new PostgresCommunityContentOperatorAdapter(
        app,
      ).readWorks({ page: 1, pageSize: 20, search: original.workId });
      expect(managed.items[0]).toMatchObject({
        latestSubmission: { revisionId: v2.revisionId, title: "待审 V2" },
        publicRevisionId: original.revisionId,
        publiclyVisible: true,
      });
      const discussionTarget = { type: "work" as const, id: original.workId };
      const rootComment = await comments.submitDiscussion(
        discussionTarget,
        actor,
        "Public root",
      );
      await comments.submitDiscussion(
        discussionTarget,
        other,
        "Public reply",
        rootComment.id,
      );
      expect(
        (
          await comments.readDiscussion(discussionTarget, other, {
            page: 1,
            pageSize: 1,
          })
        ).visibleTotal,
      ).toBe(2);
      const review = await operators.readSubmission(v2.revisionId);
      await operators.moderateSubmission(
        v2.revisionId,
        "qa-operator",
        { ...commandId(), action: "approve", expectedVersion: review.version },
        now,
      );
      await publishing.trashWork(actor, original.workId, commandId(), now);
      expect(
        await publishing.restoreWork(actor, original.workId, commandId(), now),
      ).toMatchObject({ visibility: "self" });
      await expect(
        authors.readWork(original.workId, other),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
      const session = await publishing.createSession(
        actor,
        { ...commandId(), workId: null },
        now,
      );
      await publishing.discardSession(actor, session.id, commandId(), now);
      const queued = await publishing.enqueueJob(
        { kind: "expire_session", subjectId: session.id },
        now,
      );
      const claim = (
        await publishing.claimJobs(
          {
            owner: "qa-worker",
            limit: 1,
            leaseMs: 5000,
            kinds: ["expire_session"],
          },
          now,
        )
      )[0];
      expect(claim?.id).toBe(queued.id);
      if (!claim) throw new Error("Expected worker claim");
      expect(await publishing.renewJobLease(claim, 5000, now)).toBe(true);
      expect(await publishing.completeJob(claim, now)).toBe(true);
      await publishing.scheduleCleanup(now, 10);
      await publishing.reconcileCapacity(actor, now);
      if (kind === "phase4-upgrade") {
        expect((await authors.readWork(legacy, other)).title).toBe(
          "升级前作品",
        );
        // The committed legacy backfill preserves old edits as history snapshots,
        // not active drafts. Reopen the work through the App role to read them.
        const legacyDraft = (
          await publishing.openEditDraft(
            actor,
            legacy,
            { ...commandId(), deviceClass: "desktop" },
            now,
          )
        ).draft;
        expect(
          (
            await publishing.listHistory(actor, legacyDraft.id, {
              page: 1,
              pageSize: 50,
            })
          ).items.some(
            (snapshot) =>
              snapshot.kind === "legacy_draft" &&
              snapshot.content.title === "升级前草稿" &&
              snapshot.content.body === "保留内容",
          ),
        ).toBe(true);
      }
      await expect(
        publishing.readDraft(other, opaque("work-draft")),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
      for (const sql of [
        "CREATE TABLE community.qa_forbidden(id int)",
        "TRUNCATE community.work_drafts",
        "UPDATE community.schema_migrations SET checksum=checksum",
        "DELETE FROM community.schema_migrations",
        "UPDATE community.work_draft_snapshots SET owner_id=owner_id",
        "UPDATE community.author_events SET action=action",
        "DELETE FROM community.author_events",
        "UPDATE community.public_users SET id=id",
        "DELETE FROM community.public_users",
      ])
        await expect(app.query(sql)).rejects.toMatchObject({ code: "42501" });
    });
  },
);
