import { expect, test } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";

const destinationAcceptance = {
  calligraphy: {
    label: "书帖",
    presentation: "calligraphy",
  },
  home: { label: "首页", presentation: "home" },
  inscriptions: {
    label: "碑刻",
    presentation: "inscription",
  },
} as const;

type AcceptanceDestination = keyof typeof destinationAcceptance;
type AcceptancePlatform = "phone" | "tablet" | "pc";

const expectedInitialAutoPlatform = (
  projectName: string,
): AcceptancePlatform => {
  if (projectName === "mobile-webkit") return "phone";
  if (projectName === "tablet-webkit") return "tablet";
  return "pc";
};

const platformSelector = (surface: Locator) =>
  surface.getByRole("combobox", { name: "QA presentation platform" });

const catalogScenarioSelector = (surface: Locator) =>
  surface.getByRole("combobox", { name: "QA Catalog scenario" });

const productShell = (surface: Locator) =>
  surface.locator("[data-product-shell]");

const setFeedLayoutThroughSettings = async (
  surface: Locator,
  layout: "single" | "double",
) => {
  const shell = productShell(surface);
  if ((await shell.getAttribute("data-feed-layout")) === layout) return;

  await shell.getByRole("button", { name: "打开设置" }).click();
  const settings = shell.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  const toggle = settings.locator("[data-feed-layout-toggle]");
  await expect(toggle).toBeVisible();
  await toggle.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(shell).toHaveAttribute("data-feed-layout", layout);
  await settings
    .getByRole("button", { name: "返回" })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(settings).toHaveCount(0);
};

const activeCatalogPresentation = (surface: Locator) =>
  surface.locator(
    "[data-primary-destination]:not([hidden]) [data-catalog-presentation]",
  );

const requireBoundingBox = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Expected a visible locator bounding box");
  return box;
};

const expectFeedCardGeometry = async ({
  columnCount,
  feed,
  fullCard,
  fullSpan,
  normalCard,
}: {
  readonly columnCount: number;
  readonly feed: Locator;
  readonly fullCard: Locator;
  readonly fullSpan: boolean;
  readonly normalCard: Locator;
}) => {
  await expect(fullCard).toHaveCSS("column-span", fullSpan ? "all" : "none");
  const [feedBox, fullCardBox, normalCardBox] = await Promise.all([
    requireBoundingBox(feed),
    requireBoundingBox(fullCard),
    requireBoundingBox(normalCard),
  ]);
  const columnGap = await feed.evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).columnGap),
  );
  const expectedColumnWidth =
    (feedBox.width - columnGap * Math.max(0, columnCount - 1)) / columnCount;

  expect(Math.abs(normalCardBox.width - expectedColumnWidth)).toBeLessThan(2);
  if (fullSpan) {
    expect(Math.abs(fullCardBox.x - feedBox.x)).toBeLessThan(2);
    expect(Math.abs(fullCardBox.width - feedBox.width)).toBeLessThan(2);
  } else {
    expect(Math.abs(fullCardBox.width - expectedColumnWidth)).toBeLessThan(2);
  }
};

const expectCatalogCardsNotToOverlap = async (feed: Locator) => {
  expect(
    await feed.locator("[data-catalog-card]").evaluateAll((cards) => {
      const rectangles = cards.map((card) => card.getBoundingClientRect());

      return rectangles.every((rectangle, index) =>
        rectangles.slice(index + 1).every((candidate) => {
          const horizontalOverlap =
            Math.min(rectangle.right, candidate.right) -
            Math.max(rectangle.left, candidate.left);
          const verticalOverlap =
            Math.min(rectangle.bottom, candidate.bottom) -
            Math.max(rectangle.top, candidate.top);
          return horizontalOverlap <= 1 || verticalOverlap <= 1;
        }),
      );
    }),
  ).toBe(true);
};

const expectNoHorizontalOverflow = async (page: Page) => {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
};

const expectFeedToClearNavigation = async ({
  feed,
  navigation,
  page,
}: {
  readonly feed: Locator;
  readonly navigation: Locator;
  readonly page: Page;
}) => {
  await feed.evaluate((node) => {
    const destination = node.closest<HTMLElement>("[data-primary-destination]");
    const platform = node.closest<HTMLElement>("[data-product-shell]")?.dataset
      .platform;
    if (platform === "pc") {
      window.scrollTo(0, document.body.scrollHeight);
    } else if (destination !== null) {
      destination.scrollTop = destination.scrollHeight;
    }
  });
  await page.waitForTimeout(50);
  const navigationBox = await requireBoundingBox(navigation);
  const finalCardBottom = await feed
    .locator("[data-catalog-card]")
    .evaluateAll((cards) =>
      Math.max(...cards.map((card) => card.getBoundingClientRect().bottom)),
    );

  expect(finalCardBottom).toBeLessThanOrEqual(navigationBox.y + 1);
};

const expectPresentationPlatform = async (
  surface: Locator,
  platform: AcceptancePlatform,
) => {
  await expect(productShell(surface)).toHaveAttribute(
    "data-platform",
    platform,
  );
  await expect(surface.locator("[data-primary-shell]")).toHaveAttribute(
    "data-platform",
    platform,
  );
  await expect(
    surface.getByRole("navigation", { name: "主要内容" }),
  ).toHaveAttribute("data-platform", platform);
};

const expectActiveDestination = async (
  surface: Locator,
  destination: AcceptanceDestination,
) => {
  const coordination = surface.locator("[data-primary-navigation-pager]");
  const shell = surface.locator("[data-primary-shell]");
  const navigation = surface.getByRole("navigation", { name: "主要内容" });

  await expect(productShell(surface)).toHaveAttribute(
    "data-active-destination",
    destination,
  );
  await expect(coordination).toHaveAttribute(
    "data-active-destination",
    destination,
  );
  await expect(shell).toHaveAttribute("data-active-destination", destination);
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(
    shell.locator("[data-primary-destination]:not([hidden])"),
  ).toHaveCount(1);
  await expect(
    navigation.locator("[data-primary-navigation-bubble]"),
  ).toBeVisible();
  await expect(
    navigation.getByRole("button", {
      exact: true,
      name: destinationAcceptance[destination].label,
    }),
  ).toHaveAttribute("aria-current", "page");

  for (const candidate of Object.keys(
    destinationAcceptance,
  ) as AcceptanceDestination[]) {
    const section = shell.locator(`[data-primary-destination="${candidate}"]`);
    const active = candidate === destination;

    await expect(section).toHaveAttribute(
      "data-active",
      active ? "true" : "false",
    );
    if (active) {
      await expect(section).not.toHaveAttribute("hidden", "");
      await expect(section).toBeVisible();
      const panel = section.locator(`[data-product-panel="${candidate}"]`);
      await expect(panel).toBeVisible();
      await expect(
        panel.locator(
          `[data-catalog-presentation="${destinationAcceptance[candidate].presentation}"]`,
        ),
      ).toBeVisible();
    } else {
      await expect(section).toHaveAttribute("hidden", "");
      await expect(section).toBeHidden();
    }
  }
};

const pagerAction = (surface: Locator, action: "previous" | "next") =>
  surface.locator(`[data-primary-pager-action="${action}"]`);

const activatePagerAction = async (
  surface: Locator,
  action: "previous" | "next",
) => {
  const button = pagerAction(surface, action);
  await expect(button).toBeEnabled();
  await button.evaluate((element) => (element as HTMLButtonElement).click());
};

const locatorCenter = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Expected a visible locator bounding box");

  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
};

const trackPointerCaptureCalls = async (button: Locator) => {
  await button.evaluate((element) => {
    const captureButton = element as HTMLButtonElement;
    const setPointerCapture =
      captureButton.setPointerCapture.bind(captureButton);
    const releasePointerCapture =
      captureButton.releasePointerCapture.bind(captureButton);

    captureButton.dataset.testSetPointerCaptureCount = "0";
    captureButton.dataset.testReleasePointerCaptureCount = "0";
    captureButton.setPointerCapture = (pointerId) => {
      captureButton.dataset.testSetPointerCaptureCount = String(
        Number(captureButton.dataset.testSetPointerCaptureCount) + 1,
      );
      setPointerCapture(pointerId);
    };
    captureButton.releasePointerCapture = (pointerId) => {
      captureButton.dataset.testReleasePointerCaptureCount = String(
        Number(captureButton.dataset.testReleasePointerCaptureCount) + 1,
      );
      releasePointerCapture(pointerId);
    };
  });
};

const openDevelopmentSurface = async (page: Page) => {
  const response = await page.goto("/dev/t02p/qa");
  expect(response?.status()).toBe(200);

  const surface = page.locator("[data-t02p-qa-harness]");
  await expect(surface).toBeVisible();
  await expect(surface.locator("[data-product-boot]")).toHaveCount(0);

  return {
    navigation: surface.getByRole("navigation", { name: "主要内容" }),
    surface,
  };
};

const openCleanProductSurface = async (page: Page) => {
  const response = await page.goto("/dev/t02p?acceptance=r01-clean");
  expect(response?.status()).toBe(200);

  const surface = page.locator("[data-clean-product-preview]");
  await expect(surface).toBeVisible();
  await expect(surface.locator("[data-product-boot]")).toHaveCount(0);

  return {
    navigation: surface.getByRole("navigation", { name: "主要内容" }),
    surface,
  };
};

const writePrimaryScroll = async (
  shell: Locator,
  destination: AcceptanceDestination,
  top: number,
) =>
  shell.evaluate(
    (node, input) => {
      const product = node as HTMLElement;
      const section = product.querySelector<HTMLElement>(
        `[data-primary-destination="${input.destination}"]`,
      );
      if (section === null) throw new Error("Missing primary destination");
      if (product.dataset.platform === "pc") {
        window.scrollTo(0, input.top);
        return document.scrollingElement?.scrollTop ?? window.scrollY;
      }
      section.scrollTop = input.top;
      return section.scrollTop;
    },
    { destination, top },
  );

const readPrimaryScroll = async (
  shell: Locator,
  destination: AcceptanceDestination,
) =>
  shell.evaluate((node, targetDestination) => {
    const product = node as HTMLElement;
    if (product.dataset.platform === "pc") {
      return document.scrollingElement?.scrollTop ?? window.scrollY;
    }
    return (
      product.querySelector<HTMLElement>(
        `[data-primary-destination="${targetDestination}"]`,
      )?.scrollTop ?? 0
    );
  }, destination);

const confirmMouseNavigationReady = async (
  surface: Locator,
  navigation: Locator,
) => {
  await expect
    .poll(async () => {
      await navigation
        .getByRole("button", { exact: true, name: "碑刻" })
        .click();
      return productShell(surface).getAttribute("data-active-destination");
    })
    .toBe("inscriptions");
  await expectActiveDestination(surface, "inscriptions");
  await expect
    .poll(async () => {
      await navigation
        .getByRole("button", { exact: true, name: "首页" })
        .click();
      return productShell(surface).getAttribute("data-active-destination");
    })
    .toBe("home");
  await expectActiveDestination(surface, "home");
};

test("Clean Product Preview is product-only and preserves shell state, scroll, Settings, and preferences", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/dev/t02p?acceptance=r01-clean");
  expect(response?.status()).toBe(200);

  const preview = page.locator("[data-clean-product-preview]");
  const shell = preview.locator("[data-product-shell]");
  const navigation = preview.getByRole("navigation", { name: "主要内容" });
  await expect(preview).toBeVisible();
  await expect(shell).toHaveAttribute(
    "data-platform",
    expectedInitialAutoPlatform(testInfo.project.name),
  );
  await expect(preview.locator("[data-qa-controls]")).toHaveCount(0);
  await expect(preview.locator("[data-development-primary-pager]")).toHaveCount(
    0,
  );
  await expect(preview).not.toContainText("T02P QA Harness");
  await expect(preview.locator("[data-product-boot]")).toHaveCount(0);

  const homeScroll = await writePrimaryScroll(shell, "home", 180);
  expect(homeScroll).toBeGreaterThan(0);
  await navigation.getByRole("button", { exact: true, name: "碑刻" }).click();
  await expect(shell).toHaveAttribute(
    "data-active-destination",
    "inscriptions",
  );
  expect(await writePrimaryScroll(shell, "inscriptions", 130)).toBeGreaterThan(
    0,
  );
  await navigation.getByRole("button", { exact: true, name: "书帖" }).click();
  await expect(shell).toHaveAttribute("data-active-destination", "calligraphy");
  await writePrimaryScroll(shell, "calligraphy", 60);
  await navigation.getByRole("button", { exact: true, name: "首页" }).click();
  await expect(shell).toHaveAttribute("data-active-destination", "home");
  await expect
    .poll(() => readPrimaryScroll(shell, "home"))
    .toBeGreaterThanOrEqual(homeScroll - 1);

  const opener = shell.getByRole("button", { name: "打开设置" });
  await opener.click();
  const settings = shell.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await expect(shell.locator("[data-product-primary-layer]")).toHaveAttribute(
    "inert",
    "",
  );
  await expect(settings.getByRole("button", { name: "返回" })).toBeFocused();
  await settings.getByRole("button", { name: /切换主题/ }).click();
  await expect(shell).toHaveAttribute("data-theme-preference", "light");

  if (expectedInitialAutoPlatform(testInfo.project.name) === "pc") {
    await expect(settings.locator("[data-feed-layout-toggle]")).toHaveCount(0);
  } else {
    await settings.locator("[data-feed-layout-toggle]").click();
    await expect(shell).toHaveAttribute("data-feed-layout", "single");
  }

  await settings.getByRole("button", { name: "返回" }).click();
  await expect(settings).toHaveCount(0);
  await expect(page).toHaveURL(/\/dev\/t02p\?acceptance=r01-clean$/u);
  await expect(opener).toBeFocused();

  await page.reload();
  const reloadedShell = page.locator("[data-product-shell]");
  await expect(reloadedShell).toHaveAttribute("data-theme-preference", "light");
  await expect(reloadedShell).toHaveAttribute(
    "data-feed-layout",
    expectedInitialAutoPlatform(testInfo.project.name) === "pc"
      ? "double"
      : "single",
  );
});

test("Direct Settings history has a safe Back and Forward path", async ({
  page,
}) => {
  const response = await page.goto("/dev/t02p?acceptance=r01-direct#settings");
  expect(response?.status()).toBe(200);
  const shell = page.locator("[data-product-shell]");
  const settings = shell.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();

  await settings.getByRole("button", { name: "返回" }).click();
  await expect(settings).toHaveCount(0);
  await expect(page).toHaveURL(/\/dev\/t02p\?acceptance=r01-direct$/u);

  await page.goForward();
  await expect(shell.getByRole("dialog", { name: "设置" })).toBeVisible();
});

test("Development QA Harness observes the shared Product Shell without owning it", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/dev/t02p/qa");
  expect(response?.status()).toBe(200);

  const surface = page.locator("[data-t02p-qa-harness]");
  await expect(surface).toBeVisible();
  const navigation = surface.getByRole("navigation", { name: "主要内容" });
  await expect(navigation).toBeVisible();
  await expect(navigation).toHaveCSS("position", "fixed");
  await expect(
    navigation.locator("[data-primary-navigation-destination]"),
  ).toHaveCount(3);
  await expect(
    navigation.locator(
      '[data-primary-navigation-destination="upload"], [data-primary-navigation-destination="profile"], [data-primary-navigation-destination="user"]',
    ),
  ).toHaveCount(0);
  await expect(
    surface.locator(
      '[data-yoyi-ui="desktop-navigation"], .yoyi-desktop-navigation',
    ),
  ).toHaveCount(0);
  await expect(catalogScenarioSelector(surface)).toHaveValue("visual");
  await expect(surface).toHaveAttribute("data-catalog-scenario", "visual");
  await expectActiveDestination(surface, "home");
  await expect(
    activeCatalogPresentation(surface).locator("[data-catalog-card]"),
  ).toHaveCount(24);
  await expect(pagerAction(surface, "previous")).toBeDisabled();

  await expect
    .poll(async () => {
      await navigation
        .getByRole("button", { name: "碑刻", exact: true })
        .click();
      return productShell(surface).getAttribute("data-active-destination");
    })
    .toBe("inscriptions");
  await expectActiveDestination(surface, "inscriptions");
  await expect(
    activeCatalogPresentation(surface).locator("[data-catalog-card]"),
  ).toHaveCount(12);

  await navigation.getByRole("button", { name: "书帖", exact: true }).click();
  await expectActiveDestination(surface, "calligraphy");
  await expect(
    activeCatalogPresentation(surface).locator("[data-catalog-card]"),
  ).toHaveCount(12);
  await expect(pagerAction(surface, "next")).toBeDisabled();

  await activatePagerAction(surface, "previous");
  await expectActiveDestination(surface, "inscriptions");
  await activatePagerAction(surface, "previous");
  await expectActiveDestination(surface, "home");
  await expect(pagerAction(surface, "previous")).toBeDisabled();

  await activatePagerAction(surface, "next");
  await expectActiveDestination(surface, "inscriptions");

  const qaPlatformSelector = platformSelector(surface);
  await expect(qaPlatformSelector).toHaveValue("auto");
  await expectPresentationPlatform(
    surface,
    expectedInitialAutoPlatform(testInfo.project.name),
  );
  await qaPlatformSelector.selectOption("phone");
  await expectPresentationPlatform(surface, "phone");
  await expect(navigation).toBeVisible();
  await expectActiveDestination(surface, "inscriptions");

  await qaPlatformSelector.selectOption("tablet");
  await expectPresentationPlatform(surface, "tablet");
  await expect(navigation).toBeVisible();
  await expectActiveDestination(surface, "inscriptions");

  await qaPlatformSelector.selectOption("pc");
  await expectPresentationPlatform(surface, "pc");
  await expectActiveDestination(surface, "inscriptions");

  await qaPlatformSelector.selectOption("auto");
  await expectPresentationPlatform(
    surface,
    expectedInitialAutoPlatform(testInfo.project.name),
  );
  await expectActiveDestination(surface, "inscriptions");
});

test("Visual Catalog covers valid, absent, and failed media with long-scroll navigation clearance", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The full deterministic media-state audit runs once in Desktop Chromium.",
  );

  const { navigation, surface } = await openDevelopmentSurface(page);
  const home = activeCatalogPresentation(surface);
  const cards = home.locator("[data-catalog-card]");
  await expect(catalogScenarioSelector(surface)).toHaveValue("visual");
  await expect(cards).toHaveCount(24);

  for (let index = 0; index < 24; index += 1) {
    await cards.nth(index).scrollIntoViewIfNeeded();
  }

  await expect(home.locator('[data-catalog-media-state="failed"]')).toHaveCount(
    1,
  );
  await expect(
    home.locator('[data-catalog-media-state="missing"]'),
  ).toHaveCount(6);
  await expect(home.locator('[data-catalog-media-state="valid"]')).toHaveCount(
    17,
  );
  await expect(home.getByText("图像无法加载", { exact: true })).toHaveCount(1);
  await expect(home.getByText("暂无公开图像", { exact: true })).toHaveCount(6);

  const validImages = home.locator('[data-catalog-media-state="valid"] img');
  await expect(validImages).toHaveCount(17);
  expect(
    await validImages.evaluateAll((images) =>
      images.every((image) => {
        const source = new URL((image as HTMLImageElement).currentSrc);
        return (
          source.origin === window.location.origin &&
          source.pathname.startsWith("/docs/design-system/assets/demo/") &&
          (image as HTMLImageElement).complete &&
          (image as HTMLImageElement).naturalWidth > 0
        );
      }),
    ),
  ).toBe(true);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const lastCardBox = await cards.last().boundingBox();
  const navigationBox = await navigation.boundingBox();
  if (lastCardBox === null || navigationBox === null) {
    throw new Error("Expected Catalog card and navigation geometry");
  }
  expect(lastCardBox.y + lastCardBox.height).toBeLessThanOrEqual(
    navigationBox.y + 1,
  );
});

test("Catalog scenario selector maps every state without changing destination", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The complete scenario matrix runs once in Desktop Chromium.",
  );

  const { navigation, surface } = await openDevelopmentSurface(page);
  const selector = catalogScenarioSelector(surface);

  await selector.selectOption("small-populated");
  const smallPopulatedImage = activeCatalogPresentation(surface).locator(
    '[data-catalog-media-state="valid"] img',
  );
  await expect(smallPopulatedImage).toHaveCount(1);
  await expect
    .poll(() =>
      smallPopulatedImage.evaluate(
        (image) =>
          (image as HTMLImageElement).complete &&
          (image as HTMLImageElement).naturalWidth > 0,
      ),
    )
    .toBe(true);
  const smallPopulatedImageUrl = new URL(
    await smallPopulatedImage.evaluate(
      (image) => (image as HTMLImageElement).currentSrc,
    ),
  );
  expect(smallPopulatedImageUrl.origin).toBe(new URL(page.url()).origin);
  expect(smallPopulatedImageUrl.pathname).toBe(
    "/docs/design-system/assets/demo/rubbing-fragment.svg",
  );

  await navigation.getByRole("button", { exact: true, name: "书帖" }).click();
  await expectActiveDestination(surface, "calligraphy");

  await expect(surface).toHaveAttribute(
    "data-catalog-scenario",
    "small-populated",
  );
  await expectActiveDestination(surface, "calligraphy");
  await expect(
    activeCatalogPresentation(surface).locator("[data-catalog-card]"),
  ).toHaveCount(1);

  for (const [scenario, state, text] of [
    ["empty", "empty", "暂无公开书帖"],
    ["unavailable", "unavailable", "档案服务暂时不可用"],
    ["unexpected-error", "unexpected-error", "无法加载公开档案"],
  ] as const) {
    await selector.selectOption(scenario);
    await expect(surface).toHaveAttribute("data-catalog-scenario", scenario);
    await expectActiveDestination(surface, "calligraphy");
    await expect(activeCatalogPresentation(surface)).toHaveAttribute(
      "data-catalog-presentation-state",
      state,
    );
    await expect(
      activeCatalogPresentation(surface).getByText(text),
    ).toBeVisible();
  }
});

test("Feed layout remains bounded to phone/tablet while PC stays responsive", async ({
  page,
}, testInfo) => {
  const { surface } = await openDevelopmentSurface(page);
  const feed = activeCatalogPresentation(surface).locator("[data-feed-layout]");
  const fullCard = feed.locator('[data-catalog-feed-span="full"]').first();
  const normalCard = feed
    .locator("[data-catalog-card]:not([data-catalog-feed-span])")
    .first();
  await expect(productShell(surface)).toHaveAttribute(
    "data-feed-layout",
    "double",
  );
  await expect(feed.locator('[data-catalog-feed-span="full"]')).toHaveCount(2);

  if (expectedInitialAutoPlatform(testInfo.project.name) === "pc") {
    await productShell(surface)
      .getByRole("button", { name: "打开设置" })
      .click();
    const settings = productShell(surface).getByRole("dialog", {
      name: "设置",
    });
    await expect(settings.locator("[data-feed-layout-toggle]")).toHaveCount(0);
    await settings
      .getByRole("button", { name: "返回" })
      .evaluate((button) => (button as HTMLButtonElement).click());
    const columnCount = Number(
      await feed.evaluate((node) => getComputedStyle(node).columnCount),
    );
    expect(columnCount).toBeGreaterThanOrEqual(3);
    await expectFeedCardGeometry({
      columnCount,
      feed,
      fullCard,
      fullSpan: false,
      normalCard,
    });
    return;
  }

  await expect(feed).toHaveCSS("column-count", "2");
  await expectActiveDestination(surface, "home");
  await expectFeedCardGeometry({
    columnCount: 2,
    feed,
    fullCard,
    fullSpan: testInfo.project.name === "tablet-webkit",
    normalCard,
  });

  await setFeedLayoutThroughSettings(surface, "single");
  await expect(feed).toHaveAttribute("data-feed-layout", "single");
  await expect(feed).toHaveCSS("column-count", "1");
  await expectActiveDestination(surface, "home");
  await expectFeedCardGeometry({
    columnCount: 1,
    feed,
    fullCard,
    fullSpan: false,
    normalCard,
  });
});

test("Tablet Double gives ultra-wide Home and Calligraphy feed cards a distinct full-width rhythm", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "tablet-webkit",
    "The Tablet feed composition audit runs only in Tablet WebKit.",
  );

  const { navigation, surface } = await openDevelopmentSurface(page);
  await page.setViewportSize({ height: 1194, width: 834 });
  await expect(platformSelector(surface)).toHaveValue("auto");
  await expectPresentationPlatform(surface, "tablet");
  await expect(productShell(surface)).toHaveAttribute(
    "data-feed-layout",
    "double",
  );

  const home = activeCatalogPresentation(surface);
  const homeFeed = home.locator('[data-feed-layout="double"]');
  const homeUltraWide = home.locator(
    '[data-catalog-id="qa-visual-inscription-04"]',
  );
  await expect(home.locator('[data-catalog-feed-span="full"]')).toHaveCount(2);
  await expectFeedCardGeometry({
    columnCount: 2,
    feed: homeFeed,
    fullCard: homeUltraWide,
    fullSpan: true,
    normalCard: home.locator('[data-catalog-id="qa-visual-inscription-01"]'),
  });

  const beforeSpan = home.locator(
    '[data-catalog-id="qa-visual-calligraphy-03"]',
  );
  const afterSpanLeft = home.locator(
    '[data-catalog-id="qa-visual-calligraphy-04"]',
  );
  const afterSpanRight = home.locator(
    '[data-catalog-id="qa-visual-inscription-05"]',
  );
  await expect(beforeSpan).toBeVisible();
  await expect(afterSpanLeft).toBeVisible();
  await expect(afterSpanRight).toBeVisible();
  const [afterSpanLeftBox, afterSpanRightBox] = await Promise.all([
    requireBoundingBox(afterSpanLeft),
    requireBoundingBox(afterSpanRight),
  ]);
  expect(Math.abs(afterSpanLeftBox.x - afterSpanRightBox.x)).toBeGreaterThan(
    afterSpanLeftBox.width / 2,
  );

  await homeUltraWide.locator("img").dispatchEvent("error");
  await expect(homeUltraWide).toHaveAttribute("data-catalog-feed-span", "full");
  await expect(
    homeUltraWide.locator('[data-catalog-media-state="failed"]'),
  ).toBeVisible();
  await expectFeedCardGeometry({
    columnCount: 2,
    feed: homeFeed,
    fullCard: homeUltraWide,
    fullSpan: true,
    normalCard: home.locator('[data-catalog-id="qa-visual-inscription-01"]'),
  });
  await expectCatalogCardsNotToOverlap(homeFeed);
  await expectNoHorizontalOverflow(page);
  await expectFeedToClearNavigation({ feed: homeFeed, navigation, page });

  await navigation.getByRole("button", { exact: true, name: "书帖" }).click();
  await expectActiveDestination(surface, "calligraphy");
  await page.setViewportSize({ height: 834, width: 1194 });
  await expect(platformSelector(surface)).toHaveValue("auto");
  await expectPresentationPlatform(surface, "tablet");
  await expectActiveDestination(surface, "calligraphy");

  const calligraphy = activeCatalogPresentation(surface);
  const calligraphyFeed = calligraphy.locator('[data-feed-layout="double"]');
  await expect(
    calligraphy.locator('[data-catalog-feed-span="full"]'),
  ).toHaveCount(1);
  await expectFeedCardGeometry({
    columnCount: 2,
    feed: calligraphyFeed,
    fullCard: calligraphy.locator(
      '[data-catalog-id="qa-visual-calligraphy-05"]',
    ),
    fullSpan: true,
    normalCard: calligraphy.locator(
      '[data-catalog-id="qa-visual-calligraphy-01"]',
    ),
  });
  await expectCatalogCardsNotToOverlap(calligraphyFeed);
  await expectNoHorizontalOverflow(page);

  await navigation.getByRole("button", { exact: true, name: "首页" }).click();
  await expectActiveDestination(surface, "home");
  await expectFeedCardGeometry({
    columnCount: 2,
    feed: activeCatalogPresentation(surface).locator(
      '[data-feed-layout="double"]',
    ),
    fullCard: activeCatalogPresentation(surface).locator(
      '[data-catalog-id="qa-visual-inscription-04"]',
    ),
    fullSpan: true,
    normalCard: activeCatalogPresentation(surface).locator(
      '[data-catalog-id="qa-visual-inscription-01"]',
    ),
  });

  await setFeedLayoutThroughSettings(surface, "single");
  await expectFeedCardGeometry({
    columnCount: 1,
    feed: activeCatalogPresentation(surface).locator(
      '[data-feed-layout="single"]',
    ),
    fullCard: activeCatalogPresentation(surface).locator(
      '[data-catalog-id="qa-visual-inscription-04"]',
    ),
    fullSpan: false,
    normalCard: activeCatalogPresentation(surface).locator(
      '[data-catalog-id="qa-visual-inscription-01"]',
    ),
  });

  await navigation.getByRole("button", { exact: true, name: "碑刻" }).click();
  await expectActiveDestination(surface, "inscriptions");
  const inscriptions = activeCatalogPresentation(surface);
  const inscriptionList = inscriptions.locator("[data-catalog-item-count]");
  await expect(inscriptions.locator("[data-catalog-feed-span]")).toHaveCount(0);
  const [inscriptionListBox, inscriptionCardBox] = await Promise.all([
    requireBoundingBox(inscriptionList),
    requireBoundingBox(inscriptions.locator("[data-catalog-card]").first()),
  ]);
  expect(
    Math.abs(inscriptionCardBox.width - inscriptionListBox.width),
  ).toBeLessThan(2);
  await expectNoHorizontalOverflow(page);
});

test("Auto mode applies desktop viewport boundaries without resetting the active destination", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Desktop policy boundaries run only in the desktop browser context.",
  );

  const { navigation, surface } = await openDevelopmentSurface(page);
  await confirmMouseNavigationReady(surface, navigation);
  await navigation.getByRole("button", { exact: true, name: "碑刻" }).click();
  await expectActiveDestination(surface, "inscriptions");
  await expect(platformSelector(surface)).toHaveValue("auto");

  for (const [width, platform] of [
    [767, "phone"],
    [768, "tablet"],
    [895, "tablet"],
    [896, "pc"],
  ] as const satisfies readonly (readonly [number, AcceptancePlatform])[]) {
    await page.setViewportSize({ height: 900, width });
    await expectPresentationPlatform(surface, platform);
    await expectActiveDestination(surface, "inscriptions");
  }
});

test("Auto mode keeps an iPhone-like runtime on phone across viewport changes", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-webkit",
    "Phone runtime policy runs only in the Mobile WebKit context.",
  );

  const { surface } = await openDevelopmentSurface(page);
  await expect(platformSelector(surface)).toHaveValue("auto");
  await expectPresentationPlatform(surface, "phone");

  await page.setViewportSize({ height: 500, width: 1200 });
  await expectPresentationPlatform(surface, "phone");
  await page.setViewportSize({ height: 700, width: 320 });
  await expectPresentationPlatform(surface, "phone");
});

test("Auto mode applies iPad-like viewport caps in both directions", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "tablet-webkit",
    "Tablet runtime policy runs only in the Tablet WebKit context.",
  );

  const { surface } = await openDevelopmentSurface(page);
  await expect(platformSelector(surface)).toHaveValue("auto");
  await expectPresentationPlatform(surface, "tablet");

  await page.setViewportSize({ height: 900, width: 600 });
  await expectPresentationPlatform(surface, "phone");
  await page.setViewportSize({ height: 768, width: 1024 });
  await expectPresentationPlatform(surface, "tablet");
});

test("Auto mode synchronizes from current runtime values on orientationchange", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The isolated orientation event check runs once in Desktop Chromium.",
  );

  const { navigation, surface } = await openDevelopmentSurface(page);
  await confirmMouseNavigationReady(surface, navigation);
  await navigation.getByRole("button", { exact: true, name: "书帖" }).click();
  await expectActiveDestination(surface, "calligraphy");

  await page.evaluate(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 800,
    });
    window.dispatchEvent(new Event("orientationchange"));
  });

  await expectPresentationPlatform(surface, "tablet");
  await expectActiveDestination(surface, "calligraphy");
});

test("QA overrides survive runtime changes and returning Auto uses the current runtime", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Override and reload coordination run once in Desktop Chromium.",
  );

  const { navigation, surface } = await openDevelopmentSurface(page);
  const qaPlatformSelector = platformSelector(surface);
  await confirmMouseNavigationReady(surface, navigation);
  await navigation.getByRole("button", { exact: true, name: "碑刻" }).click();
  await expectActiveDestination(surface, "inscriptions");

  for (const [mode, width] of [
    ["phone", 1000],
    ["tablet", 500],
    ["pc", 800],
  ] as const satisfies readonly (readonly [AcceptancePlatform, number])[]) {
    await qaPlatformSelector.selectOption(mode);
    await page.setViewportSize({ height: 900, width });
    await page.evaluate(() => {
      window.dispatchEvent(new Event("orientationchange"));
    });
    await expectPresentationPlatform(surface, mode);
    await expectActiveDestination(surface, "inscriptions");
  }

  await qaPlatformSelector.selectOption("auto");
  await expectPresentationPlatform(surface, "tablet");
  await expectActiveDestination(surface, "inscriptions");

  await qaPlatformSelector.selectOption("phone");
  await page.reload();
  const reloadedSurface = page.locator("[data-t02p-qa-harness]");
  await expect(reloadedSurface).toBeVisible();
  await expect(platformSelector(reloadedSurface)).toHaveValue("auto");
  await expectPresentationPlatform(reloadedSurface, "tablet");
});

test("Reduced motion preserves tap and release-only primary commits", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Reduced-motion Product semantics run once in Desktop Chromium.",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  const { navigation, surface } = await openCleanProductSurface(page);
  const inscriptionsButton = navigation.getByRole("button", {
    exact: true,
    name: "碑刻",
  });
  const calligraphyButton = navigation.getByRole("button", {
    exact: true,
    name: "书帖",
  });

  await inscriptionsButton.click();
  await expectActiveDestination(surface, "inscriptions");

  const inscriptionsCenter = await locatorCenter(inscriptionsButton);
  const calligraphyCenter = await locatorCenter(calligraphyButton);
  await page.mouse.move(inscriptionsCenter.x, inscriptionsCenter.y);
  await page.mouse.down();
  await page.mouse.move(calligraphyCenter.x, calligraphyCenter.y, { steps: 5 });
  await expectActiveDestination(surface, "inscriptions");
  await page.mouse.up();
  await expectActiveDestination(surface, "calligraphy");
});

test("Touchscreen tap commits each primary destination on touch WebKit", async ({
  page,
}, testInfo) => {
  test.skip(
    !["mobile-webkit", "tablet-webkit"].includes(testInfo.project.name),
    "Touchscreen evidence runs only in configured touch contexts.",
  );

  const { navigation, surface } = await openCleanProductSurface(page);

  for (const destination of ["inscriptions", "calligraphy", "home"] as const) {
    const targetButton = navigation.getByRole("button", {
      exact: true,
      name: destinationAcceptance[destination].label,
    });
    const center = await locatorCenter(targetButton);
    expect(
      await page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest("button")
            ?.getAttribute("aria-label") ?? null,
        center,
      ),
    ).toBe(destinationAcceptance[destination].label);
    await page.touchscreen.tap(center.x, center.y);
    await expectActiveDestination(surface, destination);
  }
});

test("Mobile WebKit locator click commits each primary destination", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-webkit",
    "Locator-click evidence is reported separately for Mobile WebKit.",
  );

  const { navigation, surface } = await openCleanProductSurface(page);

  for (const destination of ["inscriptions", "calligraphy", "home"] as const) {
    await navigation
      .getByRole("button", {
        exact: true,
        name: destinationAcceptance[destination].label,
      })
      .click();
    await expectActiveDestination(surface, destination);
  }
});

test("R02 keeps one navigation tree and isolates accepted marks from the glass compositor", async ({
  page,
}) => {
  const navigationAssetResponses: { status: number; url: string }[] = [];
  const navigationAssetFailures: string[] = [];
  const consoleErrors: string[] = [];
  page.on("response", (response) => {
    if (
      /\/_next\/static\/media\/(?:home|inscriptions|calligraphy|nav-)/u.test(
        response.url(),
      )
    ) {
      navigationAssetResponses.push({
        status: response.status(),
        url: response.url(),
      });
    }
  });
  page.on("requestfailed", (request) => {
    if (
      /\/_next\/static\/media\/(?:home|inscriptions|calligraphy|nav-)/u.test(
        request.url(),
      )
    ) {
      navigationAssetFailures.push(request.url());
    }
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.location().url.includes("qa-visual-intentionally-missing.svg")
    ) {
      consoleErrors.push(message.text());
    }
  });

  const { navigation, surface } = await openCleanProductSurface(page);
  await expect(
    navigation.locator("[data-primary-navigation-inline-icon]"),
  ).toHaveCount(3);
  await expect(
    navigation.locator("[data-primary-navigation-inline-label]"),
  ).toHaveCount(3);
  await expect(
    navigation.locator("[data-primary-navigation-inline-label] image"),
  ).toHaveCount(3);

  const initialRendering = await navigation.evaluate((node) => {
    const navigationElement = node as HTMLElement;
    const icons = Array.from(
      navigationElement.querySelectorAll(
        "[data-primary-navigation-inline-icon]",
      ),
    );
    const labels = Array.from(
      navigationElement.querySelectorAll(
        "[data-primary-navigation-inline-label]",
      ),
    );
    const glass = navigationElement.querySelector(
      "[data-primary-navigation-glass]",
    );
    Object.assign(window, {
      __r02NavigationIdentity: { glass, icons, labels, navigationElement },
    });
    return {
      glassBackdrop:
        glass instanceof HTMLElement
          ? getComputedStyle(glass).getPropertyValue(
              "-webkit-backdrop-filter",
            ) ||
            getComputedStyle(glass).backdropFilter ||
            "none"
          : "missing",
      iconMasks: icons.map(
        (icon) =>
          getComputedStyle(icon).webkitMaskImage ||
          getComputedStyle(icon).maskImage ||
          "none",
      ),
      labelMasks: labels.map(
        (label) =>
          getComputedStyle(label).webkitMaskImage ||
          getComputedStyle(label).maskImage ||
          "none",
      ),
      navigationBackdrop:
        getComputedStyle(navigationElement).getPropertyValue(
          "-webkit-backdrop-filter",
        ) ||
        getComputedStyle(navigationElement).backdropFilter ||
        "none",
    };
  });
  expect(initialRendering.navigationBackdrop).toBe("none");
  expect(initialRendering.glassBackdrop).not.toBe("none");
  expect(initialRendering.glassBackdrop).not.toBe("missing");
  expect(initialRendering.iconMasks).toEqual(["none", "none", "none"]);
  expect(initialRendering.labelMasks).toEqual(["none", "none", "none"]);

  for (const destination of ["inscriptions", "calligraphy", "home"] as const) {
    await navigation
      .getByRole("button", {
        exact: true,
        name: destinationAcceptance[destination].label,
      })
      .click();
    await expectActiveDestination(surface, destination);
  }
  await productShell(surface).getByRole("button", { name: "打开设置" }).click();
  const settings = productShell(surface).getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "返回" }).click();
  await expect(settings).toHaveCount(0);

  const viewport = page.viewportSize();
  if (viewport !== null) {
    await page.setViewportSize({
      height: viewport.width,
      width: viewport.height,
    });
  }
  await expect
    .poll(async () => {
      const [shellPlatform, navigationPlatform] = await Promise.all([
        productShell(surface).getAttribute("data-platform"),
        navigation.getAttribute("data-platform"),
      ]);
      return shellPlatform !== null && shellPlatform === navigationPlatform
        ? shellPlatform
        : null;
    })
    .toMatch(/^(?:phone|tablet|pc)$/u);
  expect(
    await navigation.evaluate((node) => {
      const identity = (
        window as typeof window & {
          __r02NavigationIdentity: {
            glass: Element | null;
            icons: Element[];
            labels: Element[];
            navigationElement: Element;
          };
        }
      ).__r02NavigationIdentity;
      return (
        identity.navigationElement === node &&
        identity.glass ===
          node.querySelector("[data-primary-navigation-glass]") &&
        identity.icons.every(
          (icon, index) =>
            icon ===
            node.querySelectorAll("[data-primary-navigation-inline-icon]")[
              index
            ],
        ) &&
        identity.labels.every(
          (label, index) =>
            label ===
            node.querySelectorAll("[data-primary-navigation-inline-label]")[
              index
            ],
        )
      );
    }),
  ).toBe(true);

  expect(navigationAssetFailures).toEqual([]);
  expect(
    navigationAssetResponses.some(({ url }) =>
      /\/(?:home|inscriptions|calligraphy)\.[^.]+\.svg/u.test(url),
    ),
  ).toBe(false);
  expect(
    new Set(
      navigationAssetResponses
        .filter(({ url }) =>
          /\/nav-(?:home|inscriptions|calligraphy)\.[^.]+\.png/u.test(url),
        )
        .map(({ url }) => new URL(url).pathname),
    ).size,
  ).toBe(3);
  expect(navigationAssetResponses.every(({ status }) => status < 400)).toBe(
    true,
  );
  expect(consoleErrors).toEqual([]);
});

test("Mobile and Tablet navigation minimize with hysteresis, idle restore, and an expand-only tap", async ({
  page,
}, testInfo) => {
  test.skip(
    !["mobile-webkit", "tablet-webkit"].includes(testInfo.project.name),
    "The canonical minimize behavior applies to Phone and Tablet navigation.",
  );

  const { navigation, surface } = await openCleanProductSurface(page);
  const shell = productShell(surface);
  const activeSection = surface.locator('[data-primary-destination="home"]');
  const scrollTo = async (top: number) =>
    activeSection.evaluate((node, nextTop) => {
      const section = node as HTMLElement;
      section.scrollTop = nextTop;
      section.dispatchEvent(new Event("scroll"));
      return section.scrollTop;
    }, top);

  expect(await scrollTo(20)).toBeGreaterThanOrEqual(12);
  await expect(navigation).toHaveAttribute("data-minimized", "true");
  await expect(shell).toHaveAttribute(
    "data-primary-navigation-minimized",
    "true",
  );
  await expect(
    navigation.locator("[data-primary-navigation-bubble]"),
  ).toBeHidden();
  expect(
    await navigation
      .locator("[data-primary-navigation-inline-label]")
      .evaluateAll((labels) =>
        labels.every((label) => label.getClientRects().length === 0),
      ),
  ).toBe(true);
  await expect(
    navigation.locator("[data-primary-navigation-destination]:visible"),
  ).toHaveCount(1);
  await page.waitForTimeout(250);
  await scrollTo(21);
  await page.waitForTimeout(190);
  const minimizedBox = await requireBoundingBox(navigation);
  expect(Math.abs(minimizedBox.width - 44)).toBeLessThan(4);
  expect(Math.abs(minimizedBox.height - 44)).toBeLessThan(2);

  await expect(navigation).toHaveAttribute("data-minimized", "false");
  await expect
    .poll(() => requireBoundingBox(navigation).then((box) => box.width))
    .toBeGreaterThan(300);

  await scrollTo(40);
  await expect(navigation).toHaveAttribute("data-minimized", "true");
  await scrollTo(100);
  await scrollTo(88);
  await expect(navigation).toHaveAttribute("data-minimized", "true");
  await scrollTo(76);
  await expect(navigation).toHaveAttribute("data-minimized", "false");

  await scrollTo(96);
  await expect(navigation).toHaveAttribute("data-minimized", "true");
  await page.waitForTimeout(250);
  await scrollTo(97);
  await page.waitForTimeout(190);
  const beforeExpandTap = await page.evaluate(() => ({
    active: document
      .querySelector("[data-product-shell]")
      ?.getAttribute("data-active-destination"),
    href: window.location.href,
    history: JSON.stringify(window.history.state),
  }));
  const minimizedTapBox = await requireBoundingBox(navigation);
  await page.touchscreen.tap(
    minimizedTapBox.x + minimizedTapBox.width / 2,
    minimizedTapBox.y + minimizedTapBox.height / 2,
  );
  await expect(navigation).toHaveAttribute("data-minimized", "false");
  expect(
    await page.evaluate(() => ({
      active: document
        .querySelector("[data-product-shell]")
        ?.getAttribute("data-active-destination"),
      href: window.location.href,
      history: JSON.stringify(window.history.state),
    })),
  ).toEqual(beforeExpandTap);
});

test("Mouse regression: navigation drag previews only the bubble and commits on release", async ({
  page,
}) => {
  const { navigation, surface } = await openDevelopmentSurface(page);
  await confirmMouseNavigationReady(surface, navigation);
  const homeButton = navigation.getByRole("button", {
    exact: true,
    name: "首页",
  });
  const inscriptionsButton = navigation.getByRole("button", {
    exact: true,
    name: "碑刻",
  });
  const homeCenter = await locatorCenter(homeButton);
  const inscriptionsCenter = await locatorCenter(inscriptionsButton);
  const committedHomePanel = surface.locator(
    '[data-primary-destination="home"]',
  );
  const committedPanelBeforeDrag = await committedHomePanel.boundingBox();
  const frozenProductState = await page.evaluate(() => {
    const calls = { push: 0, replace: 0 };
    const initialState = window.history.state as {
      destination?: unknown;
      kind?: unknown;
      version?: unknown;
    } | null;
    let lastPrimaryDestination =
      initialState?.version === 1 && initialState.kind === "primary"
        ? initialState.destination
        : null;
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(
      window.history,
    );
    window.history.pushState = (...args) => {
      const state = args[0] as { kind?: unknown; version?: unknown } | null;
      if (state?.version === 1 && state.kind === "settings") calls.push += 1;
      return originalPushState(...args);
    };
    window.history.replaceState = (...args) => {
      const state = args[0] as {
        destination?: unknown;
        kind?: unknown;
        version?: unknown;
      } | null;
      if (state?.version === 1 && state.kind === "primary") {
        if (state.destination !== lastPrimaryDestination) {
          calls.replace += 1;
          lastPrimaryDestination = state.destination;
        }
      }
      return originalReplaceState(...args);
    };
    Object.assign(window, { __r01HistoryCalls: calls });
    return {
      ariaCurrent: document
        .querySelector('[data-primary-navigation] [aria-current="page"]')
        ?.getAttribute("aria-label"),
      focus:
        document.activeElement instanceof HTMLElement
          ? (document.activeElement.dataset.primaryNavigationDestination ??
            document.activeElement.getAttribute("aria-label") ??
            document.activeElement.tagName)
          : null,
      href: window.location.href,
      scrollTop:
        document.querySelector<HTMLElement>('[data-primary-destination="home"]')
          ?.scrollTop ?? null,
      state: JSON.stringify(window.history.state),
    };
  });

  await trackPointerCaptureCalls(homeButton);

  await page.mouse.move(homeCenter.x, homeCenter.y);
  await page.mouse.down();
  await expect(homeButton).toHaveAttribute(
    "data-test-set-pointer-capture-count",
    "0",
  );
  await page.mouse.move(homeCenter.x + 4, homeCenter.y);
  await expect(navigation).not.toHaveAttribute("data-dragging", "true");
  await expect(homeButton).toHaveAttribute(
    "data-test-set-pointer-capture-count",
    "0",
  );
  await page.mouse.move(inscriptionsCenter.x, inscriptionsCenter.y, {
    steps: 5,
  });

  await expect(homeButton).toHaveAttribute(
    "data-test-set-pointer-capture-count",
    "1",
  );
  await expect(navigation).toHaveAttribute("data-dragging", "true");
  await expect(navigation).toHaveAttribute("data-bubble-preview-index", /.+/);
  const previewIndex = Number(
    await navigation.getAttribute("data-bubble-preview-index"),
  );
  expect(previewIndex).toBeGreaterThanOrEqual(0.5);
  expect(previewIndex).toBeLessThanOrEqual(1.5);
  await expectActiveDestination(surface, "home");
  await expect(committedHomePanel).toHaveAttribute("data-active", "true");
  expect(await committedHomePanel.boundingBox()).toEqual(
    committedPanelBeforeDrag,
  );
  expect(
    await page.evaluate(() => ({
      ariaCurrent: document
        .querySelector('[data-primary-navigation] [aria-current="page"]')
        ?.getAttribute("aria-label"),
      calls: (
        window as typeof window & {
          __r01HistoryCalls: { push: number; replace: number };
        }
      ).__r01HistoryCalls,
      focus:
        document.activeElement instanceof HTMLElement
          ? (document.activeElement.dataset.primaryNavigationDestination ??
            document.activeElement.getAttribute("aria-label") ??
            document.activeElement.tagName)
          : null,
      href: window.location.href,
      scrollTop:
        document.querySelector<HTMLElement>('[data-primary-destination="home"]')
          ?.scrollTop ?? null,
      state: JSON.stringify(window.history.state),
    })),
  ).toEqual({
    ariaCurrent: frozenProductState.ariaCurrent,
    calls: { push: 0, replace: 0 },
    focus: frozenProductState.focus,
    href: frozenProductState.href,
    scrollTop: frozenProductState.scrollTop,
    state: frozenProductState.state,
  });

  await page.mouse.up();

  await expectActiveDestination(surface, "inscriptions");
  await expect(homeButton).toHaveAttribute(
    "data-test-release-pointer-capture-count",
    "1",
  );
  await expect(navigation).not.toHaveAttribute("data-dragging", "true");
  await expect(navigation).not.toHaveAttribute(
    "data-bubble-preview-index",
    /.+/,
  );
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __r01HistoryCalls: { push: number; replace: number };
          }
        ).__r01HistoryCalls,
    ),
  ).toEqual({ push: 0, replace: 1 });
});

test("Synthetic touch pointer logic: passive candidate, intent threshold, and drag-click isolation", async ({
  page,
}) => {
  const { navigation, surface } = await openDevelopmentSurface(page);
  const homeButton = navigation.getByRole("button", {
    exact: true,
    name: "首页",
  });
  const inscriptionsButton = navigation.getByRole("button", {
    exact: true,
    name: "碑刻",
  });
  const calligraphyButton = navigation.getByRole("button", {
    exact: true,
    name: "书帖",
  });
  const homeCenter = await locatorCenter(homeButton);
  const inscriptionsCenter = await locatorCenter(inscriptionsButton);

  await confirmMouseNavigationReady(surface, navigation);
  await trackPointerCaptureCalls(homeButton);
  await expect(navigation).toHaveCSS("touch-action", "pan-y");

  await homeButton.dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    clientX: homeCenter.x,
    clientY: homeCenter.y,
    isPrimary: true,
    pointerId: 81,
    pointerType: "touch",
  });
  await expectActiveDestination(surface, "home");
  await expect(navigation).not.toHaveAttribute("data-dragging", "true");
  await expect(navigation).not.toHaveAttribute(
    "data-bubble-preview-index",
    /.+/,
  );
  await expect(homeButton).toHaveAttribute(
    "data-test-set-pointer-capture-count",
    "0",
  );

  await homeButton.dispatchEvent("pointermove", {
    button: 0,
    buttons: 1,
    clientX: homeCenter.x + 8,
    clientY: homeCenter.y,
    isPrimary: true,
    pointerId: 81,
    pointerType: "touch",
  });
  await expect(navigation).not.toHaveAttribute("data-dragging", "true");
  await homeButton.dispatchEvent("pointerup", {
    button: 0,
    buttons: 0,
    clientX: homeCenter.x + 8,
    clientY: homeCenter.y,
    isPrimary: true,
    pointerId: 81,
    pointerType: "touch",
  });
  await inscriptionsButton.click();
  await expectActiveDestination(surface, "inscriptions");
  await homeButton.click();
  await expectActiveDestination(surface, "home");

  await homeButton.dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    clientX: homeCenter.x,
    clientY: homeCenter.y,
    isPrimary: true,
    pointerId: 82,
    pointerType: "touch",
  });
  await homeButton.dispatchEvent("pointermove", {
    button: 0,
    buttons: 1,
    clientX: homeCenter.x + 20,
    clientY: homeCenter.y + 30,
    isPrimary: true,
    pointerId: 82,
    pointerType: "touch",
  });
  await expect(navigation).not.toHaveAttribute("data-dragging", "true");
  await expect(homeButton).toHaveAttribute(
    "data-test-set-pointer-capture-count",
    "0",
  );
  await homeButton.dispatchEvent("pointerup", {
    button: 0,
    buttons: 0,
    clientX: homeCenter.x + 20,
    clientY: homeCenter.y + 30,
    isPrimary: true,
    pointerId: 82,
    pointerType: "touch",
  });
  await expectActiveDestination(surface, "home");

  await homeButton.dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    clientX: homeCenter.x,
    clientY: homeCenter.y,
    isPrimary: true,
    pointerId: 83,
    pointerType: "touch",
  });
  await homeButton.dispatchEvent("pointermove", {
    button: 0,
    buttons: 1,
    clientX: inscriptionsCenter.x,
    clientY: inscriptionsCenter.y,
    isPrimary: true,
    pointerId: 83,
    pointerType: "touch",
  });
  await expect(navigation).toHaveAttribute("data-dragging", "true");
  await expect(navigation).toHaveAttribute("data-bubble-preview-index", /.+/);
  await expect(homeButton).toHaveAttribute(
    "data-test-set-pointer-capture-count",
    "0",
  );
  await homeButton.evaluate((button, { x, y }) => {
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        buttons: 0,
        clientX: x,
        clientY: y,
        isPrimary: true,
        pointerId: 83,
        pointerType: "touch",
      }),
    );
    button.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
        detail: 1,
      }),
    );
  }, inscriptionsCenter);
  await expectActiveDestination(surface, "inscriptions");
  await expect(navigation).not.toHaveAttribute("data-dragging", "true");
  await calligraphyButton.click();
  await expectActiveDestination(surface, "calligraphy");
});

test("Mouse and synthetic pointer regressions: current-item release and cancellation do not commit", async ({
  page,
}) => {
  const { navigation, surface } = await openDevelopmentSurface(page);
  await confirmMouseNavigationReady(surface, navigation);
  const homeButton = navigation.getByRole("button", {
    exact: true,
    name: "首页",
  });
  const inscriptionsButton = navigation.getByRole("button", {
    exact: true,
    name: "碑刻",
  });
  const homeCenter = await locatorCenter(homeButton);
  const inscriptionsCenter = await locatorCenter(inscriptionsButton);
  const sameItemPreviewX =
    homeCenter.x + (inscriptionsCenter.x - homeCenter.x) * 0.35;

  await page.mouse.move(homeCenter.x, homeCenter.y);
  await page.mouse.down();
  await page.mouse.move(sameItemPreviewX, homeCenter.y, { steps: 5 });
  await expect(navigation).toHaveAttribute("data-dragging", "true");
  await page.mouse.up();

  await expectActiveDestination(surface, "home");
  await expect(navigation).not.toHaveAttribute("data-dragging", "true");

  const pointerId = 71;
  await homeButton.dispatchEvent("pointerdown", {
    button: 0,
    clientX: homeCenter.x,
    clientY: homeCenter.y,
    isPrimary: true,
    pointerId,
    pointerType: "touch",
  });
  await navigation.dispatchEvent("pointermove", {
    button: 0,
    clientX: inscriptionsCenter.x,
    clientY: inscriptionsCenter.y,
    isPrimary: true,
    pointerId,
    pointerType: "touch",
  });
  await expect(navigation).toHaveAttribute("data-dragging", "true");
  await navigation.dispatchEvent("pointercancel", {
    button: 0,
    clientX: inscriptionsCenter.x,
    clientY: inscriptionsCenter.y,
    isPrimary: true,
    pointerId,
    pointerType: "touch",
  });

  await expectActiveDestination(surface, "home");
  await expect(navigation).not.toHaveAttribute("data-dragging", "true");
  await expect(navigation).not.toHaveAttribute(
    "data-bubble-preview-index",
    /.+/,
  );

  await homeButton.dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    clientX: homeCenter.x,
    clientY: homeCenter.y,
    isPrimary: true,
    pointerId: 72,
    pointerType: "touch",
  });
  await navigation.dispatchEvent("pointermove", {
    button: 0,
    buttons: 1,
    clientX: inscriptionsCenter.x,
    clientY: inscriptionsCenter.y,
    isPrimary: true,
    pointerId: 72,
    pointerType: "touch",
  });
  await expect(navigation).toHaveAttribute("data-dragging", "true");
  await homeButton.dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    clientX: homeCenter.x,
    clientY: homeCenter.y,
    isPrimary: false,
    pointerId: 73,
    pointerType: "touch",
  });
  await expect(navigation).not.toHaveAttribute("data-dragging", "true");
  await navigation.dispatchEvent("pointerup", {
    button: 0,
    buttons: 0,
    clientX: inscriptionsCenter.x,
    clientY: inscriptionsCenter.y,
    isPrimary: true,
    pointerId: 72,
    pointerType: "touch",
  });
  await expectActiveDestination(surface, "home");

  await homeButton.evaluate((button) => {
    button.addEventListener(
      "pointerdown",
      (event) => {
        button.dataset.testPointerId = String(
          (event as PointerEvent).pointerId,
        );
      },
      { once: true },
    );
  });
  await page.mouse.move(homeCenter.x, homeCenter.y);
  await page.mouse.down();
  await page.mouse.move(inscriptionsCenter.x, inscriptionsCenter.y, {
    steps: 5,
  });
  await expect(navigation).toHaveAttribute("data-dragging", "true");
  const capturedPointerId = Number(
    await homeButton.getAttribute("data-test-pointer-id"),
  );
  expect(Number.isFinite(capturedPointerId)).toBe(true);
  await homeButton.dispatchEvent("lostpointercapture", {
    button: 0,
    clientX: inscriptionsCenter.x,
    clientY: inscriptionsCenter.y,
    isPrimary: true,
    pointerId: capturedPointerId,
    pointerType: "mouse",
  });

  await expectActiveDestination(surface, "home");
  await expect(navigation).not.toHaveAttribute("data-dragging", "true");
  await page.mouse.up();
  await expectActiveDestination(surface, "home");
});

test("Mouse regression: horizontal drag over Primary content never switches destination", async ({
  page,
}) => {
  const { navigation, surface } = await openDevelopmentSurface(page);
  const homePanel = surface.locator('[data-product-panel="home"]');
  const panelCenter = await locatorCenter(homePanel);

  await page.mouse.move(panelCenter.x, panelCenter.y);
  await page.mouse.down();
  await page.mouse.move(panelCenter.x + 120, panelCenter.y, { steps: 5 });
  await page.mouse.up();

  await expectActiveDestination(surface, "home");
  await expect(navigation).not.toHaveAttribute("data-dragging", "true");
  await expect(
    surface.locator('[data-primary-destination="home"]'),
  ).toHaveAttribute("data-active", "true");
});
