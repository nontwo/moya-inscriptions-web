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

const navigateTo = async (
  surface: Locator,
  shell: Locator,
  label: "首页" | "碑刻" | "书帖",
  destination: "home" | "inscriptions" | "calligraphy",
) => {
  await surface
    .getByRole("navigation", { name: "主要内容" })
    .getByRole("button", { exact: true, name: label })
    .click();
  await expect(shell).toHaveAttribute("data-active-destination", destination);
};

const visibleCatalogSnapshot = (shell: Locator) =>
  shell
    .locator(
      '[data-primary-destination="inscriptions"]:not([hidden]) [data-catalog-card]',
    )
    .evaluateAll((cards) =>
      cards.map((card) => ({
        id: (card as HTMLElement).dataset.catalogId ?? "",
        kind: (card as HTMLElement).dataset.catalogKind ?? "",
        media: Array.from(card.querySelectorAll("img")).map((image) => ({
          alt: image.alt,
          src: image.getAttribute("src") ?? "",
        })),
        text: (card.textContent ?? "").replace(/\s+/g, " ").trim(),
      })),
    );

const expectOpaqueSurface = async (surface: Locator) => {
  const colors = await surface.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      border: style.borderColor,
      foreground: style.color,
    };
  });

  for (const value of Object.values(colors)) {
    expect(value).not.toBe("transparent");
    expect(value).not.toBe("rgba(0, 0, 0, 0)");
  }
};

const contrastRatio = (foreground: string, background: string) => {
  const luminance = (color: string) => {
    const channels = color
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    if (channels?.length !== 3) throw new Error(`Unsupported color: ${color}`);
    const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
};

const expectTextContrast = async (text: Locator, background: Locator) => {
  const [foregroundColor, backgroundColor] = await Promise.all([
    text.evaluate((node) => getComputedStyle(node).color),
    background.evaluate((node) => getComputedStyle(node).backgroundColor),
  ]);
  expect(
    contrastRatio(foregroundColor, backgroundColor),
  ).toBeGreaterThanOrEqual(4.5);
};

test("QA Search and Filter stay isolated from Formal and clean Development", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");

  for (const path of ["/dev/t02p", "/"] as const) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-t02p-qa-search]")).toHaveCount(0);
    await expect(page.locator("[data-inscription-filter]")).toHaveCount(0);
  }

  const { search, shell } = await openQa(page);
  await expect(search).toBeVisible();
  await expect(shell.locator("[data-inscription-filter]")).toHaveCount(0);
});

test("Search remains global while Filter follows the active destination", async ({
  page,
}) => {
  const { search, shell, surface } = await openQa(page);

  for (const [label, destination, filterVisible] of [
    ["首页", "home", false],
    ["碑刻", "inscriptions", true],
    ["书帖", "calligraphy", false],
  ] as const) {
    await navigateTo(surface, shell, label, destination);
    await expect(search).toBeVisible();
    await expect(shell.locator("[data-inscription-filter]")).toHaveCount(
      filterVisible ? 1 : 0,
    );
  }
});

test("search intents preserve Catalog identity, data and order while close actions restore focus", async ({
  page,
}, testInfo) => {
  const { search, shell, surface } = await openQa(page);
  await navigateTo(surface, shell, "碑刻", "inscriptions");
  const initialSnapshot = await visibleCatalogSnapshot(shell);
  expect(initialSnapshot.length).toBeGreaterThan(0);

  const trigger = search.locator("[data-search-trigger]");
  await expect(trigger).toHaveAttribute("aria-label", "打开搜索");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-label", "关闭搜索");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const input = search.getByRole("searchbox", { name: "搜索关键词" });
  await expect(input).toBeFocused();
  await input.fill("  龙门石窟  ");
  await search.locator("[data-search-submit]").click();
  await expect(search.locator("[data-search-intent-status]")).toHaveText(
    "已记录搜索意图：龙门石窟",
  );
  expect(await visibleCatalogSnapshot(shell)).toEqual(initialSnapshot);

  await search.locator("[data-search-clear]").click();
  await expect(input).toHaveValue("");
  await expect(search.getByText("最近搜索", { exact: true })).toBeVisible();
  await search.locator('[data-search-suggestion="碑刻"]').click();
  await expect(input).toHaveValue("碑刻");
  await expect(search.locator("[data-search-intent-status]")).toHaveText(
    "已记录建议意图：碑刻",
  );
  expect(await visibleCatalogSnapshot(shell)).toEqual(initialSnapshot);

  await search.locator("[data-search-close]").click();
  await expect(search.locator("[data-search-panel]")).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-label", "打开搜索");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search.locator("[data-search-panel]")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await expect(shell.locator("[data-open-settings]")).toHaveCount(0);
  await expect(shell.locator("[data-user-trigger]")).toBeVisible();
  await expect(shell).toHaveAttribute(
    "data-platform",
    expectedPlatform(testInfo.project.name),
  );
  expect(await visibleCatalogSnapshot(shell)).toEqual(initialSnapshot);
});

test("the seeded empty scenario returns to ordinary suggestions after every user edit path", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const { search, surface } = await openQa(page);
  const selector = surface.getByRole("combobox", {
    name: "QA Search scenario",
  });

  const seedEmptyScenario = async () => {
    await selector.selectOption("search-default");
    await expect(search.locator("[data-search-panel]")).toHaveCount(0);
    await selector.selectOption("search-empty");
    await expect(search.locator("[data-search-empty]")).toBeVisible();
    const input = search.getByRole("searchbox", { name: "搜索关键词" });
    await expect(input).toHaveValue("未收录题刻");
    return input;
  };

  let input = await seedEmptyScenario();
  await input.fill("龙门");
  await expect(search.locator("[data-search-empty]")).toHaveCount(0);
  await expect(search.getByText("QA 搜索建议", { exact: true })).toBeVisible();

  input = await seedEmptyScenario();
  await search.locator("[data-search-clear]").click();
  await expect(input).toHaveValue("");
  await expect(search.locator("[data-search-empty]")).toHaveCount(0);
  await expect(search.getByText("最近搜索", { exact: true })).toBeVisible();

  input = await seedEmptyScenario();
  await input.fill("龙门");
  await search.locator('[data-search-suggestion="龙门石窟"]').click();
  await expect(input).toHaveValue("龙门石窟");
  await expect(search.locator("[data-search-empty]")).toHaveCount(0);
  await expect(search.locator("[data-search-intent-status]")).toHaveText(
    "已记录建议意图：龙门石窟",
  );
});

test("pointer and keyboard utility switches preserve the newly requested focus owner", async ({
  page,
}) => {
  const { search, shell, surface } = await openQa(page);
  await navigateTo(surface, shell, "碑刻", "inscriptions");
  const searchTrigger = search.locator("[data-search-trigger]");
  const filter = shell.locator("[data-inscription-filter]");
  const filterTrigger = filter.locator("[data-filter-trigger]");
  const settingsTrigger = shell.getByRole("button", { name: "打开设置" });

  await searchTrigger.click();
  await expect(search.locator("[data-search-panel]")).toBeVisible();
  await settingsTrigger.click();
  await expect(search.locator("[data-search-panel]")).toHaveCount(0);
  const settings = shell.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await expect(shell.locator("[data-product-primary-layer]")).toHaveAttribute(
    "inert",
    "",
  );
  const settingsBack = settings.getByRole("button", { name: "返回" });
  await expect(settingsBack).toBeFocused();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(settingsBack).toBeFocused();
  await settingsBack.click();
  await expect(settings).toHaveCount(0);
  await expect(settingsTrigger).toBeFocused();

  await searchTrigger.click();
  await expect(search.locator("[data-search-panel]")).toBeVisible();
  await filterTrigger.click();
  await expect(search.locator("[data-search-panel]")).toHaveCount(0);
  await expect(filter.locator("[data-filter-panel]")).toBeVisible();
  await expect(filterTrigger).toBeFocused();

  await searchTrigger.click();
  await expect(filter.locator("[data-filter-panel]")).toHaveCount(0);
  await expect(search.locator("[data-search-panel]")).toBeVisible();
  await expect(
    search.getByRole("searchbox", { name: "搜索关键词" }),
  ).toBeFocused();

  await search.locator("[data-search-close]").click();
  await searchTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(search.locator("[data-search-panel]")).toBeVisible();
  await settingsTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(search.locator("[data-search-panel]")).toHaveCount(0);
  await expect(shell.getByRole("dialog", { name: "设置" })).toBeVisible();
  await expect(
    shell.getByRole("dialog", { name: "设置" }).getByRole("button", {
      name: "返回",
    }),
  ).toBeFocused();
  await shell
    .getByRole("dialog", { name: "设置" })
    .getByRole("button", { name: "返回" })
    .click();
  await expect(search.locator("[data-search-panel]")).toHaveCount(0);
  await expect(shell.getByRole("dialog", { name: "设置" })).toHaveCount(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(settingsTrigger).toBeFocused();

  await filterTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(filter.locator("[data-filter-panel]")).toBeVisible();
  await settingsTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(filter.locator("[data-filter-panel]")).toHaveCount(0);
  await expect(shell.getByRole("dialog", { name: "设置" })).toBeVisible();
});

test("all approved viewport matrices keep Search left of User and in bounds", async ({
  page,
}, testInfo) => {
  const matrices = {
    "desktop-chromium": [
      { height: 720, width: 1280 },
      { height: 827, width: 1512 },
      { height: 1080, width: 1920 },
    ],
    "mobile-webkit": [
      { height: 812, width: 375 },
      { height: 844, width: 390 },
      { height: 932, width: 430 },
      { height: 375, width: 812 },
      { height: 390, width: 844 },
      { height: 430, width: 932 },
    ],
    "tablet-webkit": [
      { height: 1024, width: 768 },
      { height: 1180, width: 820 },
      { height: 1112, width: 834 },
      { height: 768, width: 1024 },
      { height: 820, width: 1180 },
      { height: 834, width: 1194 },
    ],
  } as const;
  const viewports = matrices[testInfo.project.name as keyof typeof matrices];
  test.skip(viewports === undefined);
  if (viewports === undefined) return;

  const { search, shell, surface } = await openQa(page);
  await navigateTo(surface, shell, "碑刻", "inscriptions");
  const trigger = search.locator("[data-search-trigger]");
  const filterTrigger = shell.locator("[data-filter-trigger]");
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(shell).toHaveAttribute(
      "data-platform",
      expectedPlatform(testInfo.project.name),
    );
    const userBox = await shell.locator("[data-user-trigger]").boundingBox();
    const searchBox = await trigger.boundingBox();
    const filterBox = await filterTrigger.boundingBox();
    if (userBox === null || searchBox === null || filterBox === null) {
      throw new Error(
        `Missing utility geometry at ${viewport.width}x${viewport.height}`,
      );
    }
    expect(Math.abs(userBox.y - searchBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(userBox.height - searchBox.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(userBox.width - searchBox.width)).toBeLessThanOrEqual(1);
    expect(userBox.x - (searchBox.x + searchBox.width)).toBe(8);
    expect(filterBox.x).toBeGreaterThanOrEqual(0);
    expect(filterBox.x + filterBox.width).toBeLessThanOrEqual(
      viewport.width + 1,
    );

    await trigger.click();
    const panel = search.locator("[data-search-panel]");
    const panelBox = await panel.boundingBox();
    if (panelBox === null) throw new Error("Missing search panel geometry");
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.y).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(
      viewport.height + 1,
    );
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(filterBox.x + 1);

    await search.locator("[data-search-close]").click();
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test("Search remains legible through themes and respects reduced motion", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const { search, shell } = await openQa(page);
  const trigger = search.locator("[data-search-trigger]");

  for (const preference of ["system", "light", "dark"] as const) {
    await expect(shell).toHaveAttribute("data-theme-preference", preference);
    await trigger.click();
    await expectOpaqueSurface(trigger);
    const panel = search.locator("[data-search-panel]");
    await expectOpaqueSurface(panel);
    await expectTextContrast(
      search.getByRole("heading", { name: "最近搜索" }),
      search.locator("[data-search-content]"),
    );
    await search.locator("[data-search-close]").click();
    await expect(trigger).toBeFocused();

    if (preference === "dark") break;
    await shell.locator("[data-user-trigger]").click();
    const userPage = shell.getByRole("dialog", { name: "用户页" });
    await userPage.getByRole("button", { name: "打开设置" }).click();
    const settings = shell.getByRole("dialog", { name: "设置" });
    await expect(settings).toBeVisible();
    await settings.getByRole("button", { name: /切换主题/ }).click();
    await settings.getByRole("button", { name: "返回" }).click();
    await expect(settings).toHaveCount(0);
    await expect(
      userPage.getByRole("button", { name: "打开设置" }),
    ).toBeFocused();
    await userPage.getByRole("button", { name: "关闭用户页" }).click();
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.click();
  await expect
    .poll(() =>
      search
        .locator("[data-search-panel]")
        .evaluate((node) => getComputedStyle(node).animationName),
    )
    .toBe("none");
});
