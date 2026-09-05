import { writeFile } from "node:fs/promises";
import { devices, expect, test } from "@playwright/test";
import type { CDPSession, Locator, Page } from "@playwright/test";

test.beforeAll(async ({ request }) => {
  // Compile the routes exercised by this spec before holding browser input.
  // A dev-server refresh during the gesture correctly cancels its session.
  for (const path of ["/", "/dev/t02p", "/dev/t02p/qa"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
  }
});

const ready = async (page: Page, path = "/dev/t02p/qa?qaChrome=hidden") => {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.locator("[data-product-boot]")).toHaveCount(0);
};
const homeCard = (page: Page) =>
  page
    .locator('[data-product-panel="home"] [data-quick-actions="enabled"]')
    .first();
const anchorFor = async (button: Locator) => {
  const box = await button.boundingBox();
  if (!box) throw new Error("Missing card geometry");
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + Math.min(80, box.height / 2)),
  };
};
const nativeCard = async (
  page: Page,
  surface: "home" | "calligraphy",
  rightColumn = false,
) => {
  const cards = page.locator(
    `[data-product-panel="${surface}"] [data-quick-actions="enabled"]`,
  );
  const hit = await cards.evaluateAll((buttons, preferRight) => {
    for (const [index, button] of buttons.entries()) {
      const box = button.getBoundingClientRect();
      const x = Math.round(box.x + box.width / 2);
      if (
        x <= (preferRight ? innerWidth / 2 : 24) ||
        x >= innerWidth - (preferRight ? 24 : 100)
      )
        continue;
      const top = Math.max(24, box.top + 12);
      const bottom = Math.min(innerHeight - 100, box.bottom - 12);
      for (let y = top; y <= bottom; y += 24) {
        if (document.elementFromPoint(x, y) === button)
          return { index, point: { x, y } };
      }
    }
    return null;
  }, rightColumn);
  if (hit === null)
    throw new Error(`No unobscured ${surface} card for native input`);
  return { button: cards.nth(hit.index), point: hit.point };
};
const targetFor = async (page: Page, action: string) => {
  const box = await page
    .locator(`[data-quick-action="${action}"]`)
    .boundingBox();
  if (!box) throw new Error("Missing action geometry");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const touch = (
  session: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  points: { x: number; y: number; id: number }[],
) => session.send("Input.dispatchTouchEvent", { type, touchPoints: points });
const drag = async (
  page: Page,
  session: CDPSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
) => {
  for (let step = 1; step <= 10; step += 1) {
    await touch(session, "touchMove", [
      {
        id: 1,
        x: from.x + ((to.x - from.x) * step) / 10,
        y: from.y + ((to.y - from.y) * step) / 10,
      },
    ]);
    await page.waitForTimeout(16);
  }
};

test("browser mouse holds toggle QA states without moving cards, and keyboard still opens Detail", async ({
  page,
}) => {
  await ready(page);
  const button = homeCard(page);
  const card = button.locator("..");
  const before = await card.boundingBox();
  for (const action of ["like", "favorite", "share"] as const) {
    const start = await anchorFor(button);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await expect(page.locator("[data-quick-action-menu]")).toBeVisible();
    const position = await targetFor(page, action);
    await page.mouse.move(position.x, position.y, { steps: 6 });
    await expect(
      page.locator(`[data-quick-action="${action}"]`),
    ).toHaveAttribute("data-candidate", "true");
    await page.mouse.up();
    await expect(page.locator("[data-quick-action-menu]")).toHaveCount(0);
    await expect(page.locator("[data-product-shell]")).toHaveAttribute(
      "data-detail-open",
      "false",
    );
    await page.mouse.move(0, 0);
    await expect.poll(() => card.boundingBox()).toEqual(before);
    if (action === "share")
      await expect(card.getByRole("status")).toHaveText(
        "QA：分享动作已触发（未分享）",
      );
    else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await expect(
        page.locator(`[data-quick-action="${action}"]`),
      ).toHaveAttribute("data-state-active", "true");
      const target = await targetFor(page, action);
      await page.mouse.move(target.x, target.y, { steps: 6 });
      await page.mouse.up();
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await expect(
        page.locator(`[data-quick-action="${action}"]`),
      ).toHaveAttribute("data-state-active", "false");
      await page.mouse.up();
    }
  }
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-product-shell]")).toHaveAttribute(
    "data-detail-open",
    "true",
  );
});

for (const path of [
  "/",
  "/dev/t02p",
  "/dev/t02p/qa",
  "/dev/t02p/qa?qaChrome=hidden",
]) {
  test(`QA scope and pager permission on ${path}`, async ({ page }) => {
    await ready(page, path);
    const enabled = path.startsWith("/dev/t02p/qa");
    const pager = page.locator(
      '[data-product-panel="calligraphy"] [data-calligraphy-pager-platform]',
    );
    await expect(pager).toHaveCSS(
      "touch-action",
      enabled ? /^(manipulation|pan-x pan-y pinch-zoom)$/u : "pan-x pan-y",
    );
    if (!enabled) {
      await expect(page.locator("[data-quick-actions]")).toHaveCount(0);
      await expect(page.locator("[data-quick-action-feedback]")).toHaveCount(0);
      return;
    }
    for (const surface of ["home", "calligraphy"]) {
      expect(
        await page
          .locator(
            `[data-product-panel="${surface}"] [data-quick-actions="enabled"]`,
          )
          .count(),
      ).toBeGreaterThan(0);
    }
    await expect(
      page.locator('[data-product-panel="inscriptions"] [data-quick-actions]'),
    ).toHaveCount(0);
    await expect(page.locator("[data-quick-action-qa-log]")).toHaveCount(0);
  });
}

for (const chrome of ["default", "hidden"] as const) {
  for (const surface of ["home", "calligraphy"] as const) {
    for (const phase of ["pending", "open", "sliding"] as const) {
      test(`Chromium native touch ${surface}: second finger during ${phase}, chrome ${chrome}, cancels without action and pinches in the same sequence`, async ({
        browser,
      }, testInfo) => {
        test.skip(
          testInfo.project.name !== "desktop-chromium",
          "Continuous multi-touch injection requires Chromium CDP; WebKit physical touch remains an Owner gate.",
        );
        const baseURL = testInfo.project.use.baseURL;
        if (typeof baseURL !== "string") throw new Error("Missing base URL");
        const context = await browser.newContext({
          ...devices["iPhone 15"],
          baseURL,
        });
        try {
          const page = await context.newPage();
          const session = await context.newCDPSession(page);
          await ready(
            page,
            chrome === "hidden"
              ? "/dev/t02p/qa?qaChrome=hidden"
              : "/dev/t02p/qa",
          );
          if (surface === "calligraphy")
            await page
              .getByRole("button", { exact: true, name: "书帖" })
              .click();
          const { button, point: initialPoint } = await nativeCard(
            page,
            surface,
          );
          const ancestors = await button.evaluate((node) => {
            const chain = [];
            for (
              let element: Element | null = node;
              element;
              element = element.parentElement
            ) {
              chain.push({
                tag: element.tagName,
                className: element.className,
                touchAction: getComputedStyle(element).touchAction,
              });
            }
            return chain;
          });
          for (const ancestor of ancestors)
            expect(
              ancestor.touchAction === "auto" ||
                ancestor.touchAction === "manipulation" ||
                ancestor.touchAction.includes("pinch-zoom"),
            ).toBe(true);
          await page.evaluate(() => {
            document.documentElement.dataset.quickActionTrustedMoves = "0";
            window.addEventListener(
              "touchmove",
              (event) => {
                if (event.isTrusted)
                  document.documentElement.dataset.quickActionTrustedMoves =
                    String(
                      Number(
                        document.documentElement.dataset
                          .quickActionTrustedMoves,
                      ) + 1,
                    );
              },
              { capture: true },
            );
          });
          let first = { ...initialPoint, id: 1 };
          await touch(session, "touchStart", [first]);
          if (phase !== "pending")
            await expect(
              page.locator("[data-quick-action-menu]"),
            ).toBeVisible();
          if (phase === "sliding") {
            const target = await targetFor(page, "favorite");
            await drag(page, session, first, target);
            first = { ...target, id: 1 };
            await expect(
              page.locator('[data-quick-action="favorite"]'),
            ).toHaveAttribute("data-candidate", "true");
          }
          const currentActions = await button.evaluate((node) => {
            const actions = [];
            for (
              let element: Element | null = node;
              element;
              element = element.parentElement
            )
              actions.push(getComputedStyle(element).touchAction);
            return actions;
          });
          expect(currentActions).toEqual(
            ancestors.map((ancestor) => ancestor.touchAction),
          );
          const initialScale = await page.evaluate(
            () => window.visualViewport!.scale,
          );
          await touch(session, "touchStart", [
            first,
            { id: 2, x: first.x + 80, y: first.y },
          ]);
          await expect(page.locator("[data-quick-action-menu]")).toHaveCount(0);
          for (let step = 1; step <= 12; step += 1) {
            await touch(session, "touchMove", [
              { id: 1, x: first.x - (40 * step) / 12, y: first.y },
              { id: 2, x: first.x + 80 + (120 * step) / 12, y: first.y },
            ]);
            await page.waitForTimeout(30);
          }
          // A cancelled menu is insufficient: assert actual compositor zoom before lifting either finger.
          await expect
            .poll(() => page.evaluate(() => window.visualViewport!.scale))
            .toBeGreaterThan(initialScale + 0.2);
          const afterScale = await page.evaluate(
            () => window.visualViewport!.scale,
          );
          const trustedMoves = await page.evaluate(() =>
            Number(document.documentElement.dataset.quickActionTrustedMoves),
          );
          expect(trustedMoves).toBeGreaterThan(0);
          const evidencePath = testInfo.outputPath(
            "native-pinch-evidence.json",
          );
          await writeFile(
            evidencePath,
            JSON.stringify(
              {
                chrome,
                surface,
                phase,
                ancestors,
                initialScale,
                afterScale,
                trustedMoves,
              },
              null,
              2,
            ),
          );
          await testInfo.attach("native-pinch-evidence", {
            path: evidencePath,
            contentType: "application/json",
          });
          await touch(session, "touchEnd", []);
          await expect(page.locator("[data-product-shell]")).toHaveAttribute(
            "data-detail-open",
            "false",
          );
          // Return to the initial scale with an actual inward pinch, never an emulation scale command.
          await touch(session, "touchStart", [
            { id: 1, x: 60, y: 300 },
            { id: 2, x: 330, y: 300 },
          ]);
          for (let step = 1; step <= 12; step += 1) {
            await touch(session, "touchMove", [
              { id: 1, x: 60 + (125 * step) / 12, y: 300 },
              { id: 2, x: 330 - (125 * step) / 12, y: 300 },
            ]);
            await page.waitForTimeout(30);
          }
          await touch(session, "touchEnd", []);
          await expect
            .poll(() => page.evaluate(() => window.visualViewport!.scale))
            .toBeCloseTo(initialScale, 1);
          const next = initialPoint;
          await touch(session, "touchStart", [{ ...next, id: 1 }]);
          for (const action of ["like", "favorite"])
            await expect(
              page.locator(`[data-quick-action="${action}"]`),
            ).toHaveAttribute("data-state-active", "false");
          await expect(
            page.locator("[data-quick-action-feedback]"),
          ).toHaveCount(0);
          await touch(session, "touchEnd", []);
          await page.touchscreen.tap(next.x, next.y);
          await expect(page.locator("[data-product-shell]")).toHaveAttribute(
            "data-detail-open",
            "true",
          );
          const detail = page.getByRole("dialog", { name: "资料详情" });
          await detail
            .getByRole("button", { exact: true, name: "返回" })
            .click();
          await expect(detail).toHaveCount(0);
          await expect(button).toBeFocused();
          const scrollOwner = page.locator(
            surface === "home"
              ? '[data-home-feed-panel="discover"]'
              : '[data-primary-destination="calligraphy"]',
          );
          const beforeTop = await scrollOwner.evaluate(
            (node) => node.scrollTop,
          );
          const { point: scrollStart } = await nativeCard(page, surface);
          await touch(session, "touchStart", [{ ...scrollStart, id: 1 }]);
          await drag(page, session, scrollStart, {
            x: scrollStart.x,
            y: scrollStart.y - 110,
          });
          await touch(session, "touchEnd", []);
          await expect
            .poll(() => scrollOwner.evaluate((node) => node.scrollTop))
            .toBeGreaterThan(beforeTop + 20);
          const { point: pageStart } = await nativeCard(page, surface, true);
          await touch(session, "touchStart", [{ ...pageStart, id: 1 }]);
          await drag(page, session, pageStart, { x: 5, y: pageStart.y });
          await touch(session, "touchEnd", []);
          if (surface === "home")
            await expect(
              page.locator(
                '[data-product-panel="home"] [data-home-feed-pager]',
              ),
            ).toHaveAttribute("data-horizontal-pager-active-key", "nearby");
          else
            await expect(
              page.locator("[data-calligraphy-category-surface]"),
            ).toHaveAttribute("data-active-calligraphy-category", "ink");
          await expect(page.locator("[data-quick-action-menu]")).toHaveCount(0);
        } finally {
          await context.close();
        }
      });
    }
  }
}

for (const surface of ["home", "calligraphy"] as const) {
  test(`Chromium native touch ${surface} preserves pre-hold vertical scroll, horizontal paging, and single-finger action`, async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Continuous compositor touch injection requires Chromium CDP.",
    );
    const baseURL = testInfo.project.use.baseURL;
    if (typeof baseURL !== "string") throw new Error("Missing base URL");
    const context = await browser.newContext({
      ...devices["iPhone 15"],
      baseURL,
    });
    try {
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await ready(page);
      const activate = async () => {
        if (surface === "calligraphy")
          await page.getByRole("button", { exact: true, name: "书帖" }).click();
      };
      const activeCards = () =>
        page.locator(
          `[data-product-panel="${surface}"] [data-quick-actions="enabled"]`,
        );
      const scrollOwner = page.locator(
        surface === "home"
          ? '[data-home-feed-panel="discover"]'
          : '[data-primary-destination="calligraphy"]',
      );
      await activate();
      const button = activeCards().first();
      const start = await anchorFor(button);
      await touch(session, "touchStart", [{ ...start, id: 1 }]);
      await drag(page, session, start, { x: start.x, y: start.y - 110 });
      await touch(session, "touchEnd", []);
      await expect
        .poll(() => scrollOwner.evaluate((node) => node.scrollTop))
        .toBeGreaterThan(20);
      await expect(page.locator("[data-quick-action-menu]")).toHaveCount(0);
      await ready(page);
      await activate();
      const pager = page.locator(
        surface === "home"
          ? '[data-product-panel="home"] [data-home-feed-pager]'
          : "[data-calligraphy-category-pager]",
      );
      const origin = await anchorFor(activeCards().nth(1));
      await touch(session, "touchStart", [{ ...origin, id: 1 }]);
      await drag(page, session, origin, { x: 5, y: origin.y });
      await touch(session, "touchEnd", []);
      if (surface === "home")
        await expect(pager).toHaveAttribute(
          "data-horizontal-pager-active-key",
          "nearby",
        );
      else
        await expect(
          page.locator("[data-calligraphy-category-surface]"),
        ).toHaveAttribute("data-active-calligraphy-category", "ink");
      await expect(page.locator("[data-quick-action-menu]")).toHaveCount(0);
      await ready(page);
      await activate();
      const active = activeCards().first();
      const hold = await anchorFor(active);
      const top = await scrollOwner.evaluate((node) => node.scrollTop);
      await touch(session, "touchStart", [{ ...hold, id: 1 }]);
      await expect(page.locator("[data-quick-action-menu]")).toBeVisible();
      const destination = await targetFor(page, "favorite");
      await drag(page, session, hold, destination);
      await expect(
        page.locator('[data-quick-action="favorite"]'),
      ).toHaveAttribute("data-candidate", "true");
      await touch(session, "touchEnd", []);
      expect(await scrollOwner.evaluate((node) => node.scrollTop)).toBe(top);
      await touch(session, "touchStart", [{ ...hold, id: 1 }]);
      await expect(
        page.locator('[data-quick-action="favorite"]'),
      ).toHaveAttribute("data-state-active", "true");
      await drag(page, session, hold, await targetFor(page, "favorite"));
      await touch(session, "touchEnd", []);
      await touch(session, "touchStart", [{ ...hold, id: 1 }]);
      await expect(
        page.locator('[data-quick-action="favorite"]'),
      ).toHaveAttribute("data-state-active", "false");
      await touch(session, "touchEnd", []);
    } finally {
      await context.close();
    }
  });
}

test("synthetic-pointer layout stays within rendered viewport edges and cancels on resize", async ({
  page,
}) => {
  await ready(page);
  const button = homeCard(page);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Missing viewport");
  for (const point of [
    { x: 16, y: 16 },
    { x: viewport.width - 16, y: 16 },
    { x: 16, y: viewport.height - 16 },
    { x: viewport.width - 16, y: viewport.height - 16 },
  ]) {
    const properties = {
      bubbles: true,
      button: 0,
      isPrimary: true,
      pointerId: 73,
      pointerType: "touch",
      clientX: point.x,
      clientY: point.y,
    };
    await button.dispatchEvent("pointerdown", properties);
    await expect(page.locator("[data-quick-action-menu]")).toBeVisible();
    for (const target of await page.locator("[data-quick-action]").all()) {
      const box = await target.boundingBox();
      if (!box) throw new Error("Missing target");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      await button.dispatchEvent("pointermove", {
        ...properties,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
      });
      await expect(target).toHaveAttribute("data-candidate", "true");
    }
    await button.dispatchEvent("pointercancel", properties);
    await expect(page.locator("[data-quick-action-menu]")).toHaveCount(0);
  }
  const point = await anchorFor(button);
  await button.dispatchEvent("pointerdown", {
    button: 0,
    isPrimary: true,
    pointerId: 74,
    pointerType: "touch",
    clientX: point.x,
    clientY: point.y,
  });
  await expect(page.locator("[data-quick-action-menu]")).toBeVisible();
  await page.setViewportSize({
    width: viewport.height,
    height: viewport.width,
  });
  await expect(page.locator("[data-quick-action-menu]")).toHaveCount(0);
});

test("Topic Detail feed cards remain ordinary cards and Detail return preserves opener", async ({
  page,
}) => {
  await ready(
    page,
    "/dev/t02p/qa?qaChrome=hidden&scenario=topics-catalog-collection&feed=topics",
  );
  await page.locator('[data-product-panel="home"] [data-topic-card]').click();
  const topic = page.locator("[data-topic-detail]");
  await expect(topic).toBeVisible();
  await expect(topic.locator("[data-catalog-card]")).toHaveCount(6);
  await expect(topic.locator("[data-open-catalog]")).toHaveCount(0);
  await expect(topic.locator("[data-quick-actions]")).toHaveCount(0);
  await ready(page);
  const button = homeCard(page);
  await button.click();
  const detail = page.getByRole("dialog", { name: "资料详情" });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { exact: true, name: "返回" }).click();
  await expect(detail).toHaveCount(0);
  await expect(button).toBeFocused();
  await page.keyboard.press("Space");
  await expect(detail).toBeVisible();
});

for (const surface of ["home", "calligraphy"] as const) {
  test(`Chromium native zoomed ${surface} menu keeps rendered targets and hit testing inside the visual viewport`, async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Continuous native pinch input requires Chromium CDP; physical Safari remains an Owner gate.",
    );
    const baseURL = testInfo.project.use.baseURL;
    if (typeof baseURL !== "string") throw new Error("Missing base URL");
    const context = await browser.newContext({
      ...devices["iPhone 15"],
      baseURL,
    });
    try {
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await ready(page);
      if (surface === "calligraphy")
        await page.getByRole("button", { exact: true, name: "书帖" }).click();
      const { point } = await nativeCard(page, surface);
      await touch(session, "touchStart", [
        { ...point, id: 1 },
        { x: point.x + 80, y: point.y, id: 2 },
      ]);
      for (let step = 1; step <= 12; step += 1) {
        await touch(session, "touchMove", [
          { x: point.x - (40 * step) / 12, y: point.y, id: 1 },
          { x: point.x + 80 + (120 * step) / 12, y: point.y, id: 2 },
        ]);
        await page.waitForTimeout(30);
      }
      await touch(session, "touchEnd", []);
      await expect
        .poll(() => page.evaluate(() => window.visualViewport!.scale))
        .toBeGreaterThan(2);
      // CDP input uses CSS coordinates relative to the visual viewport.
      const pan = await page.evaluate(() => ({
        x: window.visualViewport!.width / 2,
        y: window.visualViewport!.height * 0.8,
      }));
      await touch(session, "touchStart", [{ ...pan, id: 1 }]);
      await drag(page, session, pan, { x: pan.x, y: pan.y / 4 });
      await touch(session, "touchEnd", []);
      // Let native fling finish before starting a fresh press. Input used to
      // stop an active fling is noncancelable in Chromium.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            const viewport = window.visualViewport!;
            let last = "";
            let stable = 0;
            const frame = () => {
              const current = `${viewport.offsetLeft}:${viewport.offsetTop}:${viewport.scale}`;
              stable = current === last ? stable + 1 : 0;
              last = current;
              if (stable === 30) resolve();
              else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          }),
      );
      const viewport = await page.evaluate(() => {
        const v = window.visualViewport!;
        return {
          scale: v.scale,
          left: v.offsetLeft,
          top: v.offsetTop,
          width: v.width,
          height: v.height,
        };
      });
      const exposed = await page.evaluate((v) => {
        for (let y = 80; y < v.height * v.scale - 80; y += 30) {
          for (let x = 80; x < v.width * v.scale - 80; x += 30) {
            const target = document.elementFromPoint(
              v.left + x / v.scale,
              v.top + y / v.scale,
            );
            if (target?.matches('[data-quick-actions="enabled"]'))
              return { x, y };
          }
        }
        return null;
      }, viewport);
      if (!exposed) throw new Error("No exposed card after native pinch");
      await page.evaluate(() => {
        window.addEventListener(
          "pointerdown",
          (event) => {
            const target = event.target as HTMLElement;
            document.body.dataset.zoomedDown = JSON.stringify({
              x: event.clientX,
              y: event.clientY,
              enabled: target.getAttribute("data-quick-actions"),
              target: target.tagName,
              trusted: event.isTrusted,
            });
          },
          { once: true },
        );
      });
      const input = {
        x: exposed.x / viewport.scale,
        y: exposed.y / viewport.scale,
      };
      await touch(session, "touchStart", [{ ...input, id: 1 }]);
      const actualDown = await page.evaluate(() =>
        JSON.parse(document.body.dataset.zoomedDown!),
      );
      expect(actualDown).toMatchObject({ enabled: "enabled", trusted: true });
      await writeFile(
        testInfo.outputPath("zoom-input-start.json"),
        JSON.stringify({
          viewport,
          exposed,
          actual: await page.evaluate(() => document.body.dataset.zoomedDown),
        }),
      );
      await expect(page.locator("[data-quick-action-menu]")).toBeVisible();
      const bounds = await page
        .locator("[data-quick-action]")
        .evaluateAll((targets) =>
          targets.map((node) => {
            const b = node.getBoundingClientRect();
            return {
              action: node.getAttribute("data-quick-action"),
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
            };
          }),
        );
      for (const box of bounds) {
        expect(box.x).toBeGreaterThanOrEqual(viewport.left);
        expect(box.y).toBeGreaterThanOrEqual(viewport.top);
        expect(box.x + box.width).toBeLessThanOrEqual(
          viewport.left + viewport.width,
        );
        expect(box.y + box.height).toBeLessThanOrEqual(
          viewport.top + viewport.height,
        );
        expect(box.width * viewport.scale).toBeCloseTo(64, 1);
      }
      const target = bounds.find((box) => box.action === "share")!;
      await drag(page, session, input, {
        x: target.x + target.width / 2 - viewport.left,
        y: target.y + target.height / 2 - viewport.top,
      });
      await expect(page.locator('[data-quick-action="share"]')).toHaveAttribute(
        "data-candidate",
        "true",
      );
      await page.screenshot({
        path: testInfo.outputPath("native-zoomed-menu.png"),
      });
      await touch(session, "touchEnd", []);
      await expect(page.locator("[data-quick-action-feedback]")).toHaveText(
        "QA：分享动作已触发（未分享）",
      );
      await expect(page.locator("[data-product-shell]")).toHaveAttribute(
        "data-detail-open",
        "false",
      );
      expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(
        viewport.scale,
      );
      const evidencePath = testInfo.outputPath(
        "native-zoomed-menu-evidence.json",
      );
      await writeFile(
        evidencePath,
        JSON.stringify({ surface, viewport, exposed, bounds }, null, 2),
      );
      await testInfo.attach("native-zoomed-menu-evidence", {
        path: evidencePath,
        contentType: "application/json",
      });
    } finally {
      await context.close();
    }
  });
}
