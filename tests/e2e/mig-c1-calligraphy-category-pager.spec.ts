import { expect, test } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";

type Category = "all" | "ink" | "rubbing";

const productShell = (surface: Locator) =>
  surface.locator("[data-product-shell]");

const calligraphySurface = (surface: Locator) =>
  surface.locator(
    '[data-primary-destination="calligraphy"] [data-calligraphy-category-surface]',
  );

const activateCalligraphy = async (surface: Locator) => {
  await surface
    .getByRole("navigation", { name: "主要内容" })
    .getByRole("button", { exact: true, name: "书帖" })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(productShell(surface)).toHaveAttribute(
    "data-active-destination",
    "calligraphy",
  );
  await expect(calligraphySurface(surface)).toBeVisible();
};

const gotoWithRetry = async (page: Page, target: string) => {
  let response: Awaited<ReturnType<Page["goto"]>> | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await page.goto(target);
      break;
    } catch (error) {
      if (
        attempt >= 2 ||
        !(error instanceof Error) ||
        !error.message.includes("is interrupted by another navigation")
      ) {
        throw error;
      }
      await page.waitForTimeout(100);
    }
  }
  return response;
};

const openSurface = async (page: Page, qa = true) => {
  const target = qa ? "/dev/t02p/qa" : "/dev/t02p";
  const response = await gotoWithRetry(page, target);
  expect(response?.status()).toBe(200);
  const surface = page.locator(
    qa ? "[data-t02p-qa-harness]" : "[data-clean-product-preview]",
  );
  await expect(surface).toBeVisible();
  await expect(surface.locator("[data-product-boot]")).toHaveCount(0);
  await activateCalligraphy(surface);
  return { calligraphy: calligraphySurface(surface), surface };
};

const settleCategory = async (calligraphy: Locator, category: Category) => {
  const pager = calligraphy.locator("[data-calligraphy-category-pager]");
  await pager.evaluate((node, targetCategory) => {
    const frame = node as HTMLElement;
    const panel = frame.querySelector<HTMLElement>(
      `[data-calligraphy-category-panel="${targetCategory}"]`,
    );
    if (panel === null) throw new Error("Missing Calligraphy category panel");
    frame.style.scrollSnapType = "none";
    frame.scrollLeft = panel.offsetLeft;
    frame.dispatchEvent(new Event("scroll"));
    frame.dispatchEvent(new Event("scrollend"));
    frame.style.scrollSnapType = "";
  }, category);
  await expect(calligraphy).toHaveAttribute(
    "data-active-calligraphy-category",
    category,
  );
};

const primaryScrollEvidence = async (surface: Locator) =>
  productShell(surface).evaluate((node) => {
    const shell = node as HTMLElement;
    const section = shell.querySelector<HTMLElement>(
      '[data-primary-destination="calligraphy"]',
    );
    if (section === null) throw new Error("Missing Calligraphy destination");
    const element =
      shell.dataset.platform === "pc"
        ? (document.scrollingElement as HTMLElement)
        : section;
    return {
      maximum: Math.max(0, element.scrollHeight - element.clientHeight),
      top: element.scrollTop,
    };
  });

const writePrimaryScroll = async (surface: Locator, desired: number) =>
  productShell(surface).evaluate((node, top) => {
    const shell = node as HTMLElement;
    const section = shell.querySelector<HTMLElement>(
      '[data-primary-destination="calligraphy"]',
    );
    if (section === null) throw new Error("Missing Calligraphy destination");
    const element =
      shell.dataset.platform === "pc"
        ? (document.scrollingElement as HTMLElement)
        : section;
    element.scrollTop = Math.min(
      top,
      Math.max(0, element.scrollHeight - element.clientHeight),
    );
    element.dispatchEvent(new Event("scroll"));
    return element.scrollTop;
  }, desired);

test("MIG-C1 keeps runtime classification truthful and QA metadata isolated", async ({
  page,
}) => {
  const runtime = await openSurface(page, false);
  await expect(runtime.calligraphy).toHaveAttribute(
    "data-calligraphy-classification-source",
    "runtime-unclassified",
  );
  await expect(
    runtime.calligraphy.locator(
      '[data-calligraphy-category-panel="all"] [data-catalog-card]',
    ),
  ).toHaveCount(1);
  await expect(runtime.calligraphy).toContainText("运行时书帖");
  await expect(runtime.calligraphy).not.toContainText("视觉 QA 合成");
  await expect(
    runtime.calligraphy.locator(
      'input[type="search"], [data-calligraphy-filter]',
    ),
  ).toHaveCount(0);

  await settleCategory(runtime.calligraphy, "ink");
  await expect(runtime.calligraphy).toContainText("墨迹分类数据尚未接入");
  await expect(runtime.calligraphy).toContainText(
    "当前公开目录尚未提供规范分类",
  );
  await settleCategory(runtime.calligraphy, "rubbing");
  await expect(runtime.calligraphy).toContainText("拓本分类数据尚未接入");

  const qa = await openSurface(page);
  await expect(qa.calligraphy).toHaveAttribute(
    "data-calligraphy-classification-source",
    "qa-synthetic",
  );
  await expect(
    qa.calligraphy.locator(
      '[data-calligraphy-category-panel="all"] [data-catalog-card]',
    ),
  ).toHaveCount(12);
  await settleCategory(qa.calligraphy, "ink");
  await expect(
    qa.calligraphy.locator(
      '[data-calligraphy-category-panel="ink"] [data-catalog-card]',
    ),
  ).toHaveCount(6);
  await settleCategory(qa.calligraphy, "rubbing");
  await expect(
    qa.calligraphy.locator(
      '[data-calligraphy-category-panel="rubbing"] [data-catalog-card]',
    ),
  ).toHaveCount(6);

  const formalResponse = await gotoWithRetry(page, "/");
  expect(formalResponse?.status()).toBe(200);
  await expect(
    page.locator('[data-calligraphy-classification-source="qa-synthetic"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-catalog-id^="qa-visual-calligraphy-"]'),
  ).toHaveCount(0);
});

test("MIG-C1 native pager follows progress and commits only on release", async ({
  page,
}, testInfo) => {
  const { calligraphy } = await openSurface(page);
  const pager = calligraphy.locator("[data-calligraphy-category-pager]");
  const indicator = calligraphy.locator(
    "[data-calligraphy-category-indicator]",
  );
  await expect(calligraphy.getByRole("tab")).toHaveText([
    "全部",
    "墨迹",
    "拓本",
  ]);
  await expect(pager).toHaveCSS("scroll-snap-type", "x mandatory");
  await expect(pager).toHaveCSS("touch-action", "pan-x pan-y");

  if (testInfo.project.name.startsWith("desktop")) {
    await pager.dispatchEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 3,
      deltaY: 70,
    });
    await page.waitForTimeout(180);
    await expect(calligraphy).toHaveAttribute(
      "data-active-calligraphy-category",
      "all",
    );
    await pager.dispatchEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 70,
      deltaY: 3,
    });
    await expect(calligraphy).toHaveAttribute(
      "data-active-calligraphy-category",
      "ink",
    );
    return;
  }

  await pager.evaluate((node) => {
    const frame = node as HTMLElement;
    frame.style.scrollSnapType = "none";
    frame.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
    frame.scrollLeft = frame.clientWidth / 2;
    frame.dispatchEvent(new Event("scroll"));
  });
  await expect(calligraphy).toHaveAttribute(
    "data-active-calligraphy-category",
    "all",
  );
  await expect
    .poll(async () =>
      Number(
        await indicator.getAttribute("data-calligraphy-category-progress"),
      ),
    )
    .toBeCloseTo(0.5, 1);

  await pager.evaluate((node) => {
    const frame = node as HTMLElement;
    frame.scrollLeft = frame.clientWidth;
    frame.dispatchEvent(new Event("scroll"));
    frame.dispatchEvent(new Event("scrollend"));
  });
  await expect(calligraphy).toHaveAttribute(
    "data-active-calligraphy-category",
    "all",
  );
  await pager.evaluate((node) => {
    const frame = node as HTMLElement;
    frame.dispatchEvent(new TouchEvent("touchend", { bubbles: true }));
    frame.style.scrollSnapType = "";
  });
  await expect(calligraphy).toHaveAttribute(
    "data-active-calligraphy-category",
    "ink",
  );

  await pager.evaluate((node) => {
    const frame = node as HTMLElement;
    frame.style.scrollSnapType = "none";
    frame.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
    frame.scrollLeft += frame.clientWidth * 0.6;
    frame.dispatchEvent(new Event("scroll"));
    frame.dispatchEvent(new TouchEvent("touchcancel", { bubbles: true }));
    frame.dispatchEvent(new Event("scrollend"));
    frame.style.scrollSnapType = "";
  });
  await expect(calligraphy).toHaveAttribute(
    "data-active-calligraphy-category",
    "ink",
  );
  await expect(pager).toHaveJSProperty(
    "scrollLeft",
    await pager.evaluate((node) => {
      const frame = node as HTMLElement;
      return (
        frame.querySelector<HTMLElement>(
          '[data-calligraphy-category-panel="ink"]',
        )?.offsetLeft ?? -1
      );
    }),
  );
});

test("MIG-C1 restores category scroll and exact opener focus after Detail Back", async ({
  page,
}) => {
  const { calligraphy, surface } = await openSurface(page);
  await settleCategory(calligraphy, "ink");
  const recordedScroll = await writePrimaryScroll(surface, 180);
  expect(recordedScroll).toBeGreaterThan(0);
  const opener = calligraphy.locator(
    '[data-calligraphy-category-panel="ink"] [data-catalog-id="qa-visual-calligraphy-01"] [data-open-catalog]',
  );
  await opener.evaluate((button) => (button as HTMLButtonElement).click());
  const detail = productShell(surface).getByRole("dialog", {
    name: "资料详情",
  });
  await expect(detail).toBeVisible();
  await expect(detail).toHaveAttribute("data-detail-source", "qa");
  await detail.getByRole("button", { name: "返回" }).click();
  await expect(detail).toHaveCount(0);
  await expect(calligraphy).toHaveAttribute(
    "data-active-calligraphy-category",
    "ink",
  );
  await expect
    .poll(async () => (await primaryScrollEvidence(surface)).top)
    .toBe(recordedScroll);
  await expect(opener).toBeFocused();

  const shell = productShell(surface);
  if ((await shell.getAttribute("data-platform")) === "pc") return;
  await shell.getByRole("button", { name: "打开设置" }).click();
  const settings = shell.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings
    .locator("[data-feed-layout-toggle]")
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(shell).toHaveAttribute("data-feed-layout", "single");
  await settings
    .getByRole("button", { name: "返回" })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(
    calligraphy.locator(
      '[data-calligraphy-category-panel="ink"] [data-home-masonry]',
    ),
  ).toHaveAttribute("data-masonry-columns", "1");
});

test("MIG-C1 preserves active category and bounded scroll across resize and rotation", async ({
  page,
}) => {
  const { calligraphy, surface } = await openSurface(page);
  await settleCategory(calligraphy, "rubbing");
  const recordedScroll = await writePrimaryScroll(surface, 160);
  expect(recordedScroll).toBeGreaterThan(0);
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error("Missing viewport size");

  await page.setViewportSize({
    height: viewport.width,
    width: viewport.height,
  });
  await expect(calligraphy).toHaveAttribute(
    "data-active-calligraphy-category",
    "rubbing",
  );
  await expect
    .poll(async () => {
      const evidence = await primaryScrollEvidence(surface);
      return Math.min(
        Math.abs(evidence.top - recordedScroll),
        Math.abs(evidence.top - Math.min(recordedScroll, evidence.maximum)),
      );
    })
    .toBeLessThanOrEqual(2);

  await page.setViewportSize(viewport);
  await expect(calligraphy).toHaveAttribute(
    "data-active-calligraphy-category",
    "rubbing",
  );
  await expect
    .poll(async () => {
      const evidence = await primaryScrollEvidence(surface);
      return Math.abs(evidence.top - recordedScroll);
    })
    .toBeLessThanOrEqual(2);
});
