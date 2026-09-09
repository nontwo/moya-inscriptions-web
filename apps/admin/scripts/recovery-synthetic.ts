import { readFile } from "node:fs/promises";
import { createLocalReq, getPayload } from "payload";
import config from "../payload.config";
if (process.env.CMS_ENVIRONMENT !== "synthetic")
  throw new Error("SYNTHETIC_ENVIRONMENT_REQUIRED");
const database = new URL(process.env.CMS_DATABASE_URL ?? "");
if (!database.pathname.startsWith("/cms_restore_qa_"))
  throw new Error("RESTORED_SYNTHETIC_DATABASE_REQUIRED");
const handoff = process.env.CMS_QA_HANDOFF_FILE;
if (!handoff) throw new Error("SYNTHETIC_HANDOFF_REQUIRED");
const settings = JSON.parse(await readFile(handoff, "utf8")) as {
  ownerEmail: string;
  ownerPassword: string;
  ownerId: number;
};
const payload = await getPayload({ config });
try {
  const result = await payload.login({
    collection: "users",
    data: { email: settings.ownerEmail, password: settings.ownerPassword },
  });
  if (!result.user || result.user.id !== settings.ownerId)
    throw new Error("RESTORED_IDENTITY_MISMATCH");
  const req = await createLocalReq(
    { user: { ...result.user, collection: "users" } },
    payload,
  );
  const catalogs = await payload.count({
    collection: "catalogs",
    req,
    user: req.user,
    overrideAccess: false,
  });
  const versions = await payload.countVersions({
    collection: "catalogs",
    req,
    user: req.user,
    overrideAccess: false,
  });
  const media = await payload.count({
    collection: "media",
    req,
    user: req.user,
    overrideAccess: false,
  });
  if (
    catalogs.totalDocs < 10000 ||
    versions.totalDocs < catalogs.totalDocs ||
    media.totalDocs === 0
  )
    throw new Error("RESTORED_CONTENT_MISMATCH");
  console.log(
    JSON.stringify({
      syntheticRestoredProcess: "PASS",
      ownerLogin: "PASS",
      catalogs: catalogs.totalDocs,
      versions: versions.totalDocs,
      media: media.totalDocs,
      poolConnections: payload.db.pool.totalCount,
    }),
  );
} finally {
  await payload.destroy();
}
