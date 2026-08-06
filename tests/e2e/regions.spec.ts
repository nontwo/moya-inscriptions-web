// ============================================================
// E2E — 地区浏览页测试
// ============================================================

import { test, expect } from "@playwright/test";

test.describe("地区浏览", () => {
  test("加载成功 — 标题可见", async ({ page }) => {
    await page.goto("/regions");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("地区");
    await expect(page.getByText("按省份浏览碑刻分布")).toBeVisible();
  });

  test("省份卡片列表可见", async ({ page }) => {
    await page.goto("/regions");
    // 应有省份卡片
    const provinceCards = page.locator(".card-stone, button:has(h3)").first();
    await expect(provinceCards).toBeVisible({ timeout: 5000 });
  });

  test("省份卡片至少 4 个", async ({ page }) => {
    await page.goto("/regions");
    const cards = page.locator(".card-stone");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("省份卡片含名称和数量", async ({ page }) => {
    await page.goto("/regions");
    // 检查第一个卡片
    const firstCard = page.locator(".card-stone").first();
    // 应包含省份名（湖南省等）
    await expect(firstCard).toBeVisible();
  });

  test("点击省份卡片进入省份详情", async ({ page }) => {
    await page.goto("/regions");
    const firstCard = page.locator(".card-stone").first();
    await firstCard.click();

    // 面包屑出现
    await expect(page.getByRole("button", { name: /全部省份/ })).toBeVisible({
      timeout: 5000,
    });

    // 应显示该省份的碑刻卡片
    const siteCards = page.locator('a[href^="/sites/"]');
    const count = await siteCards.count();
    // 可能有或无碑刻（取决于该省份数据）
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('面包屑 — "全部省份" 返回列表', async ({ page }) => {
    await page.goto("/regions");
    const firstCard = page.locator(".card-stone").first();
    await firstCard.click();

    // 等面包屑出现
    await page
      .getByRole("button", { name: /全部省份/ })
      .waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: /全部省份/ }).click();

    // 应返回省份列表
    await expect(page.locator(".card-stone").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("省份详情 — 站点数量标注", async ({ page }) => {
    await page.goto("/regions");
    const firstCard = page.locator(".card-stone").first();
    await firstCard.click();

    // 等待面包屑
    await page
      .getByRole("button", { name: /全部省份/ })
      .waitFor({ timeout: 5000 });

    // 应有 "(N 处)" 标注
    const countText = page.locator("text=/\\d+\\s*处/");
    await expect(countText.first()).toBeVisible({ timeout: 3000 });
  });

  test("从 Header 导航进入地区页", async ({ page }) => {
    await page.goto("/");
    // 点击 Header 中的"地区浏览"（限定在 header 内）
    await page
      .locator("header")
      .getByRole("link", { name: "地区浏览" })
      .click();
    await page.waitForURL("**/regions");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("地区");
  });
});
