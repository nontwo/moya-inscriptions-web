import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { guardCmsMigrationAdapter } from "./src/migration/guard";
import { zh } from "@payloadcms/translations/languages/zh";
import { Users } from "./src/users";
import { editorialFields } from "./src/fields/editorial-fields";
import {
  catalogAccess,
  catalogHooks,
  EditorialIdentities,
  EditorialApprovals,
  EditorialReceipts,
  editorialEndpoints,
} from "./src/editorial";
import { communityEndpoints } from "./src/community/endpoints";
import { editorialMcp } from "./src/mcp";
import { createMediaCollection } from "./src/media/collection";
import { createEditorialStoragePlugin } from "./src/media/storage";
import {
  canEditCatalog,
  catalogScopeAccess,
  isOwner,
} from "./src/editorial/access";
import { adminPreviewURL, editorialPreviewEndpoint } from "./src/preview";
import {
  cmsDatabasePool,
  assertCmsProductionEnvironment,
  cmsRuntimeLogFields,
  requiredSetting,
} from "./src/runtime-settings";
assertCmsProductionEnvironment();
const dirname = path.dirname(fileURLToPath(import.meta.url));
export default buildConfig({
  secret: requiredSetting("CMS_SECRET"),
  admin: {
    user: "users",
    importMap: {
      autoGenerate: false,
      baseDir: dirname,
      importMapFile: path.resolve(dirname, "app/(payload)/admin/importMap.ts"),
    },
    meta: { titleSuffix: "— 由艺（Yoyi）管理端" },
    components: {
      views: {
        editorialWorkflow: {
          Component: "/src/owner-workflow/View#OwnerWorkflowView",
          path: "/editorial-workflow",
          exact: true,
        },
        communityModeration: {
          Component: "/src/community/View#CommunityModerationView",
          path: "/community-moderation",
          exact: true,
        },
      },
      afterNavLinks: [
        "/src/owner-workflow/NavLink#OwnerWorkflowNavLink",
        "/src/community/NavLink#CommunityModerationNavLink",
      ],
    },
  },
  i18n: { fallbackLanguage: "zh", supportedLanguages: { zh } },
  graphQL: { disable: true },
  telemetry: false,
  logger: {
    options: {
      base: null,
      hooks: {
        logMethod(args, method) {
          method.apply(this, [cmsRuntimeLogFields(args)]);
        },
      },
    },
  },
  db: guardCmsMigrationAdapter(
    postgresAdapter({
      pool: cmsDatabasePool(),
      push: false,
      disableCreateDatabase: true,
      migrationDir: path.resolve(dirname, "src/migrations"),
    }),
  ),
  collections: [
    Users,
    {
      slug: "catalogs",
      disableBulkEdit: true,
      labels: { singular: "资料", plural: "资料" },
      admin: {
        preview: adminPreviewURL,
        components: {
          edit: {
            UnpublishButton:
              "/src/owner-workflow/OwnerWithdrawButton#OwnerWithdrawButton",
          },
        },
        useAsTitle: "title",
        defaultColumns: ["title", "kind", "catalogId", "revision", "_status"],
        group: "内容",
      },
      access: catalogAccess,
      hooks: catalogHooks,
      versions: {
        drafts: { autosave: { interval: 1500 }, validate: true },
        maxPerDoc: 100,
      },
      fields: [
        {
          name: "lastEditedBy",
          type: "relationship",
          relationTo: "users",
          admin: { readOnly: true, position: "sidebar" },
        },
        {
          name: "revision",
          type: "number",
          defaultValue: 0,
          admin: { readOnly: true, position: "sidebar" },
        },
        ...editorialFields,
      ],
    },
    createMediaCollection({
      read: ({ req }) => catalogScopeAccess(req),
      canWrite: canEditCatalog,
      canRegister: isOwner,
      localDirectory: requiredSetting("CMS_MEDIA_DIR"),
    }),
    EditorialIdentities,
    EditorialApprovals,
    EditorialReceipts,
  ],
  endpoints: [
    ...editorialEndpoints,
    ...communityEndpoints,
    editorialPreviewEndpoint,
  ],
  plugins: [createEditorialStoragePlugin(), editorialMcp()],
  typescript: { outputFile: path.resolve(dirname, "src/payload-types.ts") },
});
