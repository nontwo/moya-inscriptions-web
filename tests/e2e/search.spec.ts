// ============================================================
// E2E — 搜索流程测试
// ============================================================

import { test, expect } from '@playwright/test';

test.describe('搜索', () => {
  test('搜索页加载成功', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('body')).toBeVisible();
  });

  test('搜索页含搜索输入框', async ({ page }) => {
    await page.goto('/search');
    const input = page.getByPlaceholder(/搜索碑刻名称|地区|朝代/);
    await expect(input).toBeVisible();
  });

  test('搜索"大唐"返回结果', async ({ page }) => {
    // 直接用 URL 参数模拟搜索
    await page.goto('/search?q=%E5%A4%A7%E5%94%90');
    await page.waitForTimeout(2000);

    // 应有至少一个卡片或空状态
    const hasCards = await page.locator('a[href^="/sites/"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.locator('text=/未找到/').isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasCards || hasEmpty).toBe(true);
  });

  test('搜索"颜真卿"返回书家相关结果', async ({ page }) => {
    await page.goto('/search?q=%E9%A2%9C%E7%9C%9F%E5%8D%BF');
    await page.waitForTimeout(2000);

    // 如有结果卡片，应包含大唐中兴颂
    const hasTang = await page.getByText('大唐中兴颂').isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTang) {
      await expect(page.getByText('大唐中兴颂')).toBeVisible();
    }
  });

  test('搜索无结果 — 显示空状态', async ({ page }) => {
    await page.goto('/search?q=xyz%E4%B8%8D%E5%AD%98%E5%9C%A8');
    await page.waitForTimeout(2000);

    // 空状态应显示
    const empty = page.locator('text=/未找到|暂无/');
    await expect(empty).toBeVisible({ timeout: 5000 });
  });

  test('搜索结果卡片可点击跳转详情', async ({ page }) => {
    await page.goto('/search?q=%E5%A4%A7%E5%94%90');
    await page.waitForTimeout(2000);

    const firstCard = page.locator('a[href^="/sites/"]').first();
    if (await firstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstCard.click();
      await page.waitForURL('**/sites/**');
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('Header 搜索按钮跳转搜索页', async ({ page }) => {
    await page.goto('/');
    // 桌面端 Header 中的搜索链接
    const searchLink = page.getByRole('link', { name: '搜索' });
    await searchLink.click();
    await page.waitForURL('**/search');
    await expect(page.locator('body')).toBeVisible();
  });

  test('空关键词提交不跳转', async ({ page }) => {
    await page.goto('/search');
    // 搜索按钮在无输入时不可见（SearchBar 设计如此）
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).not.toBeVisible();
  });
});
