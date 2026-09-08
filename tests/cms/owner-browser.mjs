import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import {
  editorialDraftSchema,
  editorialContentFromDocument,
} from "@moya/contracts/internal/editorial";

// Run only against a task-created synthetic CMS. The access file is external,
// mode-restricted operator state, never an artifact or command-line secret.
let browser;
let stage = "configuration";
const completed = [];
const responseFailures = [];
const safeNativeFailures = [];
const requestShapeFailures = [];
let clientErrorCount = 0;
try {
  assert.equal(process.env.CMS_ENVIRONMENT, "synthetic");
  const access = JSON.parse(
    await readFile(process.env.CMS_QA_ACCESS_FILE, "utf8"),
  );
  const target = new URL(access.baseURL);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
  assert(["http:", "https:"].includes(target.protocol));
  assert(!target.username && !target.password);
  const origin = target.origin;
  stage = "launch";
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", () => {
    clientErrorCount += 1;
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      responseFailures.push({
        status: response.status(),
        type: response.request().resourceType(),
      });
  });
  const requestResult = async (response) => {
    const body = await response.json();
    if (!response.ok()) {
      try {
        const raw = response.request().postData();
        const json = raw.startsWith("{")
          ? raw
          : raw.match(/name="_payload"\r\n\r\n([\s\S]*?)\r\n--/)[1];
        const input = JSON.parse(json);
        const parsed = editorialDraftSchema.safeParse(
          editorialContentFromDocument(input),
        );
        if (!parsed.success)
          requestShapeFailures.push(
            parsed.error.issues.map(({ path }) =>
              path
                .map((part) =>
                  typeof part === "number" ? "row" : String(part),
                )
                .join("."),
            ),
          );
      } catch {
        requestShapeFailures.push(["UNAVAILABLE"]);
      }
      const encoded = JSON.stringify(body);
      safeNativeFailures.push({
        status: response.status(),
        codes: [
          "CONTENT_INVALID",
          "REVISION_REQUIRED",
          "REVISION_INVALID",
          "REVISION_CONFLICT",
          "IDENTITY_IMMUTABLE",
          "IDENTITY_ALREADY_BOUND",
          "TRANSACTION_REQUIRED",
          "CATALOG_OUT_OF_SCOPE",
        ].filter((code) => encoded.includes(code)),
        fields: [
          "kind",
          "title",
          "catalogId",
          "sourceId",
          "revision",
          "description",
          "transcription",
        ].filter((field) => encoded.includes(`"${field}"`)),
      });
    }
    assert(response.ok());
    return body.doc ?? body.result ?? body;
  };
  const saveResponse = () =>
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.startsWith("/api/catalogs") &&
        ["POST", "PATCH"].includes(response.request().method()),
    );
  stage = "login";
  await page.goto(`${origin}/admin/login`);
  await page.locator('input[name="email"]').fill(access.ownerEmail);
  await page.locator('input[name="password"]').fill(access.ownerPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/admin");
  completed.push(stage);

  stage = "native-create-renders-before-empty-write";
  await page.goto(`${origin}/admin/collections/catalogs/create`);
  await page.locator('input[name="title"]').waitFor({ state: "visible" });
  assert.equal(
    new URL(page.url()).pathname,
    "/admin/collections/catalogs/create",
  );
  const catalogId = await page.locator('input[name="catalogId"]').inputValue();
  const sourceId = await page.locator('input[name="sourceId"]').inputValue();
  assert(catalogId && sourceId && catalogId !== sourceId);
  completed.push(stage);

  stage = "native-incomplete-draft-save";
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "书法", exact: true }).click();
  const create = saveResponse();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  const created = await requestResult(await create);
  assert(created.id && created._status === "draft");
  assert(!created.title);
  await page.waitForURL(
    (url) => url.pathname === `/admin/collections/catalogs/${created.id}`,
  );
  completed.push(stage);

  stage = "native-publish";
  const publishedTitle = `Synthetic browser ${randomUUID()}`;
  await page.locator('input[name="title"]').fill(publishedTitle);
  const publish = saveResponse();
  await page.getByRole("button", { name: "发布修改", exact: true }).click();
  const published = await requestResult(await publish);
  assert.equal(published._status, "published");
  assert.equal(published.title, publishedTitle);
  const main = await requestResult(
    await page.request.get(
      `${origin}/api/catalogs/${created.id}?depth=0&draft=false`,
    ),
  );
  assert.equal(main.title, publishedTitle);
  await expect(page.locator('input[name="revision"]')).toHaveValue(
    String(published.revision),
  );
  completed.push(stage);

  stage = "native-new-draft-preserves-published";
  const draftTitle = `${publishedTitle} draft`;
  const edit = saveResponse();
  await page.locator('input[name="title"]').fill(draftTitle);
  // Existing native documents use Payload's configured autosave. The explicit
  // Save Draft button above is the validated new-document path.
  const draft = await requestResult(await edit);
  stage = "native-autosave-returns-draft";
  assert.equal(draft._status, "draft");
  const unchanged = await requestResult(
    await page.request.get(
      `${origin}/api/catalogs/${created.id}?depth=0&draft=false`,
    ),
  );
  stage = "native-autosave-preserves-main-title";
  assert.equal(unchanged.title, publishedTitle);
  stage = "native-autosave-preserves-main-revision";
  assert.equal(unchanged.revision, published.revision);
  completed.push(stage);

  stage = "owner-batch-approval";
  const account = await requestResult(
    await page.request.post(`${origin}/api/users`, {
      data: {
        email: `browser-${randomUUID()}@example.invalid`,
        password: randomUUID(),
        role: "automation",
        scopeCatalogIds: [catalogId],
      },
    }),
  );
  const summaries = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/editorial/owner-drafts",
  );
  await page.goto(`${origin}/admin/editorial-workflow`);
  const summary = await requestResult(await summaries);
  assert(
    summary.docs.some(
      (row) => row.id === created.id && row.revision === draft.revision,
    ),
  );
  await page
    .getByRole("checkbox", { name: `选择 ${draftTitle}`, exact: true })
    .check();
  await page
    .getByLabel("获准执行的自动化账号")
    .selectOption(String(account.id));
  const approvalResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/editorial/approve-batch",
  );
  await page.getByRole("button", { name: "批准所选批次", exact: true }).click();
  const approval = await requestResult(await approvalResponse);
  assert(approval.approvalId && approval.itemCount === 1);
  await page.getByRole("status").filter({ hasText: "已批准批次" }).waitFor();
  completed.push(stage);

  stage = "owner-history-restores-draft-only";
  const row = page.locator("li").filter({
    has: page.getByRole("checkbox", {
      name: `选择 ${draftTitle}`,
      exact: true,
    }),
  });
  const historyResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/editorial/owner-history",
  );
  await row.getByRole("button", { name: "历史恢复", exact: true }).click();
  const history = await requestResult(await historyResponse);
  assert.equal(history.id, created.id);
  const oldVersion = history.docs.find(
    (version) =>
      version.revision === published.revision && version.status === "published",
  );
  assert(oldVersion);
  await page.getByLabel("要恢复的历史内容").selectOption(String(oldVersion.id));
  const restoreResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/editorial/restore-draft",
  );
  await page
    .getByRole("button", { name: "恢复所选版本为新草稿", exact: true })
    .click();
  const restored = await requestResult(await restoreResponse);
  assert.equal(restored.revision, draft.revision + 1);
  const restoredDraft = await requestResult(
    await page.request.get(
      `${origin}/api/catalogs/${created.id}?depth=0&draft=true`,
    ),
  );
  assert.equal(restoredDraft.title, publishedTitle);
  assert.equal(restoredDraft._status, "draft");
  const stillPublished = await requestResult(
    await page.request.get(
      `${origin}/api/catalogs/${created.id}?depth=0&draft=false`,
    ),
  );
  assert.equal(stillPublished.title, publishedTitle);
  assert.equal(stillPublished.revision, published.revision);
  completed.push(stage);

  stage = "native-media-upload-and-draft-preview";
  await page.goto(`${origin}/admin/collections/catalogs/${created.id}`);
  await expect(page.locator('input[name="title"]')).toHaveValue(publishedTitle);
  await page
    .getByRole("button", { name: "上传原图并添加", exact: true })
    .click();
  const drawer = page.locator(".doc-drawer");
  await drawer.locator('input[name="alt"]').waitFor({ state: "visible" });
  const image = await sharp({
    create: {
      width: 4,
      height: 3,
      channels: 3,
      background: { r: 80, g: 120, b: 160 },
    },
  })
    .png()
    .toBuffer();
  await drawer.locator('input[type="file"]').setInputFiles({
    name: "synthetic-browser.png",
    mimeType: "image/png",
    buffer: image,
  });
  await drawer.locator('input[name="alt"]').fill("Synthetic native upload");
  const uploadedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/media" &&
      response.request().method() === "POST",
  );
  await drawer.getByRole("button", { name: "保存", exact: true }).click();
  const uploaded = await requestResult(await uploadedResponse);
  assert(uploaded.mediaId && uploaded.objectKey);
  assert.equal(uploaded.catalogId, catalogId);
  assert.equal(uploaded.width, 4);
  assert.equal(uploaded.height, 3);
  await drawer.waitFor({ state: "hidden" });
  await expect
    .poll(async () => {
      const response = await page.request.get(
        `${origin}/api/catalogs/${created.id}?depth=0&draft=true`,
      );
      if (!response.ok()) return false;
      const document = await response.json();
      return (
        document.media?.length === 1 &&
        document.media[0].mediaId === uploaded.mediaId
      );
    })
    .toBe(true);
  const mediaDraft = await requestResult(
    await page.request.get(
      `${origin}/api/catalogs/${created.id}?depth=0&draft=true`,
    ),
  );
  assert.equal(mediaDraft.media[0].objectKey, uploaded.objectKey);
  assert.equal(mediaDraft.media[0].isRepresentative, true);
  const preview = await requestResult(
    await page.request.get(`${origin}/api/editorial/preview/${created.id}`),
  );
  assert.equal(preview.media.length, 1);
  assert.equal(preview.media[0].id, uploaded.mediaId);
  assert.equal(preview.media[0].width, 4);
  assert.equal(preview.media[0].height, 3);
  const mediaURL = new URL(preview.media[0].src);
  assert.equal(mediaURL.origin, origin);
  const original = await page.request.get(mediaURL.href);
  assert(original.ok());
  assert.deepEqual(await original.body(), image);
  const publishedAfterMedia = await requestResult(
    await page.request.get(
      `${origin}/api/catalogs/${created.id}?depth=0&draft=false`,
    ),
  );
  assert.equal(publishedAfterMedia.media.length, 0);
  assert.equal(publishedAfterMedia.revision, published.revision);
  completed.push(stage);

  assert.equal(clientErrorCount, 0);
  assert.equal(responseFailures.length, 0);
  console.log(JSON.stringify({ ok: true, completed }));
} catch (error) {
  console.log(
    JSON.stringify({
      ok: false,
      stage,
      completed,
      category: ["AssertionError", "TimeoutError", "Error"].includes(
        error?.name,
      )
        ? error.name
        : "BROWSER_FAILED",
      responseFailures,
      safeNativeFailures,
      requestShapeFailures,
      clientErrorCount,
    }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {
    console.log(
      JSON.stringify({
        ok: false,
        stage: "browser-close",
        category: "BROWSER_FAILED",
      }),
    );
    process.exitCode = 1;
  });
}
