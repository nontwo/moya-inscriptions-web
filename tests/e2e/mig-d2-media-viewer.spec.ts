import { devices, expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

const detailUrl =
  "/dev/t02p/qa?catalogId=qa-visual-inscription-02&acceptance=mig-d2";

const openMultiMediaDetail = async (page: Page) => {
  const response = await page.goto(detailUrl);
  expect(response?.status()).toBe(200);
  const shell = page.locator("[data-product-shell]");
  const detail = shell.getByRole("dialog", { name: "资料详情" });
  await expect(detail).toBeVisible();
  await expect(detail).toHaveAttribute("data-detail-source", "qa");
  await expect(detail.locator("[data-detail-media-dot]")).toHaveCount(3);
  return { detail, shell };
};

test("MIG-D2 Viewer owns full-screen history, Detail scroll, focus, and direct reload", async ({
  page,
}) => {
  const { detail, shell } = await openMultiMediaDetail(page);
  const scroller = shell.locator("[data-detail-scroll]");
  const recordedScroll = await scroller.evaluate((node) => {
    const element = node as HTMLElement;
    element.scrollTop = Math.min(
      180,
      Math.max(0, element.scrollHeight - element.clientHeight),
    );
    element.dispatchEvent(new Event("scroll"));
    return element.scrollTop;
  });
  expect(recordedScroll).toBeGreaterThan(0);
  const opener = detail.locator("[data-detail-main-image]");
  const mediaId = await opener
    .locator("xpath=..")
    .getAttribute("data-media-id");
  expect(mediaId).not.toBeNull();
  await opener.evaluate((node) =>
    (node as HTMLElement).focus({ preventScroll: true }),
  );
  await page.keyboard.press("Enter");

  const viewer = page.getByRole("dialog", { name: "图像查看" });
  const stage = viewer.locator("[data-viewer-scale]");
  const image = viewer.locator("[data-detail-viewer-image]");
  await expect(viewer).toBeVisible();
  await expect(shell).toHaveAttribute("data-viewer-open", "true");
  await expect(page).toHaveURL(new RegExp(`image=${mediaId}`));
  await expect
    .poll(() =>
      page.evaluate(() => ({
        kind: window.history.state?.kind,
        mediaId: window.history.state?.mediaId,
      })),
    )
    .toEqual({ kind: "viewer", mediaId });
  const [viewerBox, stageBox, imageBox, viewport] = await Promise.all([
    viewer.boundingBox(),
    stage.boundingBox(),
    image.boundingBox(),
    page.evaluate(() => ({
      height: window.innerHeight,
      width: window.innerWidth,
    })),
  ]);
  expect(viewerBox).not.toBeNull();
  expect(stageBox).not.toBeNull();
  expect(imageBox).not.toBeNull();
  expect(Math.abs(viewerBox!.width - viewport.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(viewerBox!.height - viewport.height)).toBeLessThanOrEqual(1);
  expect(imageBox!.width).toBeLessThanOrEqual(stageBox!.width + 1);
  expect(imageBox!.height).toBeLessThanOrEqual(stageBox!.height + 1);
  expect(imageBox!.x).toBeGreaterThanOrEqual(stageBox!.x - 1);
  expect(imageBox!.y).toBeGreaterThanOrEqual(stageBox!.y - 1);
  expect(imageBox!.x + imageBox!.width).toBeLessThanOrEqual(
    stageBox!.x + stageBox!.width + 1,
  );
  expect(imageBox!.y + imageBox!.height).toBeLessThanOrEqual(
    stageBox!.y + stageBox!.height + 1,
  );

  const directViewerUrl = page.url();
  const initialAlt = await image.getAttribute("alt");
  if (initialAlt === null) throw new Error("Missing Viewer image alt");
  await page.goBack();
  await expect(viewer).toBeHidden();
  await expect(shell).toHaveAttribute("data-viewer-open", "false");
  await expect(page).not.toHaveURL(/[?&]image=/u);
  await expect(opener).toBeFocused();
  await expect
    .poll(() => scroller.evaluate((node) => (node as HTMLElement).scrollTop))
    .toBe(recordedScroll);

  await page.goForward();
  await expect(viewer).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`image=${mediaId}`));
  const originalViewport = page.viewportSize();
  if (originalViewport !== null) {
    await page.setViewportSize({
      height: originalViewport.width,
      width: originalViewport.height,
    });
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("[data-detail-viewer-image]")).toHaveAttribute(
      "alt",
      initialAlt,
    );
    await page.setViewportSize(originalViewport);
  }
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();

  await page.goto(directViewerUrl);
  await expect(viewer).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`image=${mediaId}`));
  await page.goBack();
  await expect(viewer).toBeHidden();
  await expect(detail).toBeVisible();
});

test("MIG-D2 Viewer supports release-only paging, cancel, keyboard, pinch, and reset", async ({
  page,
}) => {
  const { detail } = await openMultiMediaDetail(page);
  await detail.locator("[data-detail-main-image]").click();
  const viewer = page.getByRole("dialog", { name: "图像查看" });
  const stage = viewer.locator("[data-viewer-scale]");
  await expect(viewer).toBeVisible();
  const box = await stage.boundingBox();
  if (box === null) throw new Error("Missing Viewer geometry");
  const pointer = (
    type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
    pointerId: number,
    x: number,
    options: { readonly isPrimary?: boolean; readonly buttons?: number } = {},
  ) =>
    stage.dispatchEvent(type, {
      button: 0,
      buttons: options.buttons ?? (type === "pointerup" ? 0 : 1),
      clientX: x,
      clientY: box.y + box.height / 2,
      isPrimary: options.isPrimary ?? true,
      pointerId,
      pointerType: "touch",
    });

  await pointer("pointerdown", 401, box.x + box.width * 0.8);
  await pointer("pointermove", 401, box.x + box.width * 0.2);
  await pointer("pointercancel", 401, box.x + box.width * 0.2, {
    buttons: 0,
  });
  await expect(page).toHaveURL(/image=qa-visual-inscription-02-media(?:&|#)/u);

  await pointer("pointerdown", 402, box.x + box.width * 0.8);
  await pointer("pointermove", 402, box.x + box.width * 0.2);
  await expect(page).toHaveURL(/image=qa-visual-inscription-02-media(?:&|#)/u);
  await pointer("pointerup", 402, box.x + box.width * 0.2, { buttons: 0 });
  await expect(page).toHaveURL(
    /image=qa-visual-inscription-02-detail-media-2/u,
  );
  await expect(viewer.locator("[data-detail-viewer-index]")).toHaveText(
    "2 / 3",
  );

  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(
    /image=qa-visual-inscription-02-detail-media-3/u,
  );
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(
    /image=qa-visual-inscription-02-detail-media-2/u,
  );

  await pointer("pointerdown", 501, box.x + box.width * 0.4);
  await pointer("pointerdown", 502, box.x + box.width * 0.6, {
    isPrimary: false,
  });
  await pointer("pointermove", 502, box.x + box.width * 0.9, {
    isPrimary: false,
  });
  await expect(stage).toHaveAttribute("data-viewer-scale", "zoomed");
  await pointer("pointerup", 502, box.x + box.width * 0.9, {
    buttons: 0,
    isPrimary: false,
  });
  await pointer("pointerup", 501, box.x + box.width * 0.4, { buttons: 0 });
  await expect(page).toHaveURL(
    /image=qa-visual-inscription-02-detail-media-2/u,
  );

  const track = viewer.locator("[data-detail-viewer-track]");
  const readTrackX = () =>
    track.evaluate(
      (node) => new DOMMatrix(getComputedStyle(node).transform).m41,
    );
  const baseTrackX = await readTrackX();
  const panStartX = box.x + box.width / 2;
  await pointer("pointerdown", 601, panStartX);
  let handoffPointerX: number | null = null;
  let handoffTrackX = baseTrackX;
  for (let x = panStartX - 10; x >= box.x - box.width; x -= 10) {
    await pointer("pointermove", 601, x);
    const currentTrackX = await readTrackX();
    if (Math.abs(currentTrackX - baseTrackX) > 0.5) {
      handoffPointerX = x;
      handoffTrackX = currentTrackX;
      break;
    }
  }
  expect(handoffPointerX).not.toBeNull();
  await pointer("pointermove", 601, handoffPointerX! - 10);
  const continuedTrackX = await readTrackX();
  expect(continuedTrackX - handoffTrackX).toBeCloseTo(-10, 0);
  await pointer("pointercancel", 601, handoffPointerX! - 10, { buttons: 0 });
  await expect(page).toHaveURL(
    /image=qa-visual-inscription-02-detail-media-2/u,
  );

  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();

  await page.waitForTimeout(550);
  await detail.locator("[data-detail-main-image]").click();
  await expect(viewer).toBeVisible();
  await expect(stage).toHaveAttribute("data-viewer-scale", "fit");
});

test("MIG-D2 mobile Detail Carousel uses native snap with release-only commit", async ({
  page,
}, testInfo) => {
  test.skip(
    !["mobile-webkit", "tablet-webkit", "tablet-landscape-webkit"].includes(
      testInfo.project.name,
    ),
    "Native touch paging is owned by the phone and tablet compositions",
  );
  const { detail } = await openMultiMediaDetail(page);
  const stage = detail.locator("[data-detail-main-stage]");
  const counter = detail.locator("[data-detail-media-index]");
  await expect(stage).toHaveAttribute("data-native-paging", "true");
  await expect(stage).toHaveCSS("overflow-x", "auto");
  await expect(stage).toHaveCSS("scroll-snap-type", "x mandatory");
  await expect(stage).toHaveCSS("touch-action", "pan-x pan-y");

  const dispatchTouch = (type: "touchstart" | "touchend" | "touchcancel") =>
    stage.evaluate((node, eventType) => {
      const event = new Event(eventType, {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "touches", {
        configurable: true,
        value: eventType === "touchstart" ? [{}] : [],
      });
      node.dispatchEvent(event);
    }, type);

  await dispatchTouch("touchstart");
  await stage.evaluate((node) => {
    const frame = node as HTMLElement;
    frame.scrollLeft = frame.clientWidth;
    frame.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(counter).toHaveText("1 / 3");
  await dispatchTouch("touchend");
  await expect(counter).toHaveText("2 / 3");

  await dispatchTouch("touchstart");
  await stage.evaluate((node) => {
    const frame = node as HTMLElement;
    frame.scrollLeft = frame.clientWidth * 2;
    frame.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(counter).toHaveText("2 / 3");
  await dispatchTouch("touchcancel");
  await expect(counter).toHaveText("2 / 3");
  await expect
    .poll(() =>
      stage.evaluate((node) => {
        const frame = node as HTMLElement;
        return Math.abs(frame.scrollLeft - frame.clientWidth);
      }),
    )
    .toBeLessThanOrEqual(1);
});

test("MIG-D2 Detail Carousel accepts trusted diagonal native touch", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Trusted CDP touch input is Chromium-only",
  );
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Missing E2E base URL");
  const context = await browser.newContext({
    ...devices["iPhone 15"],
    baseURL,
  });
  const page = await context.newPage();

  try {
    const { detail } = await openMultiMediaDetail(page);
    await expect(page.locator("[data-product-boot]")).toHaveCount(0);
    const stage = detail.locator("[data-detail-main-stage]");
    const counter = detail.locator("[data-detail-media-index]");
    await expect(stage).toHaveAttribute("data-native-paging", "true");
    await expect(stage).toHaveCSS("overflow-x", "auto");
    await expect(stage).toHaveCSS("scroll-snap-type", "x mandatory");
    await expect(stage).toHaveCSS("touch-action", "pan-x pan-y");
    const box = await stage.boundingBox();
    if (box === null) throw new Error("Missing Detail Carousel geometry");
    const session = await context.newCDPSession(page);
    const startY = box.y + box.height / 2;
    const endY = startY + 26;
    const startX = box.x + box.width * 0.7;
    const endX = box.x + box.width * 0.2;

    try {
      await session.send("Input.dispatchTouchEvent", {
        touchPoints: [{ x: startX, y: startY }],
        type: "touchStart",
      });
      for (let step = 1; step <= 8; step += 1) {
        await session.send("Input.dispatchTouchEvent", {
          touchPoints: [
            {
              x: startX + ((endX - startX) * step) / 8,
              y: startY + ((endY - startY) * step) / 8,
            },
          ],
          type: "touchMove",
        });
        await page.waitForTimeout(16);
      }
      await expect(counter).toHaveText("1 / 3");
      await session.send("Input.dispatchTouchEvent", {
        touchPoints: [],
        type: "touchEnd",
      });
    } finally {
      await session.detach();
    }

    await expect(counter).toHaveText("2 / 3");
    const viewer = page.getByRole("dialog", { name: "图像查看" });
    await expect(viewer).toBeHidden();

    await page.waitForTimeout(550);
    const tapBox = await stage.boundingBox();
    if (tapBox === null)
      throw new Error("Missing Detail Carousel tap geometry");
    await page.touchscreen.tap(
      tapBox.x + tapBox.width / 2,
      tapBox.y + tapBox.height / 2,
    );
    await expect(viewer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();

    const scroller = page.locator("[data-detail-scroll]");
    const scrollBox = await stage.boundingBox();
    if (scrollBox === null) {
      throw new Error("Missing Detail Carousel vertical-scroll geometry");
    }
    const scrollStartX = scrollBox.x + scrollBox.width / 2;
    const scrollStartY = scrollBox.y + scrollBox.height * 0.7;
    const scrollEndY = Math.max(20, scrollStartY - 140);
    const verticalSession = await context.newCDPSession(page);
    try {
      await verticalSession.send("Input.dispatchTouchEvent", {
        touchPoints: [{ x: scrollStartX, y: scrollStartY }],
        type: "touchStart",
      });
      for (let step = 1; step <= 8; step += 1) {
        await verticalSession.send("Input.dispatchTouchEvent", {
          touchPoints: [
            {
              x: scrollStartX + step,
              y: scrollStartY + ((scrollEndY - scrollStartY) * step) / 8,
            },
          ],
          type: "touchMove",
        });
        await page.waitForTimeout(16);
      }
      await verticalSession.send("Input.dispatchTouchEvent", {
        touchPoints: [],
        type: "touchEnd",
      });
    } finally {
      await verticalSession.detach();
    }
    await expect
      .poll(() => scroller.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(20);
    await expect(counter).toHaveText("2 / 3");
    await expect(viewer).toBeHidden();
  } finally {
    await context.close();
  }
});

test("MIG-D2 Viewer rejects foreign media and reports a valid broken image truthfully", async ({
  page,
}) => {
  await page.goto(`${detailUrl}&image=foreign-media#viewer`);
  const viewer = page.getByRole("dialog", { name: "图像查看" });
  const detail = page.getByRole("dialog", { name: "资料详情" });
  await expect(detail).toBeVisible();
  await expect(viewer).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]image=/u);

  await page.route("**/rubbing-fragment.svg", (route) => route.abort());
  await page.goto(
    `${detailUrl}&image=qa-visual-inscription-02-detail-media-2#viewer`,
  );
  await expect(viewer).toBeVisible();
  await expect(
    viewer.locator('[data-detail-viewer-media-state="failed"]'),
  ).toContainText("图像无法加载");
  await expect(viewer.locator("[data-detail-viewer-image]")).toHaveCount(0);
});
