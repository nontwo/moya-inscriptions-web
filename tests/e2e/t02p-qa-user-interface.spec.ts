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
  const trigger = shell.locator("[data-user-trigger]");
  await expect(trigger).toBeVisible();
  return { shell, surface, trigger };
};

const openUser = async (shell: Locator, trigger: Locator) => {
  await trigger.click();
  const userPage = shell.getByRole("dialog", { name: "用户页" });
  await expect(userPage).toBeVisible();
  return userPage;
};

test("QA user UI is isolated from clean Development and formal routes", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");

  for (const path of ["/dev/t02p", "/"] as const) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-qa-user-interface]")).toHaveCount(0);
    await expect(page.locator("[data-open-settings]")).toHaveCount(1);
  }

  const { shell } = await openQa(page);
  await expect(shell.locator("[data-qa-user-interface]")).toHaveCount(1);
  await expect(shell.locator("[data-open-settings]")).toHaveCount(0);
});

test("User opens on published content and reuses the ProductShell Settings owner", async ({
  page,
}, testInfo) => {
  const { shell, trigger } = await openQa(page);
  const userPage = await openUser(shell, trigger);

  await expect(userPage.getByRole("tab", { name: "发布" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    userPage.getByRole("heading", { name: "我发布过的内容" }),
  ).toBeVisible();
  await expect(userPage.locator("[data-user-content-list] > div")).toHaveCount(
    8,
  );
  await expect(
    userPage.getByRole("button", { name: "关闭用户页" }),
  ).toBeFocused();

  const settingsEntry = userPage.getByRole("button", { name: "打开设置" });
  await settingsEntry.click();
  const settings = shell.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await expect(shell.locator("[data-product-primary-layer]")).toHaveAttribute(
    "inert",
    "",
  );
  await settings.getByRole("button", { name: "返回" }).click();
  await expect(settings).toHaveCount(0);
  await expect(settingsEntry).toBeFocused();

  await userPage.getByRole("button", { name: "关闭用户页" }).click();
  await expect(userPage).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(shell).toHaveAttribute(
    "data-platform",
    expectedPlatform(testInfo.project.name),
  );
});

test("Published, saved, liked and history remain presentation-only", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const { shell, trigger } = await openQa(page);
  const userPage = await openUser(shell, trigger);

  for (const [tab, heading] of [
    ["收藏", "我的收藏"],
    ["喜欢", "我喜欢的内容"],
    ["历史", "最近浏览"],
    ["发布", "我发布过的内容"],
  ] as const) {
    await userPage.getByRole("tab", { name: tab }).click();
    await expect(
      userPage.getByRole("heading", { name: heading }),
    ).toBeVisible();
  }

  const firstContent = userPage.locator("[data-user-content-id]").first();
  await firstContent.click();
  await expect(userPage.locator("[data-user-intent-status]")).toContainText(
    "已记录内容打开意图",
  );
  await expect(page).toHaveURL(/\/dev\/t02p\/qa$/u);
});

test("QA scenarios expose saved, liked, history, empty and avatar fallback", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const { shell, surface } = await openQa(page);
  const selector = surface.getByRole("combobox", { name: "QA User scenario" });

  for (const [scenario, selectedTab] of [
    ["user-saved", "收藏"],
    ["user-liked", "喜欢"],
    ["user-history", "历史"],
  ] as const) {
    await selector.selectOption(scenario);
    const trigger = shell.locator("[data-user-trigger]");
    const userPage = await openUser(shell, trigger);
    await expect(
      userPage.getByRole("tab", { name: selectedTab }),
    ).toHaveAttribute("aria-selected", "true");
    await userPage.getByRole("button", { name: "关闭用户页" }).click();
  }

  await selector.selectOption("user-empty-published");
  let userPage = await openUser(shell, shell.locator("[data-user-trigger]"));
  await expect(userPage.locator('[data-user-empty="published"]')).toHaveText(
    /暂无发布内容/u,
  );
  await userPage.getByRole("button", { name: "关闭用户页" }).click();

  await selector.selectOption("user-avatar-fallback");
  userPage = await openUser(shell, shell.locator("[data-user-trigger]"));
  await expect(userPage.locator("[data-user-avatar]")).toHaveText("访");
});

test("approved viewport matrices keep the single-layer User UI in bounds", async ({
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

  const { shell } = await openQa(page);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const trigger = shell.locator("[data-user-trigger]");
    const userPage = await openUser(shell, trigger);
    const box = await userPage.boundingBox();
    if (box === null) throw new Error("Missing User page geometry");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(
      userPage.getByRole("tablist", { name: "用户内容分类" }),
    ).toBeVisible();
    await userPage.getByRole("button", { name: "关闭用户页" }).click();
  }
});
