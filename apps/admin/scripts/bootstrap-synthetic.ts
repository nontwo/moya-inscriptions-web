import { randomBytes } from "node:crypto";
import { writeFile, chmod } from "node:fs/promises";
import { getPayload } from "payload";
import config from "../payload.config";
if (process.env.CMS_ENVIRONMENT !== "synthetic")
  throw new Error("SYNTHETIC_ENVIRONMENT_REQUIRED");
const destination = process.env.CMS_QA_HANDOFF_FILE;
if (!destination) throw new Error("SYNTHETIC_HANDOFF_REQUIRED");
const payload = await getPayload({ config });
try {
  const ownerEmail = "owner@editorial.example.invalid";
  const automationEmail = "automation@editorial.example.invalid";
  const ownerPassword = randomBytes(24).toString("hex");
  const automationPassword = randomBytes(24).toString("hex");
  const existing = await payload.find({
    collection: "users",
    where: { email: { equals: ownerEmail } },
    limit: 1,
  });
  if (existing.totalDocs) throw new Error("SYNTHETIC_OWNER_ALREADY_EXISTS");
  const owner = await payload.create({
    collection: "users",
    overrideAccess: true,
    data: {
      email: ownerEmail,
      password: ownerPassword,
      role: "owner",
      scopeCatalogIds: [],
    },
  });
  const automation = await payload.create({
    collection: "users",
    overrideAccess: true,
    data: {
      email: automationEmail,
      password: automationPassword,
      role: "automation",
      scopeCatalogIds: ["catalog-synthetic-mcp-1", "catalog-synthetic-mcp-2"],
    },
  });
  const bearer = randomBytes(32).toString("hex");
  const restKey = randomBytes(32).toString("hex");
  await payload.update({
    collection: "users",
    id: automation.id,
    overrideAccess: true,
    data: { enableAPIKey: true, apiKey: restKey },
  });
  await payload.create({
    collection: "payload-mcp-api-keys",
    overrideAccess: true,
    data: {
      user: automation.id,
      label: "Synthetic Codex editorial",
      enableAPIKey: true,
      apiKey: bearer,
      "payload-mcp-tool": {
        editorialQuery: true,
        editorialRead: true,
        editorialSaveDraft: true,
        editorialPublishApproved: true,
        editorialBatchResults: true,
      },
    },
  });
  await writeFile(
    destination,
    JSON.stringify({
      ownerEmail,
      ownerPassword,
      ownerId: owner.id,
      automationEmail,
      automationPassword,
      automationId: automation.id,
      bearer,
      restKey,
    }),
    { mode: 0o600, flag: "wx" },
  );
  await chmod(destination, 0o600);
  console.log(
    JSON.stringify({
      syntheticBootstrap: "created",
      identities: 2,
      mcpKey: "scoped",
    }),
  );
} finally {
  await payload.destroy();
}
