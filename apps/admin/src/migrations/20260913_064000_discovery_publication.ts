import {
  sql,
  type MigrateUpArgs,
  type MigrateDownArgs,
} from "@payloadcms/db-postgres";
import { createCatalogDiscoverySql } from "../published/discovery";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`LOCK TABLE catalogs IN SHARE MODE`);
  await db.execute(sql.raw(createCatalogDiscoverySql));
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`DROP VIEW catalog_discovery; DROP TABLE catalog_first_publications;`,
  );
}
