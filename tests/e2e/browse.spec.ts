// ============================================================
// E2E — 分类浏览页测试
// ============================================================

import { test, expect } from "@playwright/test";

test.describe("分类浏览", () => {
  test("加载成功 — 标题可见", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "分类浏览",
    );
    await expect(page.getByText("按朝代、类型、书体浏览碑刻")).toBeVisible();
  });

  test("默认网格视图下显示 SiteCard", async ({ page }) => {
    await page.goto("/browse");
    // 至少有一个卡片
    const cards = page.locator('a[href^="/sites/"]');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
  });

  test('视图切换 — "网格" 和 "时间轴" 按钮存在', async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByRole("button", { name: "网格" })).toBeVisible();
    await expect(page.getByRole("button", { name: "时间轴" })).toBeVisible();
  });

  test("切换到时间轴视图", async ({ page }) => {
    await page.goto("/browse");
    await page.getByRole("button", { name: "时间轴" }).click();

    // 应显示时间轴视图（含朝代分组）
    await expect(
      page.locator('.space-y-8, [class*="timeline"]').first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("切换回网格视图", async ({ page }) => {
    await page.goto("/browse");
    await page.getByRole("button", { name: "时间轴" }).click();
    await page.getByRole("button", { name: "网格" }).click();

    // 卡片应重新可见
    const cards = page.locator('a[href^="/sites/"]');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
  });

  test("筛选 — 朝代标签可点击", async ({ page }) => {
    await page.goto("/browse");
    // 找到朝代分组下的标签（非"全部"按钮）
    const dynastySection = page.locator('h4:has-text("朝代")').locator("..");
    // 点击"唐代"或任意朝代标签
    const tangTag = page.getByRole("button", { name: "唐代", exact: true });
    if (await tangTag.isVisible()) {
      await tangTag.click();
      // 应过滤结果，卡片仍应存在
      await expect(page.locator('a[href^="/sites/"]').first()).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test('筛选 — "全部" 重置筛选', async ({ page }) => {
    await page.goto("/browse");
    // 先点一个朝代
    const tangTag = page.getByRole("button", { name: "唐代", exact: true });
    if (await tangTag.isVisible()) {
      await tangTag.click();
      await page.waitForTimeout(300);
    }
    // 点"全部"
    const allBtn = page.getByRole("button", { name: "全部" }).first();
    await allBtn.click();
    await expect(page.locator('a[href^="/sites/"]').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("筛选 — 类型分组可见", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.locator('h4:has-text("类型")')).toBeVisible();
  });

  test("筛选 — 书体分组可见", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.locator('h4:has-text("书体")')).toBeVisible();
  });

  test("卡片点击跳转详情页", async ({ page }) => {
    await page.goto("/browse");
    const firstCard = page.locator('a[href^="/sites/"]').first();
    await firstCard.click();
    // 应跳转到 /sites/xxx
    await page.waitForURL("**/sites/**");
    await expect(page.locator("body")).toBeVisible();
  });
});
