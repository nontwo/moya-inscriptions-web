import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

/**
 * Agent Administration V1 (Issue #141 r3, Phase B): the operator identity's
 * machine principal binding and the per-tool API key grants the MCP plugin
 * models as one checkbox per tool. Scoped operator metadata only; no
 * community data enters Payload.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "agent_principal" varchar;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_artvenn_users_find" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_artvenn_content_search" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_artvenn_comments_query" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_artvenn_comments_read" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_artvenn_comments_prepare" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_artvenn_featured_prepare" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_artvenn_operations_execute" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_artvenn_operations_get" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_artvenn_operations_cancel" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_artvenn_operations_prepare_undo" boolean DEFAULT false;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "agent_principal";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_artvenn_users_find";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_artvenn_content_search";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_artvenn_comments_query";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_artvenn_comments_read";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_artvenn_comments_prepare";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_artvenn_featured_prepare";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_artvenn_operations_execute";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_artvenn_operations_get";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_artvenn_operations_cancel";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_artvenn_operations_prepare_undo";`);
}
