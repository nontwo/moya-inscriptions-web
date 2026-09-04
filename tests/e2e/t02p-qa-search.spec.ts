import { expect, test } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";

type PresentationPlatform = "phone" | "tablet" | "pc";

const expectedPlatform = (projectName: string): PresentationPlatform => {
  if (projectName === "mobile-webkit") return "phone";
  if (projectName.startsWith("tablet")) return "tablet";
  return "pc";
};

const openQa = async (page: Page) => {
  const response = await page.goto("/dev/t02p/qa");
  expect(response?.status()).toBe(200);
  const surface = page.locator("[data-t02p-qa-harness]");
  const shell = surface.locator("[data-product-shell]");
  const search = shell.locator("[data-t02p-qa-search]");
  await expect(search).toBeVisible();
  return { search, shell, surface };
};

const visibleCatalogIds = (shell: Locator) =>
  shell
    .locator(
      '[data-primary-destination="inscriptions"]:not([hidden]) [data-catalog-card]',
    )
    .evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.catalogId ?? ""),
    );

test("QA search is isolated from clean Development and formal routes", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");

  for (const path of ["/dev/t02p", "/"] as const) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-t02p-qa-search]")).toHaveCount(0);
  }

  await page.goto("/dev/t02p/qa");
  await expect(page.locator("[data-t02p-qa-search]")).toHaveCount(1);
});

test("search interactions emit presentation intent without changing Catalog data", async ({
  page,
}, testInfo) => {
  const { search, shell, surface } = await openQa(page);
  await surface
    .getByRole("navigation", { name: "主要内容" })
    .getByRole("button", { exact: true, name: "碑刻" })
    .click();
  await expect(shell).toHaveAttribute(
    "data-active-destination",
    "inscriptions",
  );
  const initialIds = await visibleCatalogIds(shell);
  expect(initialIds.length).toBe(12);
  await expect(shell.locator("[data-inscription-filter]")).toBeVisible();

  const trigger = search.locator("[data-search-trigger]");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  const input = search.getByRole("searchbox", { name: "搜索关键词" });
  await expect(input).toBeFocused();
  await input.fill("  龙门石窟  ");
  await search.locator("[data-search-submit]").click();
  await expect(search.locator("[data-search-intent-status]")).toHaveText(
    "已记录搜索意图：龙门石窟",
  );
  expect(await visibleCatalogIds(shell)).toEqual(initialIds);

  await search.locator("[data-search-clear]").click();
  await expect(input).toHaveValue("");
  await expect(search.getByText("最近搜索", { exact: true })).toBeVisible();
  await search.locator('[data-search-suggestion="碑刻"]').click();
  await expect(input).toHaveValue("碑刻");
  await expect(search.locator("[data-search-intent-status]")).toHaveText(
    "已记录建议意图：碑刻",
  );
  expect(await visibleCatalogIds(shell)).toEqual(initialIds);

  await page.keyboard.press("Escape");
  await expect(search.locator("[data-search-panel]")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await shell.getByRole("button", { name: "打开设置" }).click();
  await expect(shell.getByRole("dialog", { name: "设置" })).toBeVisible();
  await expect(shell.locator("[data-product-primary-layer]")).toHaveAttribute(
    "inert",
    "",
  );
  await shell
    .getByRole("dialog", { name: "设置" })
    .getByRole("button", { name: "返回" })
    .click();
  await expect(shell.getByRole("button", { name: "打开设置" })).toBeFocused();

  await expect(shell).toHaveAttribute(
    "data-platform",
    expectedPlatform(testInfo.project.name),
  );
});

test("QA scenarios expose default, open, typing and explicit empty states", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const { search, surface } = await openQa(page);
  const selector = surface.getByRole("combobox", {
    name: "QA Search scenario",
  });

  await expect(search.locator("[data-search-panel]")).toHaveCount(0);
  await selector.selectOption("search-open");
  await expect(search.locator("[data-search-panel]")).toBeVisible();
  await expect(search.getByRole("searchbox")).toHaveValue("");

  await selector.selectOption("search-typing");
  await expect(search.getByRole("searchbox")).toHaveValue("龙门");
  await expect(search.getByText("QA 搜索建议", { exact: true })).toBeVisible();

  await selector.selectOption("search-empty");
  await expect(search.getByRole("searchbox")).toHaveValue("未收录题刻");
  await expect(search.locator("[data-search-empty]")).toContainText(
    "没有找到相关内容",
  );
  await expect(search.locator("[data-search-empty]")).toContainText(
    "QA 视觉状态",
  );

  await selector.selectOption("search-default");
  await expect(search.locator("[data-search-panel]")).toHaveCount(0);
});

test("all approved viewport matrices keep Search left of Settings and in bounds", async ({
  page,
}, testInfo) => {
  const matrices = {
    "desktop-chromium": [
      { width: 1280, height: 720 },
      { width: 1512, height: 827 },
      { width: 1920, height: 1080 },
    ],
    "mobile-webkit": [
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 812, height: 375 },
      { width: 844, height: 390 },
      { width: 932, height: 430 },
    ],
    "tablet-webkit": [
      { width: 768, height: 1024 },
      { width: 820, height: 1180 },
      { width: 834, height: 1112 },
      { width: 1024, height: 768 },
      { width: 1180, height: 820 },
      { width: 1194, height: 834 },
    ],
  } as const;
  const viewports = matrices[testInfo.project.name as keyof typeof matrices];
  test.skip(viewports === undefined);
  if (viewports === undefined) return;

  const { search, shell } = await openQa(page);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(shell).toHaveAttribute(
      "data-platform",
      expectedPlatform(testInfo.project.name),
    );
    const settingsBox = await shell
      .getByRole("button", { name: "打开设置" })
      .boundingBox();
    const searchBox = await search
      .locator("[data-search-trigger]")
      .boundingBox();
    if (settingsBox === null || searchBox === null) {
      throw new Error(
        `Missing utility geometry at ${viewport.width}x${viewport.height}`,
      );
    }
    expect(Math.abs(settingsBox.y - searchBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(settingsBox.height - searchBox.height)).toBeLessThanOrEqual(
      1,
    );
    expect(Math.abs(settingsBox.width - searchBox.width)).toBeLessThanOrEqual(
      1,
    );
    expect(settingsBox.x - (searchBox.x + searchBox.width)).toBe(8);

    await search.locator("[data-search-trigger]").click();
    const panelBox = await search.locator("[data-search-panel]").boundingBox();
    if (panelBox === null) throw new Error("Missing search panel geometry");
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.y).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(
      viewport.height + 1,
    );
    await page.keyboard.press("Escape");
  }
});

test("Search stays legible through system, light and dark theme preferences", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const { search, shell } = await openQa(page);

  for (const preference of ["system", "light", "dark"] as const) {
    await expect(shell).toHaveAttribute("data-theme-preference", preference);
    const triggerColor = await search
      .locator("[data-search-trigger]")
      .evaluate((node) => ({
        border: getComputedStyle(node).borderColor,
        color: getComputedStyle(node).color,
      }));
    expect(triggerColor.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(triggerColor.border).not.toBe("rgba(0, 0, 0, 0)");
    if (preference === "dark") break;

    await shell.getByRole("button", { name: "打开设置" }).click();
    const settings = shell.getByRole("dialog", { name: "设置" });
    await settings.getByRole("button", { name: /切换主题/ }).click();
    await settings.getByRole("button", { name: "返回" }).click();
  }
});
