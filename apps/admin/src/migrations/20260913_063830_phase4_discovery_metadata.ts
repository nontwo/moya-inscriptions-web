import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_catalogs_filter_metadata_dynasty_state" AS ENUM('VALUE', 'UNKNOWN', 'UNSUPPLIED');
  CREATE TYPE "public"."enum_catalogs_filter_metadata_text_author_state" AS ENUM('VALUE', 'UNKNOWN', 'UNSUPPLIED');
  CREATE TYPE "public"."enum_catalogs_filter_metadata_calligrapher_state" AS ENUM('VALUE', 'UNKNOWN', 'UNSUPPLIED');
  CREATE TYPE "public"."enum_catalogs_filter_metadata_original_region_state" AS ENUM('VALUE', 'UNKNOWN', 'UNSUPPLIED');
  CREATE TYPE "public"."enum_catalogs_filter_metadata_script_state" AS ENUM('VALUE', 'UNKNOWN', 'UNSUPPLIED');
  CREATE TYPE "public"."enum__catalogs_v_version_filter_metadata_dynasty_state" AS ENUM('VALUE', 'UNKNOWN', 'UNSUPPLIED');
  CREATE TYPE "public"."enum__catalogs_v_version_filter_metadata_text_author_state" AS ENUM('VALUE', 'UNKNOWN', 'UNSUPPLIED');
  CREATE TYPE "public"."enum__catalogs_v_version_filter_metadata_calligrapher_state" AS ENUM('VALUE', 'UNKNOWN', 'UNSUPPLIED');
  CREATE TYPE "public"."enum__catalogs_v_version_filter_metadata_original_region_state" AS ENUM('VALUE', 'UNKNOWN', 'UNSUPPLIED');
  CREATE TYPE "public"."enum__catalogs_v_version_filter_metadata_script_state" AS ENUM('VALUE', 'UNKNOWN', 'UNSUPPLIED');
  ALTER TABLE "catalogs" ADD COLUMN "filter_metadata_dynasty_state" "enum_catalogs_filter_metadata_dynasty_state" DEFAULT 'UNSUPPLIED';
  ALTER TABLE "catalogs" ADD COLUMN "filter_metadata_dynasty_tokens" varchar DEFAULT '';
  ALTER TABLE "catalogs" ADD COLUMN "filter_metadata_text_author_state" "enum_catalogs_filter_metadata_text_author_state" DEFAULT 'UNSUPPLIED';
  ALTER TABLE "catalogs" ADD COLUMN "filter_metadata_text_author_tokens" varchar DEFAULT '';
  ALTER TABLE "catalogs" ADD COLUMN "filter_metadata_calligrapher_state" "enum_catalogs_filter_metadata_calligrapher_state" DEFAULT 'UNSUPPLIED';
  ALTER TABLE "catalogs" ADD COLUMN "filter_metadata_calligrapher_tokens" varchar DEFAULT '';
  ALTER TABLE "catalogs" ADD COLUMN "filter_metadata_original_region_state" "enum_catalogs_filter_metadata_original_region_state" DEFAULT 'UNSUPPLIED';
  ALTER TABLE "catalogs" ADD COLUMN "filter_metadata_original_region_tokens" varchar DEFAULT '';
  ALTER TABLE "catalogs" ADD COLUMN "filter_metadata_script_state" "enum_catalogs_filter_metadata_script_state" DEFAULT 'UNSUPPLIED';
  ALTER TABLE "catalogs" ADD COLUMN "filter_metadata_script_tokens" varchar DEFAULT '';
  ALTER TABLE "_catalogs_v" ADD COLUMN "version_filter_metadata_dynasty_state" "enum__catalogs_v_version_filter_metadata_dynasty_state" DEFAULT 'UNSUPPLIED';
  ALTER TABLE "_catalogs_v" ADD COLUMN "version_filter_metadata_dynasty_tokens" varchar DEFAULT '';
  ALTER TABLE "_catalogs_v" ADD COLUMN "version_filter_metadata_text_author_state" "enum__catalogs_v_version_filter_metadata_text_author_state" DEFAULT 'UNSUPPLIED';
  ALTER TABLE "_catalogs_v" ADD COLUMN "version_filter_metadata_text_author_tokens" varchar DEFAULT '';
  ALTER TABLE "_catalogs_v" ADD COLUMN "version_filter_metadata_calligrapher_state" "enum__catalogs_v_version_filter_metadata_calligrapher_state" DEFAULT 'UNSUPPLIED';
  ALTER TABLE "_catalogs_v" ADD COLUMN "version_filter_metadata_calligrapher_tokens" varchar DEFAULT '';
  ALTER TABLE "_catalogs_v" ADD COLUMN "version_filter_metadata_original_region_state" "enum__catalogs_v_version_filter_metadata_original_region_state" DEFAULT 'UNSUPPLIED';
  ALTER TABLE "_catalogs_v" ADD COLUMN "version_filter_metadata_original_region_tokens" varchar DEFAULT '';
  ALTER TABLE "_catalogs_v" ADD COLUMN "version_filter_metadata_script_state" "enum__catalogs_v_version_filter_metadata_script_state" DEFAULT 'UNSUPPLIED';
  ALTER TABLE "_catalogs_v" ADD COLUMN "version_filter_metadata_script_tokens" varchar DEFAULT '';`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "catalogs" DROP COLUMN "filter_metadata_dynasty_state";
  ALTER TABLE "catalogs" DROP COLUMN "filter_metadata_dynasty_tokens";
  ALTER TABLE "catalogs" DROP COLUMN "filter_metadata_text_author_state";
  ALTER TABLE "catalogs" DROP COLUMN "filter_metadata_text_author_tokens";
  ALTER TABLE "catalogs" DROP COLUMN "filter_metadata_calligrapher_state";
  ALTER TABLE "catalogs" DROP COLUMN "filter_metadata_calligrapher_tokens";
  ALTER TABLE "catalogs" DROP COLUMN "filter_metadata_original_region_state";
  ALTER TABLE "catalogs" DROP COLUMN "filter_metadata_original_region_tokens";
  ALTER TABLE "catalogs" DROP COLUMN "filter_metadata_script_state";
  ALTER TABLE "catalogs" DROP COLUMN "filter_metadata_script_tokens";
  ALTER TABLE "_catalogs_v" DROP COLUMN "version_filter_metadata_dynasty_state";
  ALTER TABLE "_catalogs_v" DROP COLUMN "version_filter_metadata_dynasty_tokens";
  ALTER TABLE "_catalogs_v" DROP COLUMN "version_filter_metadata_text_author_state";
  ALTER TABLE "_catalogs_v" DROP COLUMN "version_filter_metadata_text_author_tokens";
  ALTER TABLE "_catalogs_v" DROP COLUMN "version_filter_metadata_calligrapher_state";
  ALTER TABLE "_catalogs_v" DROP COLUMN "version_filter_metadata_calligrapher_tokens";
  ALTER TABLE "_catalogs_v" DROP COLUMN "version_filter_metadata_original_region_state";
  ALTER TABLE "_catalogs_v" DROP COLUMN "version_filter_metadata_original_region_tokens";
  ALTER TABLE "_catalogs_v" DROP COLUMN "version_filter_metadata_script_state";
  ALTER TABLE "_catalogs_v" DROP COLUMN "version_filter_metadata_script_tokens";
  DROP TYPE "public"."enum_catalogs_filter_metadata_dynasty_state";
  DROP TYPE "public"."enum_catalogs_filter_metadata_text_author_state";
  DROP TYPE "public"."enum_catalogs_filter_metadata_calligrapher_state";
  DROP TYPE "public"."enum_catalogs_filter_metadata_original_region_state";
  DROP TYPE "public"."enum_catalogs_filter_metadata_script_state";
  DROP TYPE "public"."enum__catalogs_v_version_filter_metadata_dynasty_state";
  DROP TYPE "public"."enum__catalogs_v_version_filter_metadata_text_author_state";
  DROP TYPE "public"."enum__catalogs_v_version_filter_metadata_calligrapher_state";
  DROP TYPE "public"."enum__catalogs_v_version_filter_metadata_original_region_state";
  DROP TYPE "public"."enum__catalogs_v_version_filter_metadata_script_state";`);
}
