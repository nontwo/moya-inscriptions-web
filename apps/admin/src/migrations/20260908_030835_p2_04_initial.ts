import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('owner', 'automation');
  CREATE TYPE "public"."enum_catalogs_aliases_alias_type" AS ENUM('alternate', 'historical');
  CREATE TYPE "public"."enum_catalogs_contributors_role" AS ENUM('textAuthor', 'calligrapher');
  CREATE TYPE "public"."enum_catalogs_source_citations_applies_to" AS ENUM('record', 'description', 'transcription', 'historicalContext', 'scholarlyResearch');
  CREATE TYPE "public"."enum_catalogs_media_order_confidence" AS ENUM('HIGH', 'LOW');
  CREATE TYPE "public"."enum_catalogs_kind" AS ENUM('inscription', 'calligraphy');
  CREATE TYPE "public"."enum_catalogs_dynasty_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum_catalogs_date_text_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum_catalogs_province_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum_catalogs_prefecture_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum_catalogs_county_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum_catalogs_current_location_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum_catalogs_current_custodian_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum_catalogs_description_state" AS ENUM('VALUE', 'UNSUPPLIED', 'CLEAR');
  CREATE TYPE "public"."enum_catalogs_script_style_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum_catalogs_transcription_state" AS ENUM('VALUE', 'UNSUPPLIED', 'CLEAR');
  CREATE TYPE "public"."enum_catalogs_historical_context_state" AS ENUM('VALUE', 'UNSUPPLIED', 'CLEAR');
  CREATE TYPE "public"."enum_catalogs_scholarly_research_state" AS ENUM('VALUE', 'UNSUPPLIED', 'CLEAR');
  CREATE TYPE "public"."enum_catalogs_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__catalogs_v_version_aliases_alias_type" AS ENUM('alternate', 'historical');
  CREATE TYPE "public"."enum__catalogs_v_version_contributors_role" AS ENUM('textAuthor', 'calligrapher');
  CREATE TYPE "public"."enum__catalogs_v_version_source_citations_applies_to" AS ENUM('record', 'description', 'transcription', 'historicalContext', 'scholarlyResearch');
  CREATE TYPE "public"."enum__catalogs_v_version_media_order_confidence" AS ENUM('HIGH', 'LOW');
  CREATE TYPE "public"."enum__catalogs_v_version_kind" AS ENUM('inscription', 'calligraphy');
  CREATE TYPE "public"."enum__catalogs_v_version_dynasty_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum__catalogs_v_version_date_text_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum__catalogs_v_version_province_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum__catalogs_v_version_prefecture_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum__catalogs_v_version_county_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum__catalogs_v_version_current_location_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum__catalogs_v_version_current_custodian_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum__catalogs_v_version_description_state" AS ENUM('VALUE', 'UNSUPPLIED', 'CLEAR');
  CREATE TYPE "public"."enum__catalogs_v_version_script_style_state" AS ENUM('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR');
  CREATE TYPE "public"."enum__catalogs_v_version_transcription_state" AS ENUM('VALUE', 'UNSUPPLIED', 'CLEAR');
  CREATE TYPE "public"."enum__catalogs_v_version_historical_context_state" AS ENUM('VALUE', 'UNSUPPLIED', 'CLEAR');
  CREATE TYPE "public"."enum__catalogs_v_version_scholarly_research_state" AS ENUM('VALUE', 'UNSUPPLIED', 'CLEAR');
  CREATE TYPE "public"."enum__catalogs_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_media_origin" AS ENUM('upload', 'existing');
  CREATE TYPE "public"."enum_media_order_confidence" AS ENUM('HIGH', 'LOW');
  CREATE TYPE "public"."enum_editorial_approvals_status" AS ENUM('active', 'revoked');
  CREATE TYPE "public"."enum_editorial_receipts_operation" AS ENUM('save-draft', 'publish-approved');
  CREATE TYPE "public"."enum_editorial_receipts_status" AS ENUM('completed', 'rejected');
  CREATE TABLE "users_sessions" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "created_at" timestamp(3) with time zone,
    "expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "users" (
    "id" serial PRIMARY KEY NOT NULL,
    "role" "enum_users_role" DEFAULT 'automation' NOT NULL,
    "scope_catalog_ids" jsonb DEFAULT '[]'::jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "enable_a_p_i_key" boolean,
    "api_key" varchar,
    "api_key_index" varchar,
    "email" varchar NOT NULL,
    "reset_password_token" varchar,
    "reset_password_expiration" timestamp(3) with time zone,
    "salt" varchar,
    "hash" varchar,
    "login_attempts" numeric DEFAULT 0,
    "lock_until" timestamp(3) with time zone
  );

  CREATE TABLE "catalogs_aliases" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "alias" varchar,
    "alias_type" "enum_catalogs_aliases_alias_type"
  );

  CREATE TABLE "catalogs_provenance" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "source_id" varchar,
    "source_title" varchar,
    "source_type_raw" varchar,
    "source_url" varchar,
    "source_note" varchar
  );

  CREATE TABLE "catalogs_contributors" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar,
    "role" "enum_catalogs_contributors_role"
  );

  CREATE TABLE "catalogs_source_citations_applies_to" (
    "order" integer NOT NULL,
    "parent_id" varchar NOT NULL,
    "value" "enum_catalogs_source_citations_applies_to",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "catalogs_source_citations" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "label" varchar,
    "citation" varchar,
    "url" varchar
  );

  CREATE TABLE "catalogs_media" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "media_id" varchar,
    "object_key" varchar,
    "width" numeric,
    "height" numeric,
    "alt" varchar,
    "position" numeric,
    "is_representative" boolean DEFAULT false,
    "rights" varchar,
    "order_confidence" "enum_catalogs_media_order_confidence"
  );

  CREATE TABLE "catalogs" (
    "id" serial PRIMARY KEY NOT NULL,
    "last_edited_by_id" integer,
    "revision" numeric DEFAULT 0,
    "catalog_id" varchar,
    "source_id" varchar,
    "kind" "enum_catalogs_kind",
    "title" varchar,
    "summary" varchar,
    "period_label" varchar,
    "dynasty_state" "enum_catalogs_dynasty_state" DEFAULT 'UNSUPPLIED',
    "dynasty_value" varchar,
    "date_text_state" "enum_catalogs_date_text_state" DEFAULT 'UNSUPPLIED',
    "date_text_value" varchar,
    "province_state" "enum_catalogs_province_state" DEFAULT 'UNSUPPLIED',
    "province_value" varchar,
    "prefecture_state" "enum_catalogs_prefecture_state" DEFAULT 'UNSUPPLIED',
    "prefecture_value" varchar,
    "county_state" "enum_catalogs_county_state" DEFAULT 'UNSUPPLIED',
    "county_value" varchar,
    "current_location_state" "enum_catalogs_current_location_state" DEFAULT 'UNSUPPLIED',
    "current_location_value" varchar,
    "current_custodian_state" "enum_catalogs_current_custodian_state" DEFAULT 'UNSUPPLIED',
    "current_custodian_value" varchar,
    "description_state" "enum_catalogs_description_state" DEFAULT 'UNSUPPLIED',
    "description_value" varchar,
    "script_style_state" "enum_catalogs_script_style_state" DEFAULT 'UNSUPPLIED',
    "script_style_value" varchar,
    "transcription_state" "enum_catalogs_transcription_state" DEFAULT 'UNSUPPLIED',
    "transcription_value" varchar,
    "historical_context_state" "enum_catalogs_historical_context_state" DEFAULT 'UNSUPPLIED',
    "historical_context_value" varchar,
    "scholarly_research_state" "enum_catalogs_scholarly_research_state" DEFAULT 'UNSUPPLIED',
    "scholarly_research_value" varchar,
    "owner_note" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_catalogs_status" DEFAULT 'draft'
  );

  CREATE TABLE "_catalogs_v_version_aliases" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "alias" varchar,
    "alias_type" "enum__catalogs_v_version_aliases_alias_type",
    "_uuid" varchar
  );

  CREATE TABLE "_catalogs_v_version_provenance" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "source_id" varchar,
    "source_title" varchar,
    "source_type_raw" varchar,
    "source_url" varchar,
    "source_note" varchar,
    "_uuid" varchar
  );

  CREATE TABLE "_catalogs_v_version_contributors" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "role" "enum__catalogs_v_version_contributors_role",
    "_uuid" varchar
  );

  CREATE TABLE "_catalogs_v_version_source_citations_applies_to" (
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "value" "enum__catalogs_v_version_source_citations_applies_to",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "_catalogs_v_version_source_citations" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "label" varchar,
    "citation" varchar,
    "url" varchar,
    "_uuid" varchar
  );

  CREATE TABLE "_catalogs_v_version_media" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "media_id" varchar,
    "object_key" varchar,
    "width" numeric,
    "height" numeric,
    "alt" varchar,
    "position" numeric,
    "is_representative" boolean DEFAULT false,
    "rights" varchar,
    "order_confidence" "enum__catalogs_v_version_media_order_confidence",
    "_uuid" varchar
  );

  CREATE TABLE "_catalogs_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_last_edited_by_id" integer,
    "version_revision" numeric DEFAULT 0,
    "version_catalog_id" varchar,
    "version_source_id" varchar,
    "version_kind" "enum__catalogs_v_version_kind",
    "version_title" varchar,
    "version_summary" varchar,
    "version_period_label" varchar,
    "version_dynasty_state" "enum__catalogs_v_version_dynasty_state" DEFAULT 'UNSUPPLIED',
    "version_dynasty_value" varchar,
    "version_date_text_state" "enum__catalogs_v_version_date_text_state" DEFAULT 'UNSUPPLIED',
    "version_date_text_value" varchar,
    "version_province_state" "enum__catalogs_v_version_province_state" DEFAULT 'UNSUPPLIED',
    "version_province_value" varchar,
    "version_prefecture_state" "enum__catalogs_v_version_prefecture_state" DEFAULT 'UNSUPPLIED',
    "version_prefecture_value" varchar,
    "version_county_state" "enum__catalogs_v_version_county_state" DEFAULT 'UNSUPPLIED',
    "version_county_value" varchar,
    "version_current_location_state" "enum__catalogs_v_version_current_location_state" DEFAULT 'UNSUPPLIED',
    "version_current_location_value" varchar,
    "version_current_custodian_state" "enum__catalogs_v_version_current_custodian_state" DEFAULT 'UNSUPPLIED',
    "version_current_custodian_value" varchar,
    "version_description_state" "enum__catalogs_v_version_description_state" DEFAULT 'UNSUPPLIED',
    "version_description_value" varchar,
    "version_script_style_state" "enum__catalogs_v_version_script_style_state" DEFAULT 'UNSUPPLIED',
    "version_script_style_value" varchar,
    "version_transcription_state" "enum__catalogs_v_version_transcription_state" DEFAULT 'UNSUPPLIED',
    "version_transcription_value" varchar,
    "version_historical_context_state" "enum__catalogs_v_version_historical_context_state" DEFAULT 'UNSUPPLIED',
    "version_historical_context_value" varchar,
    "version_scholarly_research_state" "enum__catalogs_v_version_scholarly_research_state" DEFAULT 'UNSUPPLIED',
    "version_scholarly_research_value" varchar,
    "version_owner_note" varchar,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__catalogs_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean,
    "autosave" boolean
  );

  CREATE TABLE "media" (
    "id" serial PRIMARY KEY NOT NULL,
    "media_id" varchar NOT NULL,
    "catalog_id" varchar NOT NULL,
    "origin" "enum_media_origin" DEFAULT 'upload' NOT NULL,
    "object_key" varchar NOT NULL,
    "sha256" varchar NOT NULL,
    "alt" varchar NOT NULL,
    "rights" varchar,
    "order_confidence" "enum_media_order_confidence",
    "prefix" varchar DEFAULT '',
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "url" varchar,
    "thumbnail_u_r_l" varchar,
    "filename" varchar,
    "mime_type" varchar,
    "filesize" numeric,
    "width" numeric,
    "height" numeric
  );

  CREATE TABLE "editorial_approvals_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "catalog_id" integer NOT NULL,
    "revision" numeric NOT NULL,
    "fingerprint" varchar
  );

  CREATE TABLE "editorial_approvals" (
    "id" serial PRIMARY KEY NOT NULL,
    "label" varchar NOT NULL,
    "automation_user_id" integer NOT NULL,
    "status" "enum_editorial_approvals_status" DEFAULT 'active' NOT NULL,
    "approved_by_id" integer,
    "approved_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "editorial_receipts" (
    "id" serial PRIMARY KEY NOT NULL,
    "deduplication_key" varchar NOT NULL,
    "request_fingerprint" varchar NOT NULL,
    "actor_id" integer NOT NULL,
    "operation" "enum_editorial_receipts_operation" NOT NULL,
    "status" "enum_editorial_receipts_status" NOT NULL,
    "catalog_id" integer,
    "revision" numeric,
    "fingerprint" varchar,
    "error_code" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_mcp_api_keys" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "label" varchar,
    "description" varchar,
    "payload_mcp_tool_editorial_query" boolean DEFAULT false,
    "payload_mcp_tool_editorial_read" boolean DEFAULT false,
    "payload_mcp_tool_editorial_save_draft" boolean DEFAULT false,
    "payload_mcp_tool_editorial_publish_approved" boolean DEFAULT false,
    "payload_mcp_tool_editorial_batch_results" boolean DEFAULT false,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "enable_a_p_i_key" boolean,
    "api_key" varchar,
    "api_key_index" varchar
  );

  CREATE TABLE "payload_kv" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "data" jsonb NOT NULL
  );

  CREATE TABLE "payload_locked_documents" (
    "id" serial PRIMARY KEY NOT NULL,
    "global_slug" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_locked_documents_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "users_id" integer,
    "catalogs_id" integer,
    "media_id" integer,
    "editorial_approvals_id" integer,
    "editorial_receipts_id" integer,
    "payload_mcp_api_keys_id" integer
  );

  CREATE TABLE "payload_preferences" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar,
    "value" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_preferences_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "users_id" integer,
    "payload_mcp_api_keys_id" integer
  );

  CREATE TABLE "payload_migrations" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "batch" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "catalogs_aliases" ADD CONSTRAINT "catalogs_aliases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "catalogs_provenance" ADD CONSTRAINT "catalogs_provenance_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "catalogs_contributors" ADD CONSTRAINT "catalogs_contributors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "catalogs_source_citations_applies_to" ADD CONSTRAINT "catalogs_source_citations_applies_to_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."catalogs_source_citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "catalogs_source_citations" ADD CONSTRAINT "catalogs_source_citations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "catalogs_media" ADD CONSTRAINT "catalogs_media_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_last_edited_by_id_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_catalogs_v_version_aliases" ADD CONSTRAINT "_catalogs_v_version_aliases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_catalogs_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_catalogs_v_version_provenance" ADD CONSTRAINT "_catalogs_v_version_provenance_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_catalogs_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_catalogs_v_version_contributors" ADD CONSTRAINT "_catalogs_v_version_contributors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_catalogs_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_catalogs_v_version_source_citations_applies_to" ADD CONSTRAINT "_catalogs_v_version_source_citations_applies_to_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_catalogs_v_version_source_citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_catalogs_v_version_source_citations" ADD CONSTRAINT "_catalogs_v_version_source_citations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_catalogs_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_catalogs_v_version_media" ADD CONSTRAINT "_catalogs_v_version_media_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_catalogs_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_catalogs_v" ADD CONSTRAINT "_catalogs_v_parent_id_catalogs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_catalogs_v" ADD CONSTRAINT "_catalogs_v_version_last_edited_by_id_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "editorial_approvals_items" ADD CONSTRAINT "editorial_approvals_items_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "editorial_approvals_items" ADD CONSTRAINT "editorial_approvals_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."editorial_approvals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "editorial_approvals" ADD CONSTRAINT "editorial_approvals_automation_user_id_users_id_fk" FOREIGN KEY ("automation_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "editorial_approvals" ADD CONSTRAINT "editorial_approvals_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "editorial_receipts" ADD CONSTRAINT "editorial_receipts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "editorial_receipts" ADD CONSTRAINT "editorial_receipts_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_mcp_api_keys" ADD CONSTRAINT "payload_mcp_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_catalogs_fk" FOREIGN KEY ("catalogs_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_editorial_approvals_fk" FOREIGN KEY ("editorial_approvals_id") REFERENCES "public"."editorial_approvals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_editorial_receipts_fk" FOREIGN KEY ("editorial_receipts_id") REFERENCES "public"."editorial_receipts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payload_mcp_api_keys_fk" FOREIGN KEY ("payload_mcp_api_keys_id") REFERENCES "public"."payload_mcp_api_keys"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_payload_mcp_api_keys_fk" FOREIGN KEY ("payload_mcp_api_keys_id") REFERENCES "public"."payload_mcp_api_keys"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "catalogs_aliases_order_idx" ON "catalogs_aliases" USING btree ("_order");
  CREATE INDEX "catalogs_aliases_parent_id_idx" ON "catalogs_aliases" USING btree ("_parent_id");
  CREATE INDEX "catalogs_provenance_order_idx" ON "catalogs_provenance" USING btree ("_order");
  CREATE INDEX "catalogs_provenance_parent_id_idx" ON "catalogs_provenance" USING btree ("_parent_id");
  CREATE INDEX "catalogs_contributors_order_idx" ON "catalogs_contributors" USING btree ("_order");
  CREATE INDEX "catalogs_contributors_parent_id_idx" ON "catalogs_contributors" USING btree ("_parent_id");
  CREATE INDEX "catalogs_source_citations_applies_to_order_idx" ON "catalogs_source_citations_applies_to" USING btree ("order");
  CREATE INDEX "catalogs_source_citations_applies_to_parent_idx" ON "catalogs_source_citations_applies_to" USING btree ("parent_id");
  CREATE INDEX "catalogs_source_citations_order_idx" ON "catalogs_source_citations" USING btree ("_order");
  CREATE INDEX "catalogs_source_citations_parent_id_idx" ON "catalogs_source_citations" USING btree ("_parent_id");
  CREATE INDEX "catalogs_media_order_idx" ON "catalogs_media" USING btree ("_order");
  CREATE INDEX "catalogs_media_parent_id_idx" ON "catalogs_media" USING btree ("_parent_id");
  CREATE INDEX "catalogs_last_edited_by_idx" ON "catalogs" USING btree ("last_edited_by_id");
  CREATE UNIQUE INDEX "catalogs_catalog_id_idx" ON "catalogs" USING btree ("catalog_id");
  CREATE UNIQUE INDEX "catalogs_source_id_idx" ON "catalogs" USING btree ("source_id");
  CREATE INDEX "catalogs_updated_at_idx" ON "catalogs" USING btree ("updated_at");
  CREATE INDEX "catalogs_created_at_idx" ON "catalogs" USING btree ("created_at");
  CREATE INDEX "catalogs__status_idx" ON "catalogs" USING btree ("_status");
  CREATE INDEX "_catalogs_v_version_aliases_order_idx" ON "_catalogs_v_version_aliases" USING btree ("_order");
  CREATE INDEX "_catalogs_v_version_aliases_parent_id_idx" ON "_catalogs_v_version_aliases" USING btree ("_parent_id");
  CREATE INDEX "_catalogs_v_version_provenance_order_idx" ON "_catalogs_v_version_provenance" USING btree ("_order");
  CREATE INDEX "_catalogs_v_version_provenance_parent_id_idx" ON "_catalogs_v_version_provenance" USING btree ("_parent_id");
  CREATE INDEX "_catalogs_v_version_contributors_order_idx" ON "_catalogs_v_version_contributors" USING btree ("_order");
  CREATE INDEX "_catalogs_v_version_contributors_parent_id_idx" ON "_catalogs_v_version_contributors" USING btree ("_parent_id");
  CREATE INDEX "_catalogs_v_version_source_citations_applies_to_order_idx" ON "_catalogs_v_version_source_citations_applies_to" USING btree ("order");
  CREATE INDEX "_catalogs_v_version_source_citations_applies_to_parent_idx" ON "_catalogs_v_version_source_citations_applies_to" USING btree ("parent_id");
  CREATE INDEX "_catalogs_v_version_source_citations_order_idx" ON "_catalogs_v_version_source_citations" USING btree ("_order");
  CREATE INDEX "_catalogs_v_version_source_citations_parent_id_idx" ON "_catalogs_v_version_source_citations" USING btree ("_parent_id");
  CREATE INDEX "_catalogs_v_version_media_order_idx" ON "_catalogs_v_version_media" USING btree ("_order");
  CREATE INDEX "_catalogs_v_version_media_parent_id_idx" ON "_catalogs_v_version_media" USING btree ("_parent_id");
  CREATE INDEX "_catalogs_v_parent_idx" ON "_catalogs_v" USING btree ("parent_id");
  CREATE INDEX "_catalogs_v_version_version_last_edited_by_idx" ON "_catalogs_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "_catalogs_v_version_version_catalog_id_idx" ON "_catalogs_v" USING btree ("version_catalog_id");
  CREATE INDEX "_catalogs_v_version_version_source_id_idx" ON "_catalogs_v" USING btree ("version_source_id");
  CREATE INDEX "_catalogs_v_version_version_updated_at_idx" ON "_catalogs_v" USING btree ("version_updated_at");
  CREATE INDEX "_catalogs_v_version_version_created_at_idx" ON "_catalogs_v" USING btree ("version_created_at");
  CREATE INDEX "_catalogs_v_version_version__status_idx" ON "_catalogs_v" USING btree ("version__status");
  CREATE INDEX "_catalogs_v_created_at_idx" ON "_catalogs_v" USING btree ("created_at");
  CREATE INDEX "_catalogs_v_updated_at_idx" ON "_catalogs_v" USING btree ("updated_at");
  CREATE INDEX "_catalogs_v_latest_idx" ON "_catalogs_v" USING btree ("latest");
  CREATE INDEX "_catalogs_v_autosave_idx" ON "_catalogs_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "media_media_id_idx" ON "media" USING btree ("media_id");
  CREATE INDEX "media_catalog_id_idx" ON "media" USING btree ("catalog_id");
  CREATE UNIQUE INDEX "media_object_key_idx" ON "media" USING btree ("object_key");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "editorial_approvals_items_order_idx" ON "editorial_approvals_items" USING btree ("_order");
  CREATE INDEX "editorial_approvals_items_parent_id_idx" ON "editorial_approvals_items" USING btree ("_parent_id");
  CREATE INDEX "editorial_approvals_items_catalog_idx" ON "editorial_approvals_items" USING btree ("catalog_id");
  CREATE INDEX "editorial_approvals_automation_user_idx" ON "editorial_approvals" USING btree ("automation_user_id");
  CREATE INDEX "editorial_approvals_approved_by_idx" ON "editorial_approvals" USING btree ("approved_by_id");
  CREATE INDEX "editorial_approvals_updated_at_idx" ON "editorial_approvals" USING btree ("updated_at");
  CREATE INDEX "editorial_approvals_created_at_idx" ON "editorial_approvals" USING btree ("created_at");
  CREATE UNIQUE INDEX "editorial_receipts_deduplication_key_idx" ON "editorial_receipts" USING btree ("deduplication_key");
  CREATE INDEX "editorial_receipts_actor_idx" ON "editorial_receipts" USING btree ("actor_id");
  CREATE INDEX "editorial_receipts_catalog_idx" ON "editorial_receipts" USING btree ("catalog_id");
  CREATE INDEX "editorial_receipts_updated_at_idx" ON "editorial_receipts" USING btree ("updated_at");
  CREATE INDEX "editorial_receipts_created_at_idx" ON "editorial_receipts" USING btree ("created_at");
  CREATE INDEX "payload_mcp_api_keys_user_idx" ON "payload_mcp_api_keys" USING btree ("user_id");
  CREATE INDEX "payload_mcp_api_keys_updated_at_idx" ON "payload_mcp_api_keys" USING btree ("updated_at");
  CREATE INDEX "payload_mcp_api_keys_created_at_idx" ON "payload_mcp_api_keys" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_catalogs_id_idx" ON "payload_locked_documents_rels" USING btree ("catalogs_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_editorial_approvals_id_idx" ON "payload_locked_documents_rels" USING btree ("editorial_approvals_id");
  CREATE INDEX "payload_locked_documents_rels_editorial_receipts_id_idx" ON "payload_locked_documents_rels" USING btree ("editorial_receipts_id");
  CREATE INDEX "payload_locked_documents_rels_payload_mcp_api_keys_id_idx" ON "payload_locked_documents_rels" USING btree ("payload_mcp_api_keys_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_preferences_rels_payload_mcp_api_keys_id_idx" ON "payload_preferences_rels" USING btree ("payload_mcp_api_keys_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "catalogs_aliases" CASCADE;
  DROP TABLE "catalogs_provenance" CASCADE;
  DROP TABLE "catalogs_contributors" CASCADE;
  DROP TABLE "catalogs_source_citations_applies_to" CASCADE;
  DROP TABLE "catalogs_source_citations" CASCADE;
  DROP TABLE "catalogs_media" CASCADE;
  DROP TABLE "catalogs" CASCADE;
  DROP TABLE "_catalogs_v_version_aliases" CASCADE;
  DROP TABLE "_catalogs_v_version_provenance" CASCADE;
  DROP TABLE "_catalogs_v_version_contributors" CASCADE;
  DROP TABLE "_catalogs_v_version_source_citations_applies_to" CASCADE;
  DROP TABLE "_catalogs_v_version_source_citations" CASCADE;
  DROP TABLE "_catalogs_v_version_media" CASCADE;
  DROP TABLE "_catalogs_v" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "editorial_approvals_items" CASCADE;
  DROP TABLE "editorial_approvals" CASCADE;
  DROP TABLE "editorial_receipts" CASCADE;
  DROP TABLE "payload_mcp_api_keys" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_catalogs_aliases_alias_type";
  DROP TYPE "public"."enum_catalogs_contributors_role";
  DROP TYPE "public"."enum_catalogs_source_citations_applies_to";
  DROP TYPE "public"."enum_catalogs_media_order_confidence";
  DROP TYPE "public"."enum_catalogs_kind";
  DROP TYPE "public"."enum_catalogs_dynasty_state";
  DROP TYPE "public"."enum_catalogs_date_text_state";
  DROP TYPE "public"."enum_catalogs_province_state";
  DROP TYPE "public"."enum_catalogs_prefecture_state";
  DROP TYPE "public"."enum_catalogs_county_state";
  DROP TYPE "public"."enum_catalogs_current_location_state";
  DROP TYPE "public"."enum_catalogs_current_custodian_state";
  DROP TYPE "public"."enum_catalogs_description_state";
  DROP TYPE "public"."enum_catalogs_script_style_state";
  DROP TYPE "public"."enum_catalogs_transcription_state";
  DROP TYPE "public"."enum_catalogs_historical_context_state";
  DROP TYPE "public"."enum_catalogs_scholarly_research_state";
  DROP TYPE "public"."enum_catalogs_status";
  DROP TYPE "public"."enum__catalogs_v_version_aliases_alias_type";
  DROP TYPE "public"."enum__catalogs_v_version_contributors_role";
  DROP TYPE "public"."enum__catalogs_v_version_source_citations_applies_to";
  DROP TYPE "public"."enum__catalogs_v_version_media_order_confidence";
  DROP TYPE "public"."enum__catalogs_v_version_kind";
  DROP TYPE "public"."enum__catalogs_v_version_dynasty_state";
  DROP TYPE "public"."enum__catalogs_v_version_date_text_state";
  DROP TYPE "public"."enum__catalogs_v_version_province_state";
  DROP TYPE "public"."enum__catalogs_v_version_prefecture_state";
  DROP TYPE "public"."enum__catalogs_v_version_county_state";
  DROP TYPE "public"."enum__catalogs_v_version_current_location_state";
  DROP TYPE "public"."enum__catalogs_v_version_current_custodian_state";
  DROP TYPE "public"."enum__catalogs_v_version_description_state";
  DROP TYPE "public"."enum__catalogs_v_version_script_style_state";
  DROP TYPE "public"."enum__catalogs_v_version_transcription_state";
  DROP TYPE "public"."enum__catalogs_v_version_historical_context_state";
  DROP TYPE "public"."enum__catalogs_v_version_scholarly_research_state";
  DROP TYPE "public"."enum__catalogs_v_version_status";
  DROP TYPE "public"."enum_media_origin";
  DROP TYPE "public"."enum_media_order_confidence";
  DROP TYPE "public"."enum_editorial_approvals_status";
  DROP TYPE "public"."enum_editorial_receipts_operation";
  DROP TYPE "public"."enum_editorial_receipts_status";`);
}
