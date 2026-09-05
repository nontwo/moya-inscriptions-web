import { expect, test } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";

const pointerEvent = (
  point: { readonly x: number; readonly y: number },
  pointerId = 41,
) => ({
  bubbles: true,
  button: 0,
  cancelable: true,
  clientX: point.x,
  clientY: point.y,
  isPrimary: true,
  pointerId,
  pointerType: "touch",
});

const longPressAndCommit = async (
  page: Page,
  cardAction: Locator,
  action: "favorite" | "like" | "share",
  pointerId = 41,
) => {
  const cardBox = await cardAction.boundingBox();
  if (cardBox === null) throw new Error("Missing quick-action card geometry");
  const anchor = {
    x: cardBox.x + cardBox.width / 2,
    y: cardBox.y + Math.min(cardBox.height / 2, 80),
  };
  await cardAction.dispatchEvent(
    "pointerdown",
    pointerEvent(anchor, pointerId),
  );
  await page.waitForTimeout(420);
  const menu = page.locator("[data-quick-action-menu]");
  await expect(menu).toBeVisible();
  const target = menu.locator(`[data-quick-action="${action}"]`);
  const targetBox = await target.boundingBox();
  if (targetBox === null)
    throw new Error("Missing quick-action target geometry");
  const targetPoint = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  await cardAction.dispatchEvent(
    "pointermove",
    pointerEvent(targetPoint, pointerId),
  );
  await expect(target).toHaveAttribute("data-candidate", "true");
  await cardAction.dispatchEvent(
    "pointerup",
    pointerEvent(targetPoint, pointerId),
  );
  await expect(menu).toHaveCount(0);
};

test("QA long-press favorite is reversible and shares the User library store", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const response = await page.goto("/dev/t02p/qa");
  expect(response?.status()).toBe(200);
  const firstCard = page.locator('[data-catalog-card-variant="feed"]').first();
  const cardId = await firstCard.getAttribute("data-catalog-id");
  if (cardId === null) throw new Error("Missing Catalog ID");
  const title = await firstCard.locator("h3").innerText();
  const cardAction = firstCard.locator("[data-open-catalog]");
  await expect(cardAction).toHaveAttribute("data-quick-actions", "enabled");

  await longPressAndCommit(page, cardAction, "favorite");
  await expect(page.locator("[data-quick-action-qa-log]")).toContainText(
    `[quick-action] committed favorite ${cardId}`,
  );

  await page.locator("[data-user-trigger]").click();
  const userPage = page.getByRole("dialog", { name: "用户页" });
  await userPage.getByRole("tab", { name: "收藏" }).click();
  const savedPanel = userPage.getByRole("tabpanel", { name: "收藏" });
  await expect(
    savedPanel.locator(`[data-user-content-id="${cardId}"]`),
  ).toHaveCount(1);
  await expect(userPage).toContainText(title);
  await userPage.getByRole("button", { name: "关闭用户页" }).click();

  await longPressAndCommit(page, cardAction, "favorite", 42);
  await page.locator("[data-user-trigger]").click();
  const reopenedUserPage = page.getByRole("dialog", { name: "用户页" });
  await reopenedUserPage.getByRole("tab", { name: "收藏" }).click();
  const reopenedSavedPanel = reopenedUserPage.getByRole("tabpanel", {
    name: "收藏",
  });
  await expect(
    reopenedSavedPanel.locator(`[data-user-content-id="${cardId}"]`),
  ).toHaveCount(0);
});

test("QA share stays local while production surfaces expose no quick actions", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");

  for (const path of ["/", "/dev/t02p"] as const) {
    await page.goto(path);
    await expect(page.locator("[data-quick-actions]")).toHaveCount(0);
    await expect(page.locator("[data-quick-action-qa-log]")).toHaveCount(0);
  }

  await page.goto("/dev/t02p/qa");
  await page.getByRole("button", { exact: true, name: "碑刻" }).click();
  await expect(
    page.locator(
      '[data-primary-destination="inscriptions"]:not([hidden]) [data-quick-actions]',
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { exact: true, name: "书帖" }).click();
  const card = page
    .locator(
      '[data-primary-destination="calligraphy"]:not([hidden]) [data-catalog-card-variant="feed"]',
    )
    .first();
  await expect(card.locator("[data-quick-actions]")).toBeVisible();
  const cardId = await card.getAttribute("data-catalog-id");
  if (cardId === null) throw new Error("Missing Catalog ID");
  const initialUrl = page.url();
  await longPressAndCommit(page, card.locator("[data-open-catalog]"), "share");

  await expect(page).toHaveURL(initialUrl);
  await expect(page.locator("[data-quick-action-qa-log]")).toContainText(
    `[quick-action] committed share ${cardId}`,
  );
});

test("phone, tablet and PC keep every adaptive bubble inside the viewport", async ({
  page,
}) => {
  await page.goto("/dev/t02p/qa");
  const cardAction = page
    .locator('[data-catalog-card-variant="feed"] [data-open-catalog]')
    .first();
  await expect(cardAction).toBeVisible();
  const browserGestureGuard = await cardAction.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      contextMenuBlocked: !element.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      ),
      dragBlocked: !element.dispatchEvent(
        new Event("dragstart", { bubbles: true, cancelable: true }),
      ),
      touchAction: style.getPropertyValue("touch-action"),
      userSelect:
        style.getPropertyValue("user-select") ||
        style.getPropertyValue("-webkit-user-select"),
    };
  });
  expect(browserGestureGuard.contextMenuBlocked).toBe(true);
  expect(browserGestureGuard.dragBlocked).toBe(true);
  expect(["manipulation", "pan-x pan-y pinch-zoom"]).toContain(
    browserGestureGuard.touchAction,
  );
  expect(browserGestureGuard.userSelect).toBe("none");
  const cardBox = await cardAction.boundingBox();
  const viewport = page.viewportSize();
  if (cardBox === null || viewport === null) {
    throw new Error("Missing responsive quick-action geometry");
  }
  const anchor = {
    x: Math.min(viewport.width - 18, cardBox.x + cardBox.width / 2),
    y: Math.min(viewport.height - 18, cardBox.y + cardBox.height / 2),
  };
  await cardAction.dispatchEvent("pointerdown", pointerEvent(anchor, 73));
  await page.waitForTimeout(420);
  const menu = page.locator("[data-quick-action-menu]");
  await expect(menu).toBeVisible();
  await page.waitForTimeout(180);
  await expect(menu).toHaveAttribute(
    "data-quick-action-direction",
    /^(above|below|left|right|upper-left|upper-right|lower-left|lower-right)$/u,
  );

  for (const bubble of await menu.locator("[data-quick-action]").all()) {
    const hitBox = await bubble.boundingBox();
    const visualBox = await bubble.locator("span").first().boundingBox();
    if (hitBox === null || visualBox === null) {
      throw new Error("Missing adaptive bubble geometry");
    }
    expect(hitBox.width).toBeCloseTo(64, 1);
    expect(hitBox.height).toBeCloseTo(64, 1);
    expect(hitBox.x).toBeGreaterThanOrEqual(0);
    expect(hitBox.y).toBeGreaterThanOrEqual(0);
    expect(hitBox.x + hitBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(hitBox.y + hitBox.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(visualBox.width).toBeGreaterThanOrEqual(40);
    expect(visualBox.width).toBeLessThanOrEqual(48);
  }

  await page.setViewportSize({
    height: viewport.width,
    width: viewport.height,
  });
  await expect(menu).toHaveCount(0);
  await expect(page.locator("[data-quick-action-qa-log]")).toContainText(
    "[quick-action] cancelled",
  );
});
