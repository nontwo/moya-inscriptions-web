import { expect, test } from "@playwright/test";

import type { Locator, Page, TestInfo } from "@playwright/test";

type WindowErrorRecord = {
  message: string;
  filename: string;
  lineno: number;
  colno: number;
  stack: string | null;
};
type ObservationWindow = Window & {
  __calligraphyStability?: {
    errors: WindowErrorRecord[];
    ownerScrollEnds: number;
  };
};

const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => {
    errors.push(`${page.url()}\n${error.stack ?? error.message}`);
  });
  await page.addInitScript(() => {
    const observations = {
      errors: [] as WindowErrorRecord[],
      ownerScrollEnds: 0,
    };
    (window as ObservationWindow).__calligraphyStability = observations;
    // Passive recording only: no preventDefault, error filtering or RO wrapper.
    window.addEventListener("error", (event) => {
      observations.errors.push({
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack:
          event.error instanceof Error ? (event.error.stack ?? null) : null,
      });
    });
    window.addEventListener(
      "scrollend",
      (event) => {
        const shell = document.querySelector<HTMLElement>(
          "[data-product-shell]",
        );
        const owner =
          shell?.dataset.platform === "pc"
            ? document
            : shell?.querySelector('[data-primary-destination="calligraphy"]');
        if (event.target === owner) observations.ownerScrollEnds += 1;
      },
      { capture: true, passive: true },
    );
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const errors = pageErrors.get(page) ?? [];
  const windowErrors = await page.evaluate(
    () => (window as ObservationWindow).__calligraphyStability?.errors ?? [],
  );
  await testInfo.attach("raw-pageerrors", {
    body: JSON.stringify(errors, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("raw-window-errors", {
    body: JSON.stringify(windowErrors, null, 2),
    contentType: "application/json",
  });
  expect
    .soft(errors, "All raw pageerrors, including ResizeObserver errors")
    .toEqual([]);
  expect(
    windowErrors,
    "All raw window errors, including ResizeObserver errors",
  ).toEqual([]);
});

const navigateTo = async (
  shell: Locator,
  name: "首页" | "碑刻" | "书帖",
  destination: "home" | "inscriptions" | "calligraphy",
) => {
  const navigation = shell.locator("[data-primary-navigation]");
  if ((await navigation.getAttribute("data-minimized")) === "true") {
    await navigation.locator('[data-selected="true"]').click();
    await expect(navigation).toHaveAttribute("data-minimized", "false");
  }
  await navigation.getByRole("button", { exact: true, name }).click();
  await expect(shell).toHaveAttribute("data-active-destination", destination);
};

const enterCalligraphy = async (page: Page, hidden: boolean) => {
  expect(
    (
      await page.goto(`/dev/t02p/qa${hidden ? "?qaChrome=hidden" : ""}`)
    )?.status(),
  ).toBe(200);
  const harness = page.locator("[data-t02p-qa-harness]");
  const shell = harness.locator("[data-product-shell]");
  await expect(harness).toHaveAttribute(
    "data-qa-chrome",
    hidden ? "hidden" : "visible",
  );
  await expect(harness.locator("[data-qa-controls]")).toHaveCount(
    hidden ? 0 : 1,
  );
  await expect(shell).toHaveAttribute("data-active-destination", "home");
  // This is the original reveal path, with no eager-image or scroll mutation.
  await navigateTo(shell, "碑刻", "inscriptions");
  await navigateTo(shell, "书帖", "calligraphy");
  await expect(
    shell.locator("[data-calligraphy-category-surface]"),
  ).toHaveAttribute("data-calligraphy-classification-source", "qa-synthetic");
  return shell;
};

const activePanel = (shell: Locator) =>
  shell.locator('[data-calligraphy-category-panel][aria-hidden="false"]');

const expectCategory = async (
  shell: Locator,
  category: "all" | "ink" | "rubbing",
) => {
  await expect(
    shell.locator("[data-calligraphy-category-surface]"),
  ).toHaveAttribute("data-active-calligraphy-category", category);
  await expect(
    shell.locator(`[data-calligraphy-category-tab="${category}"]`),
  ).toHaveAttribute("aria-selected", "true");
  await expect(activePanel(shell)).toHaveAttribute(
    "data-calligraphy-category-panel",
    category,
  );
  await expect(
    shell.locator("[data-calligraphy-category-pager]"),
  ).toHaveAttribute("data-calligraphy-pager-scrolling", "false");
  await expect(
    activePanel(shell).locator("[data-home-masonry]"),
  ).toHaveAttribute("data-layout-ready", "true");
};

const observeConvergence = async (
  shell: Locator,
  testInfo: TestInfo,
  label: string,
) => {
  const samples = await shell.evaluate(async (node) => {
    const frames = [];
    for (let index = 0; index < 12; index += 1) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const frame = node.querySelector<HTMLElement>(
        "[data-calligraphy-category-pager]",
      )!;
      const panel = node.querySelector<HTMLElement>(
        '[data-calligraphy-category-panel][aria-hidden="false"]',
      )!;
      const masonry = panel.querySelector<HTMLElement>("[data-home-masonry]")!;
      frames.push({
        frameHeight: frame.getBoundingClientRect().height,
        frameWidth: frame.getBoundingClientRect().width,
        panelHeight: panel.getBoundingClientRect().height,
        masonryHeight: masonry.getBoundingClientRect().height,
        category: panel.dataset.calligraphyCategoryPanel,
        ready: masonry.dataset.layoutReady,
        scrolling: frame.dataset.calligraphyPagerScrolling,
      });
    }
    return frames;
  });
  await testInfo.attach(`layout-${label}`, {
    body: JSON.stringify(samples, null, 2),
    contentType: "application/json",
  });
  expect(samples).toHaveLength(12);
  const last = samples.at(-1)!;
  for (const sample of samples.slice(-3)) {
    expect(sample.category).toBe(last.category);
    expect(sample.ready).toBe("true");
    expect(sample.scrolling).toBe("false");
    for (const key of [
      "frameHeight",
      "frameWidth",
      "panelHeight",
      "masonryHeight",
    ] as const) {
      expect(sample[key]).toBeGreaterThan(0);
      expect(
        Math.abs(sample[key] - last[key]),
        `${label}: ${key} converges`,
      ).toBeLessThanOrEqual(1);
    }
    expect(sample.frameHeight).toBeGreaterThanOrEqual(sample.panelHeight - 1);
  }
};

const settledMediaSnapshot = async (shell: Locator) => {
  const cards = activePanel(shell).locator("[data-catalog-card]");
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    // Reveal lazy media through the browser; never change loading or layout CSS.
    await cards.nth(index).scrollIntoViewIfNeeded();
  }
  await expect
    .poll(() =>
      cards.evaluateAll((nodes) =>
        nodes.every((node) => {
          const media = node.querySelector<HTMLElement>(
            "[data-catalog-media-state]",
          );
          if (media?.dataset.catalogMediaState === "missing") return true;
          const image = media?.querySelector("img");
          return image?.complete === true && image.naturalWidth > 0;
        }),
      ),
    )
    .toBe(true);
  return cards.evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("data-catalog-id"),
      kind: node.getAttribute("data-catalog-kind"),
      mediaState: node
        .querySelector("[data-catalog-media-state]")
        ?.getAttribute("data-catalog-media-state"),
      media: Array.from(node.querySelectorAll("img"), (image) => ({
        alt: image.alt,
        src: image.getAttribute("src"),
      })),
      text: (node.textContent ?? "").replace(/\s+/g, " ").trim(),
    })),
  );
};

const readScroll = (shell: Locator) =>
  shell.evaluate((node) => {
    const platform = (node as HTMLElement).dataset.platform;
    const destination = node.querySelector(
      '[data-primary-destination="calligraphy"]',
    )!;
    const owner = platform === "pc" ? document.scrollingElement! : destination;
    return {
      platform,
      owner: platform === "pc" ? "document" : "calligraphy-destination",
      maximum: Math.max(0, owner.scrollHeight - owner.clientHeight),
      top: owner.scrollTop,
      ownerScrollEnds: (window as ObservationWindow).__calligraphyStability!
        .ownerScrollEnds,
      otherTop:
        platform === "pc"
          ? destination.scrollTop
          : document.scrollingElement!.scrollTop,
    };
  });

const expectScroll = async (shell: Locator, desired: number) => {
  await expect
    .poll(async () => {
      const { maximum, top } = await readScroll(shell);
      return Math.abs(top - Math.min(desired, maximum));
    })
    .toBeLessThanOrEqual(2);
};

test("ordinary QA original Calligraphy reveal converges without any raw browser error", async ({
  page,
}, testInfo) => {
  const shell = await enterCalligraphy(page, false);
  await expectCategory(shell, "all");
  await expect(activePanel(shell).locator("[data-catalog-card]")).toHaveCount(
    12,
  );
  await observeConvergence(shell, testInfo, "original-reveal");
});

test("hidden QA Calligraphy categories survive native reading resize and reveal without raw errors", async ({
  page,
}, testInfo) => {
  const shell = await enterCalligraphy(page, true);
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error("This matrix requires a viewport");
  const platform = await shell.getAttribute("data-platform");
  await expectCategory(shell, "all");
  const all = await settledMediaSnapshot(shell);
  expect(all.map(({ id }) => id)).toEqual(
    Array.from(
      { length: 12 },
      (_, index) =>
        `qa-visual-calligraphy-${String(index + 1).padStart(2, "0")}`,
    ),
  );
  expect(all.every(({ kind }) => kind === "calligraphy")).toBe(true);

  for (const [category, first, last] of [
    ["ink", 0, 6],
    ["rubbing", 6, 12],
  ] as const) {
    await shell
      .locator(`[data-calligraphy-category-tab="${category}"]`)
      .click();
    await expectCategory(shell, category);
    expect(await settledMediaSnapshot(shell)).toEqual(all.slice(first, last));
    await observeConvergence(shell, testInfo, category);
  }
  const rubbingScroll = await readScroll(shell);
  await navigateTo(shell, "首页", "home");
  await navigateTo(shell, "书帖", "calligraphy");
  await expectCategory(shell, "rubbing");
  await expectScroll(shell, rubbingScroll.top);

  await shell.locator('[data-calligraphy-category-tab="all"]').click();
  await expectCategory(shell, "all");
  // A bounded reading viewport ensures the twelve-card fixture actually overflows
  // in every configured project without changing the product's platform selector.
  const readingViewport = {
    width: viewport.width,
    height: Math.min(viewport.height, 500),
  };
  await page.setViewportSize(readingViewport);
  await expect(shell).toHaveAttribute("data-platform", platform ?? "");
  await expectCategory(shell, "all");
  await observeConvergence(shell, testInfo, "reading-resize");
  const panel = activePanel(shell);
  await expect(panel).toHaveAttribute("tabindex", "0");
  const beforeFocus = await readScroll(shell);
  await panel.focus();
  await expect(panel).toBeFocused();
  const afterFocus = await readScroll(shell);
  // Focusing the existing panel can natively reveal its top below the header.
  // Its scrollend may arrive after focus() returns: finish that scroll before
  // sending reading input, so its event cannot complete the PageDown assertion.
  if (afterFocus.top !== beforeFocus.top) {
    await expect
      .poll(async () => (await readScroll(shell)).ownerScrollEnds)
      .toBeGreaterThan(beforeFocus.ownerScrollEnds);
  }
  // Home is not a product scroll-to-zero command; test actual reading movement
  // from the browser's observed starting offset instead.
  const before = await readScroll(shell);
  await testInfo.attach("native-focus-before-reading", {
    body: JSON.stringify({ beforeFocus, afterFocus, settled: before }, null, 2),
    contentType: "application/json",
  });
  expect(before.maximum).toBeGreaterThan(before.top);
  expect(before.owner).toBe(
    platform === "pc" ? "document" : "calligraphy-destination",
  );
  const scrollEnds = before.ownerScrollEnds;

  if (platform === "pc") {
    testInfo.annotations.push({
      type: "input-capability",
      description:
        "Actual PC presentation; trusted browser wheel on the hit-tested current panel.",
    });
    const box = await panel.boundingBox();
    if (box === null) throw new Error("No active Calligraphy panel geometry");
    const point = {
      x: box.x + box.width / 2,
      y:
        (Math.max(0, box.y) +
          Math.min(box.y + box.height, readingViewport.height - 140)) /
        2,
    };
    await page.mouse.move(point.x, point.y);
    expect(
      await panel.evaluate(
        (node, position) =>
          node.contains(document.elementFromPoint(position.x, position.y)),
        point,
      ),
    ).toBe(true);
    await page.mouse.wheel(0, 160);
  } else {
    testInfo.annotations.push({
      type: "input-capability",
      description:
        "Compact emulation; native PageDown on the existing focusable panel. Physical iPhone/iPad touch is NOT RUN.",
    });
    await page.keyboard.press("PageDown");
  }
  await expect
    .poll(async () => (await readScroll(shell)).top)
    .toBeGreaterThan(before.top);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as ObservationWindow).__calligraphyStability!.ownerScrollEnds,
      ),
    )
    .toBeGreaterThan(scrollEnds);
  await expectCategory(shell, "all");
  const read = await readScroll(shell);
  expect(read.owner).toBe(before.owner);
  expect(read.otherTop).toBe(before.otherTop);
  await testInfo.attach("native-reading-owner", {
    body: JSON.stringify({ before, after: read }, null, 2),
    contentType: "application/json",
  });

  const changedViewport =
    platform === "pc"
      ? { width: Math.max(1024, viewport.width - 120), height: 560 }
      : { width: viewport.height, height: viewport.width };
  testInfo.annotations.push({
    type: "viewport-capability",
    description:
      "Browser viewport resize; compact projects swap portrait/landscape dimensions, not a physical-device rotation.",
  });
  await page.setViewportSize(changedViewport);
  await expectCategory(shell, "all");
  await observeConvergence(shell, testInfo, "changed-viewport");
  await expectScroll(shell, read.top);
  await page.setViewportSize(readingViewport);
  await expectCategory(shell, "all");
  await observeConvergence(shell, testInfo, "restored-viewport");
  await expectScroll(shell, read.top);
  await navigateTo(shell, "首页", "home");
  await navigateTo(shell, "书帖", "calligraphy");
  await expectCategory(shell, "all");
  await expectScroll(shell, read.top);
  expect(await settledMediaSnapshot(shell)).toEqual(all);
  await observeConvergence(shell, testInfo, "restored-media");
});
