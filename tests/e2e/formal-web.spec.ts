import { expect, test } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";

const runtimeIds = {
  calligraphy: "runtime-calligraphy",
  mismatch: "runtime-identity-mismatch",
  multiMedia: "runtime-inscription-multi-media",
  noMedia: "runtime-inscription-no-media",
} as const;

const waitForUsableFormalRoot = async (page: Page) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-formal-root",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-runtime-environment",
    "development",
  );
  await expect(page.locator("[data-mobile-app]")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator("[data-loading-screen]")).toBeHidden();
};

const primaryNavigation = (page: Page) =>
  page.getByRole("navigation", { name: "主导航" });

const selectPrimaryDestination = async (page: Page, name: string) => {
  const button = primaryNavigation(page).getByRole("button", {
    exact: true,
    name,
  });
  await button.click();
  await expect(button).toHaveAttribute("aria-current", "page");
};

const runtimeCard = (root: Locator, catalogId: string): Locator =>
  root.locator(
    `[data-record-origin="runtime"][data-content-id="${catalogId}"]`,
  );

const expectLoadedDetail = async (page: Page, title: string) => {
  const detail = page.locator('[data-view="detail"]');
  await expect(detail).toHaveAttribute("data-detail-state", "loaded");
  await expect(detail.locator("[data-detail-title]")).toHaveText(title);
  return detail;
};

test("Formal root becomes usable and primary destinations preserve runtime identity", async ({
  page,
}) => {
  await waitForUsableFormalRoot(page);

  await selectPrimaryDestination(page, "碑刻");
  const inscriptionView = page.locator('[data-view="inscriptions"]');
  const inscription = runtimeCard(inscriptionView, runtimeIds.noMedia);
  await expect(inscription).toContainText("运行时无图碑刻");

  const qaInscription = page.locator(
    '[data-view="inscriptions"] [data-content-id="inscription-yunfeng"]',
  );
  await expect(qaInscription).toContainText("云峰山题名");
  await expect(qaInscription).not.toHaveAttribute(
    "data-record-origin",
    "runtime",
  );

  await selectPrimaryDestination(page, "书帖");
  await expect(
    runtimeCard(
      page.locator('[data-view="calligraphy"]'),
      runtimeIds.calligraphy,
    ),
  ).toContainText("运行时书帖");

  await selectPrimaryDestination(page, "首页");
  await expect(
    runtimeCard(
      page.locator('[data-feed-grid="discover"]'),
      runtimeIds.multiMedia,
    ),
  ).toContainText("运行时多图碑刻");
});

test("Catalog Detail deep link loads the requested CatalogId", async ({
  page,
}) => {
  await page.goto(`/catalog/${runtimeIds.multiMedia}`);

  await expect(page.locator("html")).toHaveAttribute(
    "data-formal-root",
    "true",
  );
  await expect(page.locator("[data-mobile-app]")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expectLoadedDetail(page, "运行时多图碑刻");
});

test("A mismatched Public Detail identity never replaces the selected resource", async ({
  page,
}) => {
  await waitForUsableFormalRoot(page);
  await selectPrimaryDestination(page, "碑刻");
  await runtimeCard(
    page.locator('[data-view="inscriptions"]'),
    runtimeIds.mismatch,
  ).click();

  const detail = page.locator('[data-view="detail"]');
  await expect(detail).toHaveAttribute("data-detail-state", "error");
  await expect(detail).not.toContainText("错误替代资源");
});

test("No-media Detail remains truthful and back returns to Browse", async ({
  page,
}) => {
  await waitForUsableFormalRoot(page);
  await selectPrimaryDestination(page, "碑刻");
  const inscriptionView = page.locator('[data-view="inscriptions"]');
  await runtimeCard(inscriptionView, runtimeIds.noMedia).click();

  const detail = await expectLoadedDetail(page, "运行时无图碑刻");
  const mediaButton = detail.locator("[data-detail-media-open]");
  await expect(mediaButton).toBeDisabled();
  await expect(mediaButton).toHaveAccessibleName("暂无图像");
  await expect(detail.locator("[data-detail-media-fallback]")).toBeVisible();
  await expect(detail.locator("[data-detail-image]")).not.toHaveAttribute(
    "src",
    /.+/,
  );

  await detail.getByRole("button", { name: "返回", exact: true }).click();
  await expect(
    primaryNavigation(page).getByRole("button", {
      exact: true,
      name: "碑刻",
    }),
  ).toHaveAttribute("aria-current", "page");
  await expect(runtimeCard(inscriptionView, runtimeIds.noMedia)).toContainText(
    "运行时无图碑刻",
  );
});

test("Multi-media selection, focused viewer, and Catalog selection survive a viewport transition", async ({
  page,
}) => {
  await waitForUsableFormalRoot(page);
  await selectPrimaryDestination(page, "碑刻");
  await runtimeCard(
    page.locator('[data-view="inscriptions"]'),
    runtimeIds.multiMedia,
  ).click();

  const detail = await expectLoadedDetail(page, "运行时多图碑刻");
  await detail.getByRole("button", { name: "第 2 张" }).click();
  await expect(detail.locator("[data-detail-media-index]")).toHaveText("2/2");
  await expect(detail.locator("[data-detail-image]")).toHaveAttribute(
    "alt",
    "运行时多图碑刻局部",
  );

  const viewport = page.viewportSize();
  await page.setViewportSize(
    viewport && viewport.width < 700
      ? { height: 900, width: 1024 }
      : { height: 900, width: 430 },
  );
  await expectLoadedDetail(page, "运行时多图碑刻");
  await expect(detail.locator("[data-detail-media-index]")).toHaveText("2/2");

  await detail.getByRole("button", { name: "查看图像" }).click();
  const viewer = detail.getByRole("dialog", { name: "图像查看" });
  await expect(viewer).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.locator("[data-detail-focus-image]")).toHaveAttribute(
    "alt",
    "运行时多图碑刻正面",
  );
  await expect(viewer.locator("[data-detail-focus-index]")).toHaveText("1 / 2");

  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expectLoadedDetail(page, "运行时多图碑刻");
});
