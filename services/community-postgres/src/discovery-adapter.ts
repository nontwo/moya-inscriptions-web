import { asCommunityOperationError } from "./availability.js";
import { randomUUID } from "node:crypto";
import { CommunityNotFoundError, CommunityConflictError } from "@moya/api";
import type { CommunityDiscoveryPort, DiscoveryCardRecord } from "@moya/api";
import type {
  AuthorListQuery,
  ContentIdentity,
  DiscoveryQuery,
  InscriptionFilterOptions,
  MediaId,
} from "@moya/contracts";
import type { Pool, PoolClient, QueryResultRow } from "pg";
/** App-role SELECT is granted only on published Catalog projections, never Payload tables. */
const eligible = `WITH eligible AS (
 SELECT 'catalog'::text AS content_type,c.catalog_id AS content_id,c.kind,c.title,c.aliases,c.first_published_at,NULL::text AS author_id,c.filter_metadata
 FROM catalog_discovery c
 UNION ALL
 SELECT 'work',w.id,NULL,w.title,ARRAY[]::varchar[],w.first_published_at,w.author_id,'{}'::jsonb FROM community.works w
 JOIN community.public_users u ON u.id=w.author_id WHERE w.deleted_at IS NULL AND w.operator_state='visible' AND u.status='active' AND community.accounts_can_interact($1,w.author_id)
)`;
const filter = `($2='all' OR e.kind=$2) AND ($3='' OR position(lower($3) IN lower(e.title||' '||array_to_string(e.aliases,' ')))>0)
 AND NOT EXISTS(SELECT 1 FROM jsonb_each($4::jsonb) f WHERE jsonb_array_length(f.value)>0 AND NOT (
 (e.filter_metadata->f.key->'values') ?| ARRAY(SELECT jsonb_array_elements_text(f.value))
 OR (f.value ? '@unknown' AND e.filter_metadata->f.key->>'state'='UNKNOWN')
 OR (f.value ? '@unsupplied' AND e.filter_metadata->f.key->>'state'='UNSUPPLIED')
 ))`;
interface CardRow extends QueryResultRow {
  content_type: "catalog" | "work";
  content_id: string;
  kind: "inscription" | "calligraphy" | null;
  title: string;
  author_id: string | null;
  first_published_at: Date | null;
  ordinal?: string;
}
const emptyFilters = {
  dynasty: [],
  textAuthor: [],
  calligrapher: [],
  originalRegion: [],
  script: [],
};
const queryIdentity = (q: DiscoveryQuery) => ({
  kind: q.kind,
  filters: q.filters,
  search: q.search,
  pageSize: q.pageSize,
});
export class PostgresCommunityDiscoveryAdapter implements CommunityDiscoveryPort {
  constructor(private readonly pool: Pool) {}
  private async run<T>(
    write: boolean,
    fn: (db: PoolClient) => Promise<T>,
  ): Promise<T> {
    const db = await this.pool.connect().catch((error) => {
      throw asCommunityOperationError(error, "connect");
    });
    try {
      await db.query(
        write
          ? "BEGIN ISOLATION LEVEL REPEATABLE READ"
          : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      const result = await fn(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw asCommunityOperationError(error, "query");
    } finally {
      db.release();
    }
  }
  private async project(
    db: PoolClient,
    rows: readonly CardRow[],
  ): Promise<DiscoveryCardRecord[]> {
    const catalogs = rows
        .filter((r) => r.content_type === "catalog")
        .map((r) => r.content_id),
      works = rows
        .filter((r) => r.content_type === "work")
        .map((r) => r.content_id);
    const cm = (
      await db.query<{
        catalog_id: string;
        media_id: MediaId;
        object_key: string;
        width: number;
        height: number;
      }>(
        "SELECT catalog_id,media_id,object_key,width,height FROM catalog_media WHERE catalog_id=ANY($1::text[]) AND is_representative",
        [catalogs],
      )
    ).rows;
    const wm = (
      await db.query<{
        work_id: string;
        id: string;
        width: number;
        height: number;
      }>(
        "SELECT w.id AS work_id,m.id,m.width,m.height FROM community.works w JOIN community.user_media m ON m.id=w.media_ids[1] AND m.owner_id=w.author_id WHERE w.id=ANY($1::text[])",
        [works],
      )
    ).rows;
    return rows.map((r) => {
      const c = cm.find((m) => m.catalog_id === r.content_id),
        w = wm.find((m) => m.work_id === r.content_id);
      return {
        target: { type: r.content_type, id: r.content_id },
        title: r.title,
        kind: r.kind,
        authorId: r.author_id,
        firstPublishedAt: r.first_published_at?.toISOString() ?? null,
        media:
          r.content_type === "catalog"
            ? c
              ? {
                  type: "catalog",
                  id: c.media_id,
                  objectKey: c.object_key,
                  width: c.width,
                  height: c.height,
                }
              : null
            : w
              ? { type: "work", id: w.id, width: w.width, height: w.height }
              : null,
      };
    });
  }
  async browse(viewer: string | null, q: DiscoveryQuery) {
    // Bounded maintenance in its own READ COMMITTED statement. A concurrent
    // cleanup can wait for deletion without invalidating a browsing snapshot.
    if (!q.sequence)
      await this.pool
        .query(`DELETE FROM community.discovery_sequences WHERE id IN (
      SELECT id FROM community.discovery_sequences WHERE created_at<CURRENT_TIMESTAMP-INTERVAL '24 hours'
      ORDER BY created_at,id LIMIT 100
    )`);
    return this.run(true, async (db) => {
      const sequence = q.sequence ?? randomUUID(),
        fingerprint = JSON.stringify(queryIdentity(q));
      if (q.sequence) {
        const state = (
          await db.query<{ query: unknown }>(
            "SELECT query FROM community.discovery_sequences WHERE id=$1 AND viewer_id IS NOT DISTINCT FROM $2::text AND created_at>CURRENT_TIMESTAMP-INTERVAL '24 hours'",
            [sequence, viewer],
          )
        ).rows[0];
        if (
          !state ||
          JSON.stringify(state.query) !==
            JSON.stringify(JSON.parse(fingerprint))
        ) {
          // JSONB sorts object keys; compare JSONB rather than JavaScript serialization below.
          const matches =
            state &&
            (
              await db.query("SELECT $1::jsonb=$2::jsonb AS equal", [
                JSON.stringify(state.query),
                fingerprint,
              ])
            ).rows[0]?.equal;
          if (!matches)
            throw new CommunityConflictError(
              "This browsing sequence expired or belongs to another view; refresh to continue",
            );
        }
      } else {
        if (q.after !== 0)
          throw new CommunityConflictError("A new sequence starts at the top");
        await db.query(
          "INSERT INTO community.discovery_sequences(id,viewer_id,query) VALUES($1,$2,$3::jsonb)",
          [sequence, viewer, fingerprint],
        );
        await db.query(
          `${eligible}, filtered AS (SELECT e.* FROM eligible e WHERE ${filter}), featured AS (
      SELECT f.content_type,f.content_id,row_number() OVER(ORDER BY f.position,f.content_type,f.content_id) AS featured_order
      FROM community.featured_content f JOIN filtered e USING(content_type,content_id) WHERE f.enabled
      ORDER BY f.position,f.content_type,f.content_id LIMIT (SELECT enabled_quantity FROM community.featured_settings WHERE id=TRUE)
     ), ordered AS (SELECT e.content_type,e.content_id,row_number() OVER(ORDER BY (f.featured_order IS NULL),f.featured_order,e.first_published_at DESC NULLS LAST,e.content_type,e.content_id) AS ordinal
      FROM filtered e LEFT JOIN featured f USING(content_type,content_id))
     INSERT INTO community.discovery_sequence_items(sequence_id,ordinal,content_type,content_id) SELECT $5::uuid,ordinal,content_type,content_id FROM ordered`,
          [viewer, q.kind, q.search, JSON.stringify(q.filters), sequence],
        );
      }
      // Sequence membership and order stay fixed; live eligibility suppresses withdrawals.
      const rows = (
        await db.query<CardRow>(
          `${eligible} SELECT e.*,s.ordinal FROM community.discovery_sequence_items s JOIN eligible e USING(content_type,content_id)
    WHERE ${filter} AND s.sequence_id=$5 AND s.ordinal>$6 ORDER BY s.ordinal LIMIT $7`,
          [
            viewer,
            q.kind,
            q.search,
            JSON.stringify(q.filters),
            sequence,
            q.after,
            q.pageSize + 1,
          ],
        )
      ).rows;
      const page = rows.slice(0, q.pageSize),
        nextAfter = Number(page.at(-1)?.ordinal ?? q.after);
      return {
        items: await this.project(db, page),
        sequence,
        nextAfter,
        hasMore: rows.length > q.pageSize,
      };
    });
  }
  async collection(
    owner: string,
    viewer: string | null,
    list: "favorite" | "like",
    q: AuthorListQuery,
  ) {
    return this.run(false, async (db) => {
      const privacyColumn =
        list === "favorite" ? "favorites_privacy" : "likes_privacy";
      if (
        (
          await db.query(
            `SELECT id FROM community.public_users WHERE id=$1 AND status='active' AND community.accounts_can_interact($2,id) AND (id=$2 OR ${privacyColumn}='public')`,
            [owner, viewer],
          )
        ).rowCount !== 1
      )
        throw new CommunityNotFoundError();
      const from = `FROM eligible e JOIN community.content_relations r ON r.content_type=e.content_type AND r.content_id=e.content_id WHERE ${filter} AND r.user_id=$5 AND r.relation=$6`,
        args = [
          viewer,
          q.kind,
          q.search,
          JSON.stringify(emptyFilters),
          owner,
          list,
        ];
      const total = Number(
        (await db.query(`${eligible} SELECT count(*) AS n ${from}`, args))
          .rows[0]?.n ?? 0,
      );
      const rows = (
        await db.query<CardRow>(
          `${eligible} SELECT e.* ${from} ORDER BY r.created_at DESC,e.content_type,e.content_id LIMIT $7 OFFSET $8`,
          [...args, q.pageSize, (q.page - 1) * q.pageSize],
        )
      ).rows;
      return {
        items: await this.project(db, rows),
        total,
        page: q.page,
        pageSize: q.pageSize,
      };
    });
  }
  async card(target: ContentIdentity, viewer: string | null) {
    return this.run(false, async (db) => {
      const rows = (
        await db.query<CardRow>(
          `${eligible} SELECT e.* FROM eligible e WHERE content_type=$2 AND content_id=$3`,
          [viewer, target.type, target.id],
        )
      ).rows;
      const item = (await this.project(db, rows))[0];
      if (!item) throw new CommunityNotFoundError();
      return item;
    });
  }
  async state(target: ContentIdentity, actor: string) {
    return this.run(false, async (db) => {
      const rows = (
        await db.query<{ relation: string }>(
          "SELECT relation FROM community.content_relations WHERE user_id=$1 AND content_type=$2 AND content_id=$3",
          [actor, target.type, target.id],
        )
      ).rows;
      return {
        favorite: rows.some((r) => r.relation === "favorite"),
        liked: rows.some((r) => r.relation === "like"),
      };
    });
  }
  async filterOptions(): Promise<InscriptionFilterOptions> {
    return this.run(false, async (db) => {
      const result: Record<
        string,
        { values: string[]; unknown: number; unsupplied: number }
      > = {};
      for (const dimension of Object.keys(emptyFilters)) {
        const rows = (
          await db.query<{ value: string }>(
            "SELECT DISTINCT jsonb_array_elements_text(filter_metadata->$1->'values') AS value FROM catalog_discovery WHERE kind='inscription' ORDER BY value",
            [dimension],
          )
        ).rows;
        const counts = (
          await db.query(
            "SELECT count(*) FILTER(WHERE filter_metadata->$1->>'state'='UNKNOWN') AS unknown,count(*) FILTER(WHERE filter_metadata->$1->>'state'='UNSUPPLIED') AS unsupplied FROM catalog_discovery WHERE kind='inscription'",
            [dimension],
          )
        ).rows[0];
        result[dimension] = {
          values: rows.map((r) => r.value),
          unknown: Number(counts?.unknown ?? 0),
          unsupplied: Number(counts?.unsupplied ?? 0),
        };
      }
      return result as InscriptionFilterOptions;
    });
  }
}
