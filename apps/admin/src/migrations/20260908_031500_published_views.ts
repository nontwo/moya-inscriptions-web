import {
  sql,
  type MigrateDownArgs,
  type MigrateUpArgs,
} from "@payloadcms/db-postgres";
import {
  createPublishedCatalogViewsSql,
  dropPublishedCatalogViewsSql,
} from "../published/views";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(createPublishedCatalogViewsSql));
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(dropPublishedCatalogViewsSql));
}
