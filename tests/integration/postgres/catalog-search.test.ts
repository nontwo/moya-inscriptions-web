import path from "node:path";
import { fileURLToPath } from "node:url";

import { CatalogQueryUnavailableError } from "@moya/api";
import {
  closePostgresPool,
  createPostgresPool,
  parsePostgresConfig,
  PostgresCatalogQueryAdapter,
  rebuildCatalogSearchDocuments,
  refreshCatalogSearchDocument,
  runMigrations,
} from "@moya/catalog-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined)
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL tests");
const schema = "p203_search_v1";
const administration = createPostgresPool(
  parsePostgresConfig({ DATABASE_URL: testDatabaseUrl }),
);
const isolated = new URL(testDatabaseUrl);
isolated.searchParams.set("options", `-c search_path=${schema}`);
const pool = createPostgresPool(
  parsePostgresConfig({ DATABASE_URL: isolated.toString() }),
);
const adapter = new PostgresCatalogQueryAdapter(pool);
const migrations = path.join(
  fileURLToPath(new URL("../../../", import.meta.url)),
  "database",
  "migrations",
);
const search = (
  q: string,
  page = 1,
  pageSize = 20,
  kind?: "inscription" | "calligraphy",
) =>
  adapter.search({
    q,
    page,
    pageSize,
    ...(kind === undefined ? {} : { kind }),
  });
const insert = async (id: string, title: string, kind = "calligraphy") => {
  await pool.query(
    "INSERT INTO catalog_entries(catalog_id,title,kind) VALUES($1,$2,$3)",
    [id, title, kind],
  );
};

beforeAll(async () => {
  await administration.query(`CREATE SCHEMA ${schema}`);
  await runMigrations(pool, migrations);
});
beforeEach(async () => {
  await pool.query("TRUNCATE catalog_entries CASCADE");
});
afterAll(async () => {
  await closePostgresPool(pool);
  await administration.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await closePostgresPool(administration);
});

describe("Catalog Search V1 PostgreSQL behavior (fictional fixtures)", () => {
  it("uses C collation to break equal-tier ties across page boundaries", async () => {
    for (const id of ["synthetic-a", "synthetic-B", "synthetic-1"]) {
      await insert(id, "同名合成样本");
    }
    await rebuildCatalogSearchDocuments(pool);
    expect(
      [
        ...(await search("同名合成样本", 1, 2)).items,
        ...(await search("同名合成样本", 2, 2)).items,
      ].map(({ id }) => id),
    ).toEqual(["synthetic-1", "synthetic-B", "synthetic-a"]);
  });

  it("ranks the complete result set before deterministic pagination", async () => {
    // Exact results deliberately have later IDs than lower-tier matches.
    await insert("synthetic-f-title", "雲嶺記");
    await insert("synthetic-e-alias", "别名测试");
    await insert("synthetic-d-normalized", "云岭记");
    await insert("synthetic-c-partial", "雲嶺記附錄");
    await insert("synthetic-b-structured", "结构资料测试");
    await insert("synthetic-a-body", "正文测试", "inscription");
    await pool.query(
      "INSERT INTO catalog_aliases(catalog_id,position,alias) VALUES($1,0,$2)",
      ["synthetic-e-alias", "雲嶺記"],
    );
    await pool.query(
      "INSERT INTO catalog_contributors(catalog_id,position,name,role) VALUES($1,0,$2,'calligrapher')",
      ["synthetic-b-structured", "雲嶺記"],
    );
    await pool.query(
      "UPDATE catalog_entries SET description=$2 WHERE catalog_id=$1",
      ["synthetic-a-body", "合成正文中有雲嶺記"],
    );
    expect(await rebuildCatalogSearchDocuments(pool)).toBe(6);
    const expected = [
      "title-exact",
      "alias-exact",
      "normalized-exact",
      "title-alias-partial",
      "structured",
      "body",
    ];
    const pageOne = await search("雲嶺記", 1, 2);
    const pageTwo = await search("雲嶺記", 2, 2);
    const pageThree = await search("雲嶺記", 3, 2);
    expect(
      [...pageOne.items, ...pageTwo.items, ...pageThree.items].map(
        ({ matchKind }) => matchKind,
      ),
    ).toEqual(expected);
    expect(pageOne).toMatchObject({
      total: 6,
      page: 1,
      pageSize: 2,
      totalPages: 3,
    });
    expect((await search("雲嶺記", 4, 2)).items).toEqual([]);
    expect(
      (await search("雲嶺記", 1, 20, "inscription")).items.map(({ id }) => id),
    ).toEqual(["synthetic-a-body"]);
    expect(await search("雲嶺記", 2, 2)).toEqual(pageTwo);
  });

  it("uses same-record whitespace AND and literal wildcard punctuation", async () => {
    await insert("synthetic-and", "合成书谱");
    await insert("synthetic-other", "其他测试");
    await insert("synthetic-literal", "合成100%_\\记");
    await pool.query(
      "INSERT INTO catalog_contributors(catalog_id,position,name,role) VALUES($1,0,$2,'calligrapher')",
      ["synthetic-and", "虚构作者甲"],
    );
    await pool.query(
      "UPDATE catalog_entries SET dynasty='拟青朝',dynasty_state='VALUE',description='合成溪声入纸' WHERE catalog_id=$1",
      ["synthetic-and"],
    );
    await rebuildCatalogSearchDocuments(pool);
    expect(
      (await search("虚构作者甲\t書譜\n拟青朝")).items.map(
        ({ id, matchKind }) => [id, matchKind],
      ),
    ).toEqual([["synthetic-and", "structured"]]);
    expect((await search("书谱 溪声")).items[0]?.matchKind).toBe("body");
    expect((await search("虚构作者甲 其他测试")).items).toEqual([]);
    for (const q of ["%", "_", "\\", "100%_\\"]) {
      expect((await search(q)).items.map(({ id }) => id)).toEqual([
        "synthetic-literal",
      ]);
    }
    expect((await search("' OR true --")).items).toEqual([]);
  });

  it("copies only supplied searchable fields and keeps unsupported variants truthful", async () => {
    await insert("synthetic-visible", "祭姪文稿合成样本");
    await pool.query(
      `UPDATE catalog_entries SET
      script_style='合成行草',script_style_state='VALUE',
      current_custodian='合成收藏单位',current_custodian_state='VALUE',
      transcription='合成释文溪光映纸',transcription_state='VALUE',
      historical_context='排除背景暗号',historical_context_state='VALUE',
      scholarly_research='排除研究暗号',scholarly_research_state='VALUE'
      WHERE catalog_id=$1`,
      ["synthetic-visible"],
    );
    await rebuildCatalogSearchDocuments(pool);
    for (const q of ["行草", "收藏单位", "溪光映纸"])
      expect((await search(q)).total).toBe(1);
    for (const q of ["排除背景暗号", "排除研究暗号", "UNSUPPLIED", "祭侄文稿"])
      expect((await search(q)).total).toBe(0);
    const stored = await pool.query("SELECT * FROM catalog_search_documents");
    expect(Object.keys(stored.rows[0]).sort()).toEqual([
      "aliases",
      "catalog_id",
      "combined_text",
      "normalization_version",
      "normalized_aliases",
      "normalized_title",
      "structured_text",
      "title",
      "title_alias_text",
    ]);
    expect(JSON.stringify(stored.rows)).not.toContain("排除");
    await pool.query(
      "UPDATE catalog_entries SET transcription=NULL,transcription_state='CLEAR' WHERE catalog_id=$1",
      ["synthetic-visible"],
    );
    await rebuildCatalogSearchDocuments(pool);
    expect((await search("溪光映纸")).total).toBe(0);
  });

  it("fails closed for missing/stale copies and rebuilds without changing original rows", async () => {
    await insert("synthetic-invalidation", "原文雲嶺");
    await expect(search("雲嶺")).rejects.toBeInstanceOf(
      CatalogQueryUnavailableError,
    );
    const before = await pool.query(
      "SELECT * FROM catalog_entries ORDER BY catalog_id",
    );
    await rebuildCatalogSearchDocuments(pool);
    expect(
      (await pool.query("SELECT * FROM catalog_entries ORDER BY catalog_id"))
        .rows,
    ).toEqual(before.rows);
    await pool.query(
      "UPDATE catalog_search_documents SET normalization_version='synthetic-obsolete'",
    );
    await expect(search("雲嶺")).rejects.toBeInstanceOf(
      CatalogQueryUnavailableError,
    );
    await rebuildCatalogSearchDocuments(pool);
    await pool.query(
      "UPDATE catalog_entries SET title='替换标题' WHERE catalog_id=$1",
      ["synthetic-invalidation"],
    );
    await expect(search("雲嶺")).rejects.toBeInstanceOf(
      CatalogQueryUnavailableError,
    );
    await rebuildCatalogSearchDocuments(pool);
    expect((await search("雲嶺")).total).toBe(0);
    expect((await search("替换标题")).total).toBe(1);
    await pool.query(
      "INSERT INTO catalog_aliases(catalog_id,position,alias) VALUES($1,0,'新增别名')",
      ["synthetic-invalidation"],
    );
    await expect(search("新增别名")).rejects.toBeInstanceOf(
      CatalogQueryUnavailableError,
    );
    await rebuildCatalogSearchDocuments(pool);
    await pool.query("TRUNCATE catalog_aliases");
    await expect(search("新增别名")).rejects.toBeInstanceOf(
      CatalogQueryUnavailableError,
    );
    await rebuildCatalogSearchDocuments(pool);
    await pool.query(
      "INSERT INTO catalog_contributors(catalog_id,position,name,role) VALUES($1,0,'新增合成人物','calligrapher')",
      ["synthetic-invalidation"],
    );
    await expect(search("新增合成人物")).rejects.toBeInstanceOf(
      CatalogQueryUnavailableError,
    );
    await rebuildCatalogSearchDocuments(pool);
    expect((await search("新增合成人物")).total).toBe(1);
    await pool.query("DELETE FROM catalog_contributors WHERE catalog_id=$1", [
      "synthetic-invalidation",
    ]);
    await expect(search("新增合成人物")).rejects.toBeInstanceOf(
      CatalogQueryUnavailableError,
    );
    await rebuildCatalogSearchDocuments(pool);
    await pool.query("DELETE FROM catalog_entries WHERE catalog_id=$1", [
      "synthetic-invalidation",
    ]);
    expect((await search("替换标题")).total).toBe(0);
  });

  it("shares the caller transaction for refresh and rollback", async () => {
    await insert("synthetic-transaction", "旧标题");
    await rebuildCatalogSearchDocuments(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE catalog_entries SET title='新标题' WHERE catalog_id=$1",
        ["synthetic-transaction"],
      );
      await refreshCatalogSearchDocument(client, "synthetic-transaction");
      expect((await search("旧标题")).total).toBe(1);
      expect((await search("新标题")).total).toBe(0);
      await client.query("ROLLBACK");
      expect((await search("旧标题")).total).toBe(1);
      await client.query("BEGIN");
      await client.query(
        "UPDATE catalog_entries SET title='新标题' WHERE catalog_id=$1",
        ["synthetic-transaction"],
      );
      await refreshCatalogSearchDocument(client, "synthetic-transaction");
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    expect((await search("旧标题")).total).toBe(0);
    expect((await search("新标题")).total).toBe(1);
  });

  it("does not retain a valid stale document when concurrent alias removal waits for refresh", async () => {
    await insert("synthetic-concurrent", "并发旧标题");
    await pool.query(
      "INSERT INTO catalog_aliases(catalog_id,position,alias) VALUES($1,0,'并发旧别名')",
      ["synthetic-concurrent"],
    );
    await rebuildCatalogSearchDocuments(pool);
    const first = await pool.connect();
    const second = await pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await first.query("BEGIN");
      await second.query("BEGIN");
      const pid = (await second.query("SELECT pg_backend_pid() AS pid")).rows[0]
        ?.pid;
      await first.query(
        "UPDATE catalog_entries SET title='并发新标题' WHERE catalog_id=$1",
        ["synthetic-concurrent"],
      );
      pending = second.query(
        "DELETE FROM catalog_aliases WHERE catalog_id=$1",
        ["synthetic-concurrent"],
      );
      // Verify the precise blocked-writer schedule rather than relying on a delay.
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const state = await pool.query(
          "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
          [pid],
        );
        if (state.rows[0]?.wait_event_type === "Lock") {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await refreshCatalogSearchDocument(first, "synthetic-concurrent");
      await first.query("COMMIT");
      await pending;
      await second.query("COMMIT");
      await expect(search("并发旧别名")).rejects.toBeInstanceOf(
        CatalogQueryUnavailableError,
      );
      await rebuildCatalogSearchDocuments(pool);
      expect((await search("并发旧别名")).total).toBe(0);
    } finally {
      await first.query("ROLLBACK");
      await pending?.catch(() => undefined);
      await second.query("ROLLBACK");
      first.release();
      second.release();
    }
  });

  it("serializes a refresh without a source write against a concurrent alias update", async () => {
    await insert("synthetic-refresh-only", "无源写入刷新测试");
    await pool.query(
      "INSERT INTO catalog_aliases(catalog_id,position,alias) VALUES($1,0,'刷新旧别名')",
      ["synthetic-refresh-only"],
    );
    await rebuildCatalogSearchDocuments(pool);
    const first = await pool.connect();
    const second = await pool.connect();
    let sourceRead: (() => void) | undefined;
    let releaseRead: (() => void) | undefined;
    const readCompleted = new Promise<void>((resolve) => {
      sourceRead = resolve;
    });
    const continueRefresh = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let pendingRefresh: Promise<void> | undefined;
    let pendingUpdate: Promise<unknown> | undefined;
    try {
      await first.query("BEGIN");
      const pid = (await second.query("SELECT pg_backend_pid() AS pid")).rows[0]
        ?.pid;
      const pausedSourceClient = new Proxy(first, {
        get(target, property) {
          if (property !== "query") return Reflect.get(target, property);
          return async (...args: unknown[]) => {
            const result = await Reflect.apply(target.query, target, args);
            if (
              typeof args[0] === "string" &&
              args[0].includes("SELECT entry.catalog_id, entry.title")
            ) {
              sourceRead?.();
              await continueRefresh;
            }
            return result;
          };
        },
      });
      pendingRefresh = refreshCatalogSearchDocument(
        pausedSourceClient,
        "synthetic-refresh-only",
      );
      await readCompleted;
      let completed = false;
      pendingUpdate = second.query(
        "UPDATE catalog_aliases SET alias='刷新新别名' WHERE catalog_id=$1",
        ["synthetic-refresh-only"],
      );
      void pendingUpdate.then(
        () => {
          completed = true;
        },
        () => {
          completed = true;
        },
      );
      let reachedSchedule = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const state = await pool.query(
          "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
          [pid],
        );
        if (completed || state.rows[0]?.wait_event_type === "Lock") {
          reachedSchedule = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(reachedSchedule).toBe(true);
      releaseRead?.();
      await pendingRefresh;
      await first.query("COMMIT");
      await pendingUpdate;
      await expect(search("刷新旧别名")).rejects.toBeInstanceOf(
        CatalogQueryUnavailableError,
      );
      await rebuildCatalogSearchDocuments(pool);
      expect((await search("刷新新别名")).total).toBe(1);
      expect((await search("刷新旧别名")).total).toBe(0);
    } finally {
      releaseRead?.();
      await pendingRefresh?.catch(() => undefined);
      await first.query("ROLLBACK");
      await pendingUpdate?.catch(() => undefined);
      first.release();
      second.release();
    }
  });

  it("keeps search read-only and follows the current database role's visible Catalog set", async () => {
    await insert("synthetic-visible", "可见边界测试");
    await insert("synthetic-hidden", "隐藏边界测试");
    await rebuildCatalogSearchDocuments(pool);
    const role = `p203_search_reader_${process.pid}`;
    await administration.query(`CREATE ROLE ${role} NOLOGIN`);
    let reader: ReturnType<typeof createPostgresPool> | undefined;
    try {
      await administration.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
      await pool.query(
        `GRANT SELECT ON catalog_entries, catalog_aliases, catalog_media, catalog_search_documents TO ${role}`,
      );
      // Synthetic RLS exists only in this isolated test: V1 adds no ACL model.
      await pool.query("ALTER TABLE catalog_entries ENABLE ROW LEVEL SECURITY");
      await pool.query(
        `CREATE POLICY synthetic_catalog_visibility ON catalog_entries TO ${role} USING (catalog_id <> 'synthetic-hidden')`,
      );
      const readerUrl = new URL(testDatabaseUrl);
      readerUrl.searchParams.set(
        "options",
        `-c search_path=${schema} -c role=${role}`,
      );
      reader = createPostgresPool(
        parsePostgresConfig({ DATABASE_URL: readerUrl.toString() }),
      );
      const readerAdapter = new PostgresCatalogQueryAdapter(reader);
      expect(
        (
          await readerAdapter.search({ q: "边界测试", page: 1, pageSize: 20 })
        ).items.map(({ id }) => id),
      ).toEqual(["synthetic-visible"]);
      // A missing hidden document must not bypass or enlarge that visible set.
      await pool.query(
        "DELETE FROM catalog_search_documents WHERE catalog_id='synthetic-hidden'",
      );
      expect(
        (await readerAdapter.search({ q: "隐藏", page: 1, pageSize: 20 }))
          .total,
      ).toBe(0);
      await expect(
        reader.query("DELETE FROM catalog_search_documents"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      if (reader !== undefined) await closePostgresPool(reader);
      await pool.query(
        "DROP POLICY IF EXISTS synthetic_catalog_visibility ON catalog_entries",
      );
      await pool.query(
        "ALTER TABLE catalog_entries DISABLE ROW LEVEL SECURITY",
      );
      await administration.query(`DROP OWNED BY ${role}`);
      await administration.query(`DROP ROLE ${role}`);
    }
  });
});
