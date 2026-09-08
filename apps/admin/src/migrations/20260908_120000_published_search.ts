import {
  sql,
  type MigrateDownArgs,
  type MigrateUpArgs,
} from "@payloadcms/db-postgres";

import {
  createPublishedCatalogSearchSql,
  synchronizePublishedCatalogSearch,
  upgradePublishedCatalogSearchViewSql,
} from "../published/search";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Hold writes until the derived table and every existing publication are
  // available together. A failed OpenCC projection rolls back this migration.
  await db.execute(
    sql`LOCK TABLE catalogs, catalogs_aliases, catalogs_contributors IN SHARE MODE`,
  );
  await db.execute(sql.raw(upgradePublishedCatalogSearchViewSql));
  await db.execute(sql.raw(createPublishedCatalogSearchSql));
  const result = await db.execute(
    sql`SELECT catalog_id FROM catalog_entries ORDER BY catalog_id COLLATE "C"`,
  );
  for (const row of result.rows) {
    if (typeof row.catalog_id !== "string")
      throw new Error("Published Catalog search identity invalid");
    await synchronizePublishedCatalogSearch(db, row.catalog_id, true);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE catalog_search_documents`);
  // Keep the appended, read-only description_state column. Removing it would
  // require dropping a granted view; the earlier view migration owns teardown.
  // pg_trgm may also be used independently and is never dropped here.
}
