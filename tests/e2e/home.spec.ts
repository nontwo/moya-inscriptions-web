// ============================================================
// E2E — 首页测试
// ============================================================

import { test, expect } from '@playwright/test';

test.describe('首页', () => {
  test('加载成功 — 标题与 Hero 区域', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/摩崖|碑刻|石刻/);

    // Hero 标题
    await expect(page.getByRole('heading', { level: 1 })).toContainText('摩崖碑刻数字平台');
    await expect(page.getByText('探索中华摩崖碑刻文化遗产')).toBeVisible();
  });

  test('搜索框可见且可输入', async ({ page }) => {
    await page.goto('/');
    const input = page.getByPlaceholder(/搜索碑刻名称|地区|朝代/);
    await expect(input).toBeVisible();

    await input.fill('大唐');
    await expect(input).toHaveValue('大唐');

    // 提交按钮在有内容时出现
    await expect(page.getByRole('button', { name: '搜索' })).toBeVisible();
  });

  test('搜索框输入后点击搜索跳转搜索结果页', async ({ page }) => {
    await page.goto('/');
    const input = page.getByPlaceholder(/搜索碑刻名称|地区|朝代/);
    await input.fill('大唐');
    await page.getByRole('button', { name: '搜索' }).click();

    // 应跳转到搜索页
    await page.waitForURL(/\/search\?q=.*/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('统计卡片区域可见', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('收录碑刻')).toBeVisible();
    await expect(page.getByText('覆盖省份')).toBeVisible();
    await expect(page.getByText('精选图片')).toBeVisible();
  });

  test('快捷入口按钮存在', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: '朝代浏览' })).toBeVisible();
    await expect(page.getByRole('button', { name: '地区浏览' })).toBeVisible();
    await expect(page.getByRole('button', { name: '书体分类' })).toBeVisible();
    await expect(page.getByRole('button', { name: '时间轴' })).toBeVisible();
  });

  test('快捷入口 — "地区浏览" 跳转地区页', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '地区浏览' }).click();
    await page.waitForURL('**/regions');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('地区');
  });

  test('精选碑刻区域存在卡片', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('精选碑刻')).toBeVisible();

    // 至少有几个 SiteCard
    const cards = page.locator('a[href^="/sites/"]');
    await expect(cards.first()).toBeVisible();
  });

  test('精选碑刻 — "浏览全部" 跳转分类浏览', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /浏览全部/ }).click();
    await page.waitForURL('**/browse');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('分类浏览');
  });

  test('Header 导航链接可见（桌面端）', async ({ page }) => {
    await page.goto('/');
    // 桌面导航
    const nav = page.locator('header nav').first();
    await expect(nav.getByRole('link', { name: '首页' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '分类浏览' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '地区浏览' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '关于' })).toBeVisible();
  });

  test('Footer 可见', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer')).toBeVisible();
  });

  test('"参与共建" 区域可见', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('参与共建')).toBeVisible();
    await expect(page.getByRole('button', { name: /了解更多/ })).toBeVisible();
  });
});
