import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  createPostgresPool,
  parsePostgresConfig,
} from "@moya/catalog-postgres";
import {
  PostgresCommunityDiscoveryAdapter,
  PostgresCommunityContentOperatorAdapter,
  PostgresAuthorCommunityAdapter,
  PostgresCommunityCommentAdapter,
} from "@moya/community-postgres";
import {
  AuthorCommunityService,
  CommunityConflictError,
  CommunityNotFoundError,
} from "@moya/api";
import type { AuthorListQuery, AuthorPrivacy } from "@moya/contracts";
import { discoveryQuerySchema } from "@moya/contracts/schemas";
import { requireSyntheticTestDatabaseUrl } from "./synthetic-test-database.js";
import { cleanupPublishingData } from "./work-publishing-content-cases.js";
const id = (prefix: string) => `${prefix}-${randomUUID().replaceAll("-", "")}`;
export const registerPhase4DiscoveryTests = (
  pool: ReturnType<typeof createPostgresPool>,
) => {
  describe("Phase 4 real PostgreSQL sequence and operator transactions", () => {
    const schema = `phase4_discovery_${randomUUID().replaceAll("-", "")}`;
    const reads = createPostgresPool(
      parsePostgresConfig({ DATABASE_URL: requireSyntheticTestDatabaseUrl() }),
    );
    reads.options.options = `-c search_path=${schema},public`;
    const discovery = new PostgresCommunityDiscoveryAdapter(reads),
      operatorPort = new PostgresCommunityContentOperatorAdapter(reads),
      authors = new PostgresAuthorCommunityAdapter(pool),
      comments = new PostgresCommunityCommentAdapter(pool);
    let author: string,
      visitor: string,
      work: string,
      catalog: string,
      operator: string;
    beforeAll(async () => {
      await pool.query(`CREATE SCHEMA ${schema}`);
      await pool.query(
        `CREATE TABLE ${schema}.catalog_discovery(catalog_id text PRIMARY KEY,kind text,title text,aliases varchar[],first_published_at timestamptz,filter_metadata jsonb);CREATE TABLE ${schema}.catalog_media(catalog_id text,media_id text,object_key text,width integer,height integer,is_representative boolean)`,
      );
    });
    afterAll(async () => {
      await reads.end();
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    });
    beforeEach(async () => {
      author = id("user");
      visitor = id("user");
      work = id("work");
      catalog = id("catalog");
      operator = id("test-operator");
      for (const user of [author, visitor])
        await pool.query(
          "INSERT INTO community.public_users(id,handle,display_name) VALUES($1,$2,'合成作者')",
          [user, `p4-${user.slice(-24)}`],
        );
      await pool.query(
        "INSERT INTO community.works(id,author_id,title,text,first_published_at,synthetic_provenance) VALUES($1,$2,'顺序测试作品','原文','2026-01-02','phase4-discovery-test')",
        [work, author],
      );
      await reads.query(
        "INSERT INTO catalog_discovery VALUES($1,'inscription','合成资料',ARRAY['独立别名'],'2026-01-01',$2::jsonb)",
        [
          catalog,
          JSON.stringify({
            dynasty: { state: "VALUE", values: ["合成甲", "合成乙"] },
            textAuthor: { state: "UNKNOWN", values: [] },
            calligrapher: { state: "UNSUPPLIED", values: [] },
            originalRegion: { state: "VALUE", values: ["合成地区"] },
            script: { state: "VALUE", values: ["合成楷书"] },
          }),
        ],
      );
    });
    afterEach(async () => {
      await pool.query("DELETE FROM community.discovery_sequences");
      await pool.query(
        "DELETE FROM community.featured_content WHERE content_id=ANY($1)",
        [[work, catalog]],
      );
      await pool.query(
        "UPDATE community.featured_settings SET enabled_quantity=NULL,version=version+1 WHERE id=TRUE",
      );
      await pool.query(
        "DELETE FROM community.content_operator_receipts WHERE operator_label=$1",
        [operator],
      );
      await pool.query(
        "DELETE FROM community.content_operator_events WHERE operator_label=$1",
        [operator],
      );
      await pool.query(
        "DELETE FROM community.comment_likes WHERE user_id=ANY($1)",
        [[author, visitor]],
      );
      await pool.query(
        "DELETE FROM community.catalog_comment_replies WHERE author_id=ANY($1)",
        [[author, visitor]],
      );
      await pool.query(
        "DELETE FROM community.catalog_comments WHERE author_id=ANY($1)",
        [[author, visitor]],
      );
      await pool.query(
        "DELETE FROM community.discussion_command_receipts WHERE actor_label=ANY($1)",
        [[author, visitor, `operator:${operator}`]],
      );
      await pool.query(
        "DELETE FROM community.moderation_events WHERE operator_label=$1",
        [operator],
      );
      await pool.query(
        "DELETE FROM community.author_command_receipts WHERE actor_id=ANY($1)",
        [[author, visitor]],
      );
      await pool.query(
        "DELETE FROM community.author_events WHERE actor_id=ANY($1)",
        [[author, visitor]],
      );
      await pool.query(
        "DELETE FROM community.content_relations WHERE user_id=ANY($1)",
        [[author, visitor]],
      );
      await pool.query(
        "DELETE FROM community.follows WHERE follower_id=ANY($1) OR followed_id=ANY($1)",
        [[author, visitor]],
      );
      await pool.query(
        "DELETE FROM community.blocks WHERE blocker_id=ANY($1) OR blocked_id=ANY($1)",
        [[author, visitor]],
      );
      await pool.query(
        "DELETE FROM community.work_edit_drafts WHERE author_id=$1",
        [author],
      );
      // Work publishing rows (the legacy revision of the fixture work) first.
      await cleanupPublishingData(pool, [author, visitor]);
      await pool.query("DELETE FROM community.works WHERE id=$1", [work]);
      await pool.query("DELETE FROM community.public_users WHERE id=ANY($1)", [
        [author, visitor],
      ]);
      await reads.query("DELETE FROM catalog_discovery WHERE catalog_id=$1", [
        catalog,
      ]);
    });
    it("keeps all four nonempty lists independently private with exact owner totals and no visitor items", async () => {
      const service = new AuthorCommunityService(
        authors,
        {
          isPublished: async (catalogId) =>
            (
              await reads.query(
                "SELECT 1 FROM catalog_discovery WHERE catalog_id=$1",
                [catalogId],
              )
            ).rowCount === 1,
          readTitle: async (catalogId) =>
            (
              await reads.query<{ title: string }>(
                "SELECT title FROM catalog_discovery WHERE catalog_id=$1",
                [catalogId],
              )
            ).rows[0]?.title ?? null,
        },
        undefined,
        discovery,
      );
      const q: AuthorListQuery = {
        page: 1,
        pageSize: 20,
        search: "",
        kind: "all",
      };
      const lists = ["following", "followers", "favorites", "likes"] as const;
      type List = (typeof lists)[number];
      const allPublic: AuthorPrivacy = {
        following: "public",
        followers: "public",
        favorites: "public",
        likes: "public",
      };
      const expectedIds: Record<List, string> = {
        following: visitor,
        followers: visitor,
        favorites: catalog,
        likes: work,
      };
      await authors.follow(author, {
        requestId: randomUUID(),
        targetId: visitor,
        enabled: true,
      });
      await authors.follow(visitor, {
        requestId: randomUUID(),
        targetId: author,
        enabled: true,
      });
      await service.relation(author, "favorite", {
        requestId: randomUUID(),
        target: { type: "catalog", id: catalog },
        enabled: true,
      });
      await service.relation(author, "like", {
        requestId: randomUUID(),
        target: { type: "work", id: work },
        enabled: true,
      });
      const readList = async (list: List, viewer: string | null) => {
        if (list === "following" || list === "followers") {
          const page = await authors.listPeople(author, viewer, list, q);
          return { total: page.total, ids: page.items.map((item) => item.id) };
        }
        const page = await service.collection(
          author,
          viewer,
          list === "favorites" ? "favorite" : "like",
          q,
        );
        return {
          total: page.total,
          ids: page.items.map((item) => item.target.id),
        };
      };
      const assertMatrix = async (privacy: AuthorPrivacy) => {
        for (const viewer of [author, visitor, null]) {
          const profile = await service.profile(author, viewer);
          expect(profile.privacy).toEqual(privacy);
          for (const list of lists) {
            const permitted = viewer === author || privacy[list] === "public";
            expect(profile.totals[list]).toBe(permitted ? 1 : null);
            if (permitted)
              expect(await readList(list, viewer)).toEqual({
                total: 1,
                ids: [expectedIds[list]],
              });
            else
              await expect(readList(list, viewer)).rejects.toBeInstanceOf(
                CommunityNotFoundError,
              );
          }
        }
      };
      // Defaults remain meaningful with actual stored relationships, not zero rows.
      await assertMatrix({
        following: "public",
        followers: "public",
        favorites: "private",
        likes: "private",
      });
      await authors.updatePrivacy(author, {
        requestId: randomUUID(),
        privacy: allPublic,
      });
      await assertMatrix(allPublic);
      for (const list of lists) {
        const privacy: AuthorPrivacy = { ...allPublic, [list]: "private" };
        await authors.updatePrivacy(author, {
          requestId: randomUUID(),
          privacy,
        });
        // Exactly one setting changes; the owner retains all four lists while
        // both anonymous and authenticated visitors retain the other three.
        await assertMatrix(privacy);
        if (list === "following")
          expect(
            (await authors.listPeople(visitor, null, "followers", q)).items.map(
              (item) => item.id,
            ),
          ).toEqual([author]);
        if (list === "followers")
          expect(
            (await authors.listPeople(visitor, null, "following", q)).items.map(
              (item) => item.id,
            ),
          ).toEqual([author]);
      }
      await authors.updatePrivacy(author, {
        requestId: randomUUID(),
        privacy: allPublic,
      });
      await assertMatrix(allPublic);
    });

    it("freezes featured order, avoids duplicates and rechecks withdrawal/restoration", async () => {
      await operatorPort.setFeatured(operator, {
        requestId: randomUUID(),
        target: { type: "catalog", id: catalog },
        enabled: true,
        position: 1,
        expectedVersion: 0,
      });
      const q = discoveryQuerySchema.parse({ pageSize: 1 });
      const first = await discovery.browse(visitor, q);
      expect(first.items.map((x) => x.target.id)).toEqual([catalog]);
      expect(first.items[0]?.aliases).toEqual(["独立别名"]);
      expect(
        (await discovery.card({ type: "catalog", id: catalog }, visitor))
          .aliases,
      ).toEqual(["独立别名"]);
      expect(first.hasMore).toBe(true);
      const initial = await authors.readWork(work, author);
      await operatorPort.moderateWork(work, operator, {
        requestId: randomUUID(),
        state: "hidden",
        expectedVersion: initial.version,
      });
      expect(
        (
          await discovery.browse(visitor, {
            ...q,
            sequence: first.sequence,
            after: first.nextAfter,
          })
        ).items,
      ).toEqual([]);
      const hidden = await authors.readWork(work, author);
      await operatorPort.moderateWork(work, operator, {
        requestId: randomUUID(),
        state: "visible",
        expectedVersion: hidden.version,
      });
      const next = await discovery.browse(visitor, {
        ...q,
        sequence: first.sequence,
        after: first.nextAfter,
      });
      expect(next.items.map((x) => x.target.id)).toEqual([work]);
      expect(next.items[0]?.aliases).toEqual([]);
      expect(next.hasMore).toBe(false);
      expect(next.items[0]?.firstPublishedAt).toBe(initial.firstPublishedAt);
      await expect(
        discovery.browse(author, {
          ...q,
          sequence: first.sequence,
          after: first.nextAfter,
        }),
      ).rejects.toBeInstanceOf(CommunityConflictError);
    });
    it("applies OR within and AND across inscription metadata including reserved states", async () => {
      const matching = discoveryQuerySchema.parse({
        kind: "inscription",
        filters: {
          dynasty: ["不存在", "合成乙"],
          textAuthor: ["@unknown"],
          script: ["合成楷书"],
        },
      });
      expect(
        (await discovery.browse(null, matching)).items.map((x) => x.target.id),
      ).toEqual([catalog]);
      expect(
        (
          await discovery.browse(
            null,
            discoveryQuerySchema.parse({
              ...matching,
              filters: { ...matching.filters, originalRegion: ["错误地区"] },
            }),
          )
        ).items,
      ).toEqual([]);
      const options = await discovery.filterOptions();
      expect(options.textAuthor.unknown).toBe(1);
      expect(options.calligrapher.unsupplied).toBe(1);
    });
    it("applies zero, finite and unlimited featured quantities without reordering an existing sequence", async () => {
      const membership = {
        requestId: randomUUID(),
        target: { type: "catalog" as const, id: catalog },
        enabled: true,
        position: 0,
        expectedVersion: 0,
      };
      const saved = await operatorPort.setFeatured(operator, membership);
      expect(await operatorPort.setFeatured(operator, membership)).toEqual(
        saved,
      );
      await expect(
        operatorPort.setFeatured(operator, { ...membership, position: 1 }),
      ).rejects.toBeInstanceOf(CommunityConflictError);
      const q = discoveryQuerySchema.parse({ pageSize: 1 });
      const pinned = await discovery.browse(visitor, q);
      expect(pinned.items[0]?.target.id).toBe(catalog);
      let settings = (
        await operatorPort.readFeatured({ page: 1, pageSize: 20, search: "" })
      ).settingsVersion;
      const zero = {
        requestId: randomUUID(),
        enabledQuantity: 0,
        expectedVersion: settings,
      };
      settings = (await operatorPort.setFeaturedQuantity(operator, zero))
        .version;
      expect((await discovery.browse(visitor, q)).items[0]?.target.id).toBe(
        work,
      );
      expect(
        (
          await discovery.browse(visitor, {
            ...q,
            sequence: pinned.sequence,
            after: pinned.nextAfter,
          })
        ).items[0]?.target.id,
      ).toBe(work);
      await expect(
        operatorPort.setFeaturedQuantity(operator, {
          requestId: randomUUID(),
          enabledQuantity: null,
          expectedVersion: zero.expectedVersion,
        }),
      ).rejects.toBeInstanceOf(CommunityConflictError);
      for (const quantity of [1, null]) {
        settings = (
          await operatorPort.setFeaturedQuantity(operator, {
            requestId: randomUUID(),
            enabledQuantity: quantity,
            expectedVersion: settings,
          })
        ).version;
        expect((await discovery.browse(visitor, q)).items[0]?.target.id).toBe(
          catalog,
        );
      }
    });
    it("bounds expired sequence cleanup and tolerates simultaneous first-page readers", async () => {
      const expired = Array.from({ length: 205 }, () => randomUUID());
      await pool.query(
        "INSERT INTO community.discovery_sequences(id,query,created_at) SELECT id::uuid,'{}'::jsonb,CURRENT_TIMESTAMP-INTERVAL '25 hours' FROM unnest($1::text[]) id",
        [expired],
      );
      await discovery.browse(null, discoveryQuerySchema.parse({}));
      expect(
        Number(
          (
            await pool.query(
              "SELECT COUNT(*) AS n FROM community.discovery_sequences WHERE id=ANY($1::uuid[])",
              [expired],
            )
          ).rows[0].n,
        ),
      ).toBe(105);
      const pages = await Promise.all([
        discovery.browse(visitor, discoveryQuerySchema.parse({})),
        discovery.browse(visitor, discoveryQuerySchema.parse({})),
      ]);
      for (const page of pages)
        expect(new Set(page.items.map((x) => x.target.id))).toEqual(
          new Set([work, catalog]),
        );
      expect(pages[0]?.sequence).not.toBe(pages[1]?.sequence);
    });
    it.each(["content_operator_events", "content_operator_receipts"])(
      "rolls back featured membership and settings when %s fails",
      async (table) => {
        const trigger = `phase4_featured_fail_${randomUUID().replaceAll("-", "")}`;
        const before = await operatorPort.readFeatured({
          page: 1,
          pageSize: 20,
          search: "",
        });
        await pool.query(
          `CREATE FUNCTION ${schema}.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic transaction failure'; END $$;CREATE TRIGGER ${trigger} BEFORE INSERT ON community.${table} FOR EACH ROW EXECUTE FUNCTION ${schema}.${trigger}()`,
        );
        try {
          await expect(
            operatorPort.setFeatured(operator, {
              requestId: randomUUID(),
              target: { type: "work", id: work },
              enabled: true,
              position: 0,
              expectedVersion: 0,
            }),
          ).rejects.toThrow();
          await expect(
            operatorPort.setFeaturedQuantity(operator, {
              requestId: randomUUID(),
              enabledQuantity: 0,
              expectedVersion: before.settingsVersion,
            }),
          ).rejects.toThrow();
          expect(
            await operatorPort.readFeatured({
              page: 1,
              pageSize: 20,
              search: "",
            }),
          ).toEqual(before);
        } finally {
          await pool.query(
            `DROP TRIGGER ${trigger} ON community.${table};DROP FUNCTION ${schema}.${trigger}()`,
          );
        }
      },
    );
    it.each(["moderation_events", "discussion_command_receipts"])(
      "rolls back both deletion scopes when %s fails",
      async (table) => {
        const target = { type: "work" as const, id: work };
        const root = await comments.submitDiscussion(
          target,
          author,
          "保留根原文",
        );
        await comments.submitDiscussion(
          target,
          visitor,
          "保留回复原文",
          root.id,
        );
        const trigger = `phase4_delete_fail_${randomUUID().replaceAll("-", "")}`;
        await pool.query(
          `CREATE FUNCTION ${schema}.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic transaction failure'; END $$;CREATE TRIGGER ${trigger} BEFORE INSERT ON community.${table} FOR EACH ROW EXECUTE FUNCTION ${schema}.${trigger}()`,
        );
        try {
          await expect(
            comments.operatorDeleteBody(operator, root.id, randomUUID()),
          ).rejects.toThrow();
          await expect(
            comments.removeDiscussionThread(operator, root.id, randomUUID(), 2),
          ).rejects.toThrow();
          expect(
            (
              await comments.readDiscussion(target, author, {
                page: 1,
                pageSize: 10,
              })
            ).items[0]?.text,
          ).toBe("保留根原文");
          expect(
            (await comments.ownComments(visitor, { page: 1, pageSize: 10 }))
              .items[0]?.text,
          ).toBe("保留回复原文");
          expect(
            (
              await pool.query(
                "SELECT 1 FROM community.moderation_events WHERE operator_label=$1",
                [operator],
              )
            ).rowCount,
          ).toBe(0);
        } finally {
          await pool.query(
            `DROP TRIGGER ${trigger} ON community.${table};DROP FUNCTION ${schema}.${trigger}()`,
          );
        }
      },
    );
    it("filters a blocked featured author and retains unavailable favorite relations", async () => {
      await operatorPort.setFeatured(operator, {
        requestId: randomUUID(),
        target: { type: "work", id: work },
        enabled: true,
        position: 0,
        expectedVersion: 0,
      });
      await authors.changeRelation(visitor, "favorite", {
        requestId: randomUUID(),
        target: { type: "work", id: work },
        enabled: true,
      });
      await authors.block(visitor, {
        requestId: randomUUID(),
        targetId: author,
        enabled: true,
      });
      expect(
        (
          await discovery.browse(visitor, discoveryQuerySchema.parse({}))
        ).items.map((x) => x.target.id),
      ).toEqual([catalog]);
      expect(
        (
          await discovery.collection(visitor, visitor, "favorite", {
            page: 1,
            pageSize: 20,
            search: "",
            kind: "all",
          })
        ).items,
      ).toEqual([]);
      await authors.block(visitor, {
        requestId: randomUUID(),
        targetId: author,
        enabled: false,
      });
      expect(
        (
          await discovery.collection(visitor, visitor, "favorite", {
            page: 1,
            pageSize: 20,
            search: "",
            kind: "all",
          })
        ).items.map((x) => x.target.id),
      ).toEqual([work]);
    });
    it.each(["content_operator_events", "content_operator_receipts"])(
      "rolls back work state when %s cannot commit and replays one receipt",
      async (table) => {
        const command = {
          requestId: randomUUID(),
          state: "hidden" as const,
          expectedVersion: 1,
        };
        const trigger = `phase4_fail_${randomUUID().replaceAll("-", "")}`;
        await pool.query(
          `CREATE FUNCTION ${schema}.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic transaction failure'; END $$;CREATE TRIGGER ${trigger} BEFORE INSERT ON community.${table} FOR EACH ROW EXECUTE FUNCTION ${schema}.${trigger}()`,
        );
        try {
          await expect(
            operatorPort.moderateWork(work, operator, command),
          ).rejects.toThrow();
          expect((await authors.readWork(work, author)).version).toBe(1);
          expect(
            (
              await pool.query(
                "SELECT 1 FROM community.content_operator_events WHERE operator_label=$1",
                [operator],
              )
            ).rowCount,
          ).toBe(0);
        } finally {
          await pool.query(
            `DROP TRIGGER ${trigger} ON community.${table};DROP FUNCTION ${schema}.${trigger}()`,
          );
        }
        const changed = await operatorPort.moderateWork(
          work,
          operator,
          command,
        );
        expect(changed.state).toBe("hidden");
        expect(
          await operatorPort.moderateWork(work, operator, command),
        ).toEqual(changed);
        expect(
          (
            await pool.query(
              "SELECT 1 FROM community.content_operator_events WHERE operator_label=$1",
              [operator],
            )
          ).rowCount,
        ).toBe(1);
      },
    );
    it("rejects a stale whole-thread confirmation without deleting new replies", async () => {
      const root = await comments.submitDiscussion(
        { type: "work", id: work },
        author,
        "根评论",
      );
      await comments.submitDiscussion(
        { type: "work", id: work },
        visitor,
        "新回复",
        root.id,
      );
      await expect(
        comments.removeDiscussionThread(operator, root.id, randomUUID(), 1),
      ).rejects.toBeInstanceOf(CommunityConflictError);
      expect(
        (
          await comments.readDiscussionReplies(
            { type: "work", id: work },
            root.id,
            visitor,
            { page: 1, pageSize: 10 },
          )
        ).items,
      ).toHaveLength(1);
      const receipt = randomUUID();
      expect(
        await comments.removeDiscussionThread(operator, root.id, receipt, 2),
      ).toEqual({ removed: 2 });
      expect(
        await comments.removeDiscussionThread(operator, root.id, receipt, 2),
      ).toEqual({ removed: 2 });
      expect(
        (await comments.ownComments(visitor, { page: 1, pageSize: 10 })).items,
      ).toEqual([]);
    });
  });
};
