import { expect, test } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";

type PresentationPlatform = "phone" | "tablet" | "pc";

const expectedPlatform = (projectName: string): PresentationPlatform => {
  if (projectName === "mobile-webkit") return "phone";
  if (projectName.startsWith("tablet")) return "tablet";
  return "pc";
};

const openQaInscriptions = async (page: Page) => {
  const response = await page.goto("/dev/t02p/qa");
  expect(response?.status()).toBe(200);
  const surface = page.locator("[data-t02p-qa-harness]");
  const shell = surface.locator("[data-product-shell]");
  await surface
    .getByRole("navigation", { name: "主要内容" })
    .getByRole("button", { exact: true, name: "碑刻" })
    .click();
  await expect(shell).toHaveAttribute(
    "data-active-destination",
    "inscriptions",
  );
  const filter = shell.locator("[data-inscription-filter]");
  await expect(filter).toBeVisible();
  return { filter, shell, surface };
};

const visibleCatalogIds = (shell: Locator) =>
  shell
    .locator(
      '[data-primary-destination="inscriptions"]:not([hidden]) [data-catalog-card]',
    )
    .evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.catalogId ?? ""),
    );

test("QA filter is isolated from clean Development and formal routes", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");

  for (const path of ["/dev/t02p", "/"] as const) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-inscription-filter]")).toHaveCount(0);
  }

  await page.goto("/dev/t02p/qa");
  await expect(page.locator("[data-inscription-filter]")).toHaveCount(1);
});

test("QA filter stays visible on Home, Inscriptions and Calligraphy", async ({
  page,
}) => {
  const response = await page.goto("/dev/t02p/qa");
  expect(response?.status()).toBe(200);
  const surface = page.locator("[data-t02p-qa-harness]");
  const shell = surface.locator("[data-product-shell]");
  const navigation = surface.getByRole("navigation", { name: "主要内容" });
  const filter = shell.locator("[data-inscription-filter]");

  for (const [label, destination] of [
    ["首页", "home"],
    ["碑刻", "inscriptions"],
    ["书帖", "calligraphy"],
  ] as const) {
    await navigation.getByRole("button", { exact: true, name: label }).click();
    await expect(shell).toHaveAttribute("data-active-destination", destination);
    await expect(filter).toBeVisible();
    await expect(
      filter.getByRole("button", { name: "打开筛选" }),
    ).toBeVisible();
  }
});

test("PC opens every filter category on all primary destinations", async ({
  page,
}, testInfo) => {
  test.skip(expectedPlatform(testInfo.project.name) !== "pc");
  const response = await page.goto("/dev/t02p/qa");
  expect(response?.status()).toBe(200);
  const surface = page.locator("[data-t02p-qa-harness]");
  const shell = surface.locator("[data-product-shell]");
  const navigation = surface.getByRole("navigation", { name: "主要内容" });
  const filter = shell.locator("[data-inscription-filter]");

  for (const [label, destination] of [
    ["首页", "home"],
    ["碑刻", "inscriptions"],
    ["书帖", "calligraphy"],
  ] as const) {
    await navigation.getByRole("button", { exact: true, name: label }).click();
    await expect(shell).toHaveAttribute("data-active-destination", destination);
    await filter.getByRole("button", { name: "打开筛选" }).click();
    const panel = filter.locator("[data-filter-panel]");
    await expect(panel).toBeVisible();
    expect(
      await panel.evaluate((node) => getComputedStyle(node).overflow),
    ).toBe("visible");

    for (const category of ["dynasty", "script", "type", "region"] as const) {
      const categoryButton = filter.locator(
        `[data-filter-category="${category}"]`,
      );
      await categoryButton.click();
      await expect(categoryButton).toHaveAttribute("aria-expanded", "true");
      await expect(
        filter.locator(`[data-filter-popover="${category}"]`),
      ).toBeVisible();
      await categoryButton.click();
      await expect(
        filter.locator(`[data-filter-popover="${category}"]`),
      ).toHaveCount(0);
    }

    await filter.getByRole("button", { name: "关闭筛选" }).click();
  }
});

test("QA filter keeps Catalog records unchanged across platform-specific selection", async ({
  page,
}, testInfo) => {
  const { filter, shell } = await openQaInscriptions(page);
  const initialIds = await visibleCatalogIds(shell);
  expect(initialIds.length).toBe(12);

  const trigger = filter.locator("[data-filter-trigger]");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(filter.locator("[data-filter-panel]")).toBeVisible();
  const dynasty = filter.locator('[data-filter-category="dynasty"]');
  await dynasty.click();

  if (expectedPlatform(testInfo.project.name) === "pc") {
    await expect(
      filter.locator('[data-filter-popover="dynasty"]'),
    ).toBeVisible();
    await filter.getByRole("option", { name: "隋唐", exact: true }).click();
    await expect(filter.locator("[data-filter-sheet]")).toHaveCount(0);
  } else {
    const sheet = filter.locator('[data-filter-sheet="dynasty"]');
    await expect(sheet).toBeVisible();
    await expect(filter.locator("[data-filter-popover]")).toHaveCount(0);
    await sheet.getByLabel("隋唐", { exact: true }).check();
    await sheet.getByRole("button", { name: "确定" }).click();
    await expect(sheet).toHaveCount(0);
  }

  await expect(dynasty).toContainText("隋唐 ×");
  await expect(dynasty).toHaveAttribute("data-selected", "");
  expect(await visibleCatalogIds(shell)).toEqual(initialIds);

  await filter.locator("[data-filter-reset]").click();
  await expect(dynasty).toContainText("朝代⌄");
  expect(await visibleCatalogIds(shell)).toEqual(initialIds);
});

test("compact sheet cancels drafts and Escape restores focus", async ({
  page,
}, testInfo) => {
  test.skip(expectedPlatform(testInfo.project.name) === "pc");
  const { filter } = await openQaInscriptions(page);
  const trigger = filter.locator("[data-filter-trigger]");
  await trigger.click();
  const script = filter.locator('[data-filter-category="script"]');
  await script.click();
  const sheet = filter.locator('[data-filter-sheet="script"]');
  await sheet.getByLabel("行书", { exact: true }).check();
  await sheet.getByRole("button", { name: "取消" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(script).toContainText("书体⌄");
  await expect(script).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(filter.locator("[data-filter-panel]")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("all approved viewport matrices keep the bubbles aligned and chips in one row", async ({
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

  const { filter, shell } = await openQaInscriptions(page);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(shell).toHaveAttribute(
      "data-platform",
      expectedPlatform(testInfo.project.name),
    );
    const settingsBox = await shell
      .getByRole("button", { name: "打开设置" })
      .boundingBox();
    const filterBox = await filter
      .getByRole("button", { name: "打开筛选" })
      .boundingBox();
    if (settingsBox === null || filterBox === null) {
      throw new Error(
        `Missing utility geometry at ${viewport.width}x${viewport.height}`,
      );
    }
    expect(
      Math.abs(
        settingsBox.x +
          settingsBox.width / 2 -
          (filterBox.x + filterBox.width / 2),
      ),
    ).toBeLessThanOrEqual(1);
    expect(filterBox.y - (settingsBox.y + settingsBox.height)).toBe(8);

    await filter.getByRole("button", { name: "打开筛选" }).click();
    const chipTops = await filter
      .locator("[data-filter-panel] button")
      .evaluateAll((buttons) =>
        buttons
          .slice(0, 5)
          .map((button) => Math.round(button.getBoundingClientRect().top)),
      );
    expect(new Set(chipTops).size).toBe(1);
    const panelBox = await filter.locator("[data-filter-panel]").boundingBox();
    if (panelBox === null) throw new Error("Missing filter panel geometry");
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width + 1);
    await filter.getByRole("button", { name: "关闭筛选" }).click();
  }
});
