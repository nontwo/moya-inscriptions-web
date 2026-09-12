import { createLocalReq, getPayload } from "payload";
import config from "../payload.config";

/**
 * Development-only: publishes three synthetic Catalog records for the Owner's
 * Community comment acceptance (scope amendment 2026-09-12, section 12.3).
 * Idempotent: a record that already exists is left exactly as it is. Nothing
 * here is Production data, and the guards refuse any database but the local
 * loopback yoyi_dev. Comments themselves are seeded separately by
 * infra/development/community-acceptance-comments.sql.
 */
if (process.env.CMS_ENVIRONMENT !== "synthetic")
  throw new Error("SYNTHETIC_ENVIRONMENT_REQUIRED");
if (process.env.NODE_ENV === "production") throw new Error("DEVELOPMENT_ONLY");
if (!process.env.CMS_DATABASE_URL) throw new Error("CMS_DATABASE_URL_REQUIRED");
const database = new URL(process.env.CMS_DATABASE_URL);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
  database.pathname !== "/yoyi_dev"
)
  throw new Error("LOCAL_YOYI_DEV_DATABASE_REQUIRED");

const statefulValue = (value: string) => ({
  state: "VALUE" as const,
  value,
});
const unsupplied = { state: "UNSUPPLIED" as const };
/** Every stateful group the collection requires; only two carry a value. */
const statefulGroups = (description: string) => ({
  dynasty: statefulValue("合成"),
  dateText: unsupplied,
  province: unsupplied,
  prefecture: unsupplied,
  county: unsupplied,
  currentLocation: unsupplied,
  currentCustodian: unsupplied,
  description: statefulValue(description),
  scriptStyle: unsupplied,
  transcription: unsupplied,
  historicalContext: unsupplied,
  scholarlyResearch: unsupplied,
});

const records = [
  {
    catalogId: "catalog-dev-acceptance-01",
    sourceId: "source-dev-acceptance-01",
    kind: "inscription",
    title: "验收样例一 · 热门评论示例（合成）",
    summary:
      "Development 验收用合成资料。评论区应先显示热门评论（按可见回复数），再显示最新评论；两者不重复。",
    periodLabel: "合成样例",
    ...statefulGroups(
      "这是一条仅存在于本地 Development 数据库的合成资料，用于验收社区评论的热门/最新显示、加载更多与审核状态。它不是真实碑刻记录。",
    ),
  },
  {
    catalogId: "catalog-dev-acceptance-02",
    sourceId: "source-dev-acceptance-02",
    kind: "inscription",
    title: "验收样例二 · 无热门评论（合成）",
    summary:
      "Development 验收用合成资料。评论区没有任何符合热门条件的根评论，只显示最新列表。",
    periodLabel: "合成样例",
    ...statefulGroups(
      "这是一条仅存在于本地 Development 数据库的合成资料。它的回复均处于待审核或已隐藏状态，因此不产生热度。",
    ),
  },
  {
    catalogId: "catalog-dev-acceptance-03",
    sourceId: "source-dev-acceptance-03",
    kind: "calligraphy",
    title: "验收样例三 · 空白评论区（合成）",
    summary:
      "Development 验收用合成资料。评论区为空，用于验证默认直接发布与切换为先审后发后的提交状态。",
    periodLabel: "合成样例",
    ...statefulGroups(
      "这是一条仅存在于本地 Development 数据库的合成资料，评论区初始为空。",
    ),
  },
] as const;

const payload = await getPayload({ config });
try {
  const owners = await payload.find({
    collection: "users",
    overrideAccess: true,
    where: { role: { equals: "owner" } },
    limit: 1,
  });
  const owner = owners.docs[0];
  if (owner === undefined) throw new Error("OWNER_ACCOUNT_REQUIRED");
  const req = await createLocalReq(
    { user: { ...owner, collection: "users" } },
    payload,
  );
  const summary: Record<string, string> = {};
  for (const record of records) {
    const existing = await payload.find({
      collection: "catalogs",
      overrideAccess: true,
      draft: true,
      where: { catalogId: { equals: record.catalogId } },
      limit: 1,
    });
    if (existing.totalDocs > 0) {
      summary[record.catalogId] = "kept";
      continue;
    }
    await payload.create({
      collection: "catalogs",
      overrideAccess: true,
      req,
      user: req.user,
      data: {
        ...record,
        _status: "published",
        revision: 0,
      },
    });
    summary[record.catalogId] = "published";
  }
  console.log(JSON.stringify({ communityAcceptanceSeed: summary }));
} finally {
  await payload.destroy();
}
