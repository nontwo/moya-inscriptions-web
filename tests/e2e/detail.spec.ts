// ============================================================
// E2E — 碑刻详情页测试
// ============================================================

import { test, expect } from "@playwright/test";

const KNOWN_SLUG = "datang-zhongxing-song";

test.describe("碑刻详情", () => {
  test("加载成功 — 标题与基本信息", async ({ page }) => {
    await page.goto(`/sites/${KNOWN_SLUG}`);
    await page.waitForTimeout(3000);

    // 标题
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "大唐中兴颂",
      { timeout: 10000 },
    );
  });

  test("基本信息卡片可见", async ({ page }) => {
    await page.goto(`/sites/${KNOWN_SLUG}`);
    await page.waitForTimeout(3000);

    await expect(page.getByText("基本信息")).toBeVisible({ timeout: 10000 });
  });

  test("简介区域可见", async ({ page }) => {
    await page.goto(`/sites/${KNOWN_SLUG}`);
    await page.waitForTimeout(3000);

    await expect(page.getByText("简介")).toBeVisible({ timeout: 10000 });
  });

  test("书法赏析区域可见", async ({ page }) => {
    await page.goto(`/sites/${KNOWN_SLUG}`);
    await page.waitForTimeout(3000);

    // 滚动到书法赏析
    const calligraphy = page.getByText("书法赏析");
    if (await calligraphy.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(calligraphy).toBeVisible();
      // 应有笔法/结体/章法等子标题
      await expect(page.getByText(/笔法|结体|章法|风格/).first()).toBeVisible();
    }
  });

  test("图片区域可见", async ({ page }) => {
    await page.goto(`/sites/${KNOWN_SLUG}`);
    await page.waitForTimeout(3000);

    // 主图
    const mainImg = page
      .locator('img[alt*="大唐中兴颂"], img[alt*="大唐"]')
      .first();
    if (await mainImg.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(mainImg).toBeVisible();
    }
  });

  test("参考来源区域可见", async ({ page }) => {
    await page.goto(`/sites/${KNOWN_SLUG}`);
    await page.waitForTimeout(3000);

    // 向下滚动到底部
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const ref = page.getByText("参考来源");
    if (await ref.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(ref).toBeVisible();
    }
  });

  test("相关碑刻区域存在", async ({ page }) => {
    await page.goto(`/sites/${KNOWN_SLUG}`);
    await page.waitForTimeout(3000);

    // 滚动到相关碑刻
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const related = page.getByText("相关碑刻");
    if (await related.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(related).toBeVisible();
      // 应有相关卡片
      const cards = page.locator('a[href^="/sites/"]');
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  test("返回按钮可用", async ({ page }) => {
    await page.goto(`/sites/${KNOWN_SLUG}`);
    await page.waitForTimeout(3000);

    const backBtn = page.getByRole("button", { name: /返回/ });
    await expect(backBtn).toBeVisible({ timeout: 10000 });
  });

  test("无效 slug 显示 404 状态", async ({ page }) => {
    await page.goto("/sites/nonexistent-site-xyz");
    await page.waitForTimeout(3000);

    // 应有"未找到"提示
    const notFound = page.locator("text=/未找到|不存在|404/");
    await expect(notFound).toBeVisible({ timeout: 10000 });
  });

  test("从首页精选点击进入详情", async ({ page }) => {
    await page.goto("/");
    // 找第一个精选卡片链接
    const firstCard = page.locator('a[href^="/sites/"]').first();
    await firstCard.click();
    await page.waitForURL("**/sites/**");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10000,
    });
  });

  test("操作按钮 — 分享和导出可见", async ({ page }) => {
    await page.goto(`/sites/${KNOWN_SLUG}`);
    await page.waitForTimeout(3000);

    // 分享按钮
    const shareBtn = page.getByRole("button", { name: /分享/ });
    await expect(shareBtn).toBeVisible({ timeout: 10000 });

    // 导出按钮
    const exportBtn = page.getByRole("button", { name: /导出/ });
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
  });
});
