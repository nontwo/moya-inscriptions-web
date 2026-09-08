import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_editorial_identities_kind" AS ENUM('catalog', 'source');
  CREATE TABLE "editorial_identities" (
    "id" serial PRIMARY KEY NOT NULL,
    "identity_value" varchar NOT NULL,
    "kind" "enum_editorial_identities_kind" NOT NULL,
    "catalog_id" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "editorial_identities_id" integer;
  CREATE UNIQUE INDEX "editorial_identities_identity_value_idx" ON "editorial_identities" USING btree ("identity_value");
  CREATE INDEX "editorial_identities_updated_at_idx" ON "editorial_identities" USING btree ("updated_at");
  CREATE INDEX "editorial_identities_created_at_idx" ON "editorial_identities" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_editorial_identities_fk" FOREIGN KEY ("editorial_identities_id") REFERENCES "public"."editorial_identities"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_editorial_identities_id_idx" ON "payload_locked_documents_rels" USING btree ("editorial_identities_id");

  -- Claims retain every known identity, including provenance later removed from
  -- the latest draft. A conflict requires review; never select an arbitrary owner.
  CREATE TEMP TABLE p2_04_identity_backfill ON COMMIT DROP AS
    SELECT DISTINCT identity_value, kind, catalog_id FROM (
      SELECT catalog_id AS identity_value, 'catalog'::text AS kind, catalog_id FROM catalogs
      UNION ALL
      SELECT source_id, 'source', catalog_id FROM catalogs
      UNION ALL
      SELECT p.source_id, 'source', c.catalog_id
        FROM catalogs_provenance p JOIN catalogs c ON c.id = p._parent_id
      UNION ALL
      SELECT version_catalog_id, 'catalog', version_catalog_id FROM _catalogs_v
      UNION ALL
      SELECT version_source_id, 'source', version_catalog_id FROM _catalogs_v
      UNION ALL
      SELECT p.source_id, 'source', v.version_catalog_id
        FROM _catalogs_v_version_provenance p JOIN _catalogs_v v ON v.id = p._parent_id
    ) bindings
    WHERE identity_value IS NOT NULL AND catalog_id IS NOT NULL;

  DO $$ BEGIN
    IF EXISTS (
      SELECT identity_value FROM p2_04_identity_backfill
      GROUP BY identity_value HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'EDITORIAL_IDENTITY_BACKFILL_CONFLICT';
    END IF;
  END $$;

  INSERT INTO editorial_identities (identity_value, kind, catalog_id)
    SELECT identity_value, kind::enum_editorial_identities_kind, catalog_id
    FROM p2_04_identity_backfill;
`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "editorial_identities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_editorial_identities_fk";
  DROP TABLE "editorial_identities";

  DROP INDEX "payload_locked_documents_rels_editorial_identities_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "editorial_identities_id";
  DROP TYPE "public"."enum_editorial_identities_kind";`);
}
