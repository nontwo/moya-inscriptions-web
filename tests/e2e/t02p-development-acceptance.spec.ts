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

const presentationPlatformLabels = {
  pc: "PC",
  phone: "Phone",
  tablet: "Tablet",
} as const satisfies Record<AcceptancePlatform, string>;

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

const feedLayoutSelector = (surface: Locator) =>
  surface.getByRole("combobox", { name: "QA phone/tablet feed layout" });

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
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
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
  await expect(surface).toHaveAttribute("data-platform", platform);
  await expect(surface.locator("[data-primary-shell]")).toHaveAttribute(
    "data-platform",
    platform,
  );
  await expect(surface.locator("[data-primary-navigation]")).toHaveAttribute(
    "data-platform",
    platform,
  );
  await expect(surface.locator("[data-qa-effective-platform]")).toHaveText(
    presentationPlatformLabels[platform],
  );
};

const expectActiveDestination = async (
  surface: Locator,
  destination: AcceptanceDestination,
) => {
  const coordination = surface.locator("[data-primary-navigation-pager]");
  const shell = surface.locator("[data-primary-shell]");
  const navigation = surface.getByRole("navigation", { name: "主要内容" });

  await expect(surface).toHaveAttribute("data-active-destination", destination);
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
      const panel = section.locator(`[data-qa-panel="${candidate}"]`);
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
  const response = await page.goto("/dev/t02p");
  expect(response?.status()).toBe(200);

  const surface = page.locator("[data-t02p-development-acceptance]");
  await expect(surface).toBeVisible();

  return {
    navigation: surface.getByRole("navigation", { name: "主要内容" }),
    surface,
  };
};

const confirmMouseNavigationReady = async (
  surface: Locator,
  navigation: Locator,
) => {
  await expect
    .poll(async () => {
      await navigation
        .getByRole("button", { exact: true, name: "碑刻" })
        .click();
      return surface.getAttribute("data-active-destination");
    })
    .toBe("inscriptions");
  await expectActiveDestination(surface, "inscriptions");
  await expect
    .poll(async () => {
      await navigation
        .getByRole("button", { exact: true, name: "首页" })
        .click();
      return surface.getAttribute("data-active-destination");
    })
    .toBe("home");
  await expectActiveDestination(surface, "home");
};

test("Development acceptance surface coordinates semantic navigation, pager, shell, and QA platform", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/dev/t02p");
  expect(response?.status()).toBe(200);

  const surface = page.locator("[data-t02p-development-acceptance]");
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
      return surface.getAttribute("data-active-destination");
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
  const selector = feedLayoutSelector(surface);
  const feed = activeCatalogPresentation(surface).locator("[data-feed-layout]");
  const fullCard = feed.locator('[data-catalog-feed-span="full"]').first();
  const normalCard = feed
    .locator("[data-catalog-card]:not([data-catalog-feed-span])")
    .first();
  await expect(selector).toHaveValue("double");
  await expect(feed.locator('[data-catalog-feed-span="full"]')).toHaveCount(2);

  if (testInfo.project.name === "desktop-chromium") {
    await expect(selector).toBeDisabled();
    const columnCount = await feed.evaluate(
      (node) =>
        getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
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

  await expect(selector).toBeEnabled();
  await selector.selectOption("single");
  await expect(surface).toHaveAttribute("data-feed-layout", "single");
  await expect
    .poll(() =>
      feed.evaluate(
        (node) =>
          getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean)
            .length,
      ),
    )
    .toBe(1);
  await expectActiveDestination(surface, "home");
  await expectFeedCardGeometry({
    columnCount: 1,
    feed,
    fullCard,
    fullSpan: false,
    normalCard,
  });

  await selector.selectOption("double");
  await expect(surface).toHaveAttribute("data-feed-layout", "double");
  await expect
    .poll(() =>
      feed.evaluate(
        (node) =>
          getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean)
            .length,
      ),
    )
    .toBe(2);
  await expectActiveDestination(surface, "home");
  await expectFeedCardGeometry({
    columnCount: 2,
    feed,
    fullCard,
    fullSpan: true,
    normalCard,
  });
  const fullSpanIndex = await feed
    .locator("[data-catalog-card]")
    .evaluateAll((cards) =>
      cards.findIndex(
        (card) => card.getAttribute("data-catalog-feed-span") === "full",
      ),
    );
  const cardsAfterSpan = feed.locator("[data-catalog-card]");
  const [firstAfterSpan, secondAfterSpan] = await Promise.all([
    requireBoundingBox(cardsAfterSpan.nth(fullSpanIndex + 1)),
    requireBoundingBox(cardsAfterSpan.nth(fullSpanIndex + 2)),
  ]);
  expect(Math.abs(firstAfterSpan.y - secondAfterSpan.y)).toBeLessThan(2);
  expect(Math.abs(firstAfterSpan.x - secondAfterSpan.x)).toBeGreaterThan(
    firstAfterSpan.width / 2,
  );
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
  await expect(feedLayoutSelector(surface)).toHaveValue("double");

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

  await feedLayoutSelector(surface).selectOption("single");
  await expect(surface).toHaveAttribute("data-feed-layout", "single");
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
  const reloadedSurface = page.locator("[data-t02p-development-acceptance]");
  await expect(reloadedSurface).toBeVisible();
  await expect(platformSelector(reloadedSurface)).toHaveValue("auto");
  await expectPresentationPlatform(reloadedSurface, "tablet");
});

test("Touchscreen tap commits each primary destination on touch WebKit", async ({
  page,
}, testInfo) => {
  test.skip(
    !["mobile-webkit", "tablet-webkit"].includes(testInfo.project.name),
    "Touchscreen evidence runs only in configured touch contexts.",
  );

  const { navigation, surface } = await openDevelopmentSurface(page);

  for (const destination of ["inscriptions", "calligraphy", "home"] as const) {
    const center = await locatorCenter(
      navigation.getByRole("button", {
        exact: true,
        name: destinationAcceptance[destination].label,
      }),
    );
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

  const { navigation, surface } = await openDevelopmentSurface(page);

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
});

test("Mouse regression: horizontal drag over Primary content never switches destination", async ({
  page,
}) => {
  const { navigation, surface } = await openDevelopmentSurface(page);
  const homePanel = surface.locator('[data-qa-panel="home"]');
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

const detailScenarioKeys = [
  "single-portrait",
  "single-landscape",
  "single-ultrawide",
  "inscription-complete",
  "calligraphy-mixed",
  "tablet-ultrawide-grid",
  "no-media",
  "long-partial",
] as const;

test("Detail QA surface exposes exactly the approved scenarios and truthful direct states", async ({
  page,
}) => {
  const response = await page.goto("/dev/t02p?detail=single-portrait");
  expect(response?.status()).toBe(200);
  const surface = page.locator("[data-t02p-development-acceptance]");
  const selector = surface.locator("[data-qa-detail-scenario-selector]");

  await expect(selector.locator("option")).toHaveCount(8);
  await expect(selector.locator("option")).toHaveText(
    detailScenarioKeys.map(
      (key) =>
        ({
          "calligraphy-mixed": "Mixed calligraphy",
          "inscription-complete": "Complete inscription",
          "long-partial": "Long partial content",
          "no-media": "No media",
          "single-landscape": "Single landscape",
          "single-portrait": "Single portrait",
          "single-ultrawide": "Single ultra-wide",
          "tablet-ultrawide-grid": "Tablet ultra-wide grid",
        })[key],
    ),
  );
  await expect(surface).toHaveAttribute("data-detail-open", "true");
  await expect(surface).toHaveAttribute(
    "data-detail-qa-scenario",
    "single-portrait",
  );
  await expect(surface.locator("[data-primary-shell]")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(surface.locator("[data-t02p-qa-controls]")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  expect(
    await surface
      .locator("[data-t02p-qa-controls]")
      .evaluate((element) => (element as HTMLElement).inert),
  ).toBe(true);
  await expect(surface.locator("[data-primary-navigation]")).toHaveAttribute(
    "hidden",
    "",
  );
  await expect(surface.locator("[data-primary-navigation]")).toHaveCount(1);
  await expect(surface.locator("[data-detail-state=loaded]")).toBeVisible();

  await page.goto("/dev/t02p?detail=no-media");
  await expect(
    page.locator('[data-detail-media-state="missing"]'),
  ).toBeVisible();

  await page.goto("/dev/t02p?detail=long-partial");
  await expect(
    page.locator('[data-detail-section="introduction"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-detail-section="transcription"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-detail-section="scholarly-research"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-detail-section="historical-context"]'),
  ).toHaveCount(0);

  await page.goto("/dev/t02p?detail=not-an-approved-scenario");
  await expect(page.locator('[data-detail-state="not-found"]')).toBeVisible();
  await expect(page.locator("[data-detail-title]")).toHaveCount(0);
});

test("Browse to Detail preserves the mounted shell, history, scroll, and focus", async ({
  page,
}) => {
  const { navigation, surface } = await openDevelopmentSurface(page);
  const shell = surface.locator("[data-primary-shell]");
  const opener = surface
    .locator('[data-qa-panel="home"] [data-open-catalog-detail]')
    .first();
  await opener.scrollIntoViewIfNeeded();
  const initialScroll = await page.evaluate(() => window.scrollY);

  await opener.click();
  await expect(surface).toHaveAttribute(
    "data-detail-qa-scenario",
    "single-portrait",
  );
  await expect(shell.locator("[data-primary-destination]")).toHaveCount(3);
  await expect(shell).toHaveAttribute("aria-hidden", "true");
  await expect(navigation).toBeHidden();
  await expect(page).toHaveURL(/\?detail=single-portrait$/);
  await expect(
    surface.locator('[data-detail-experience] button[aria-label="返回"]'),
  ).toBeFocused();

  await page.goBack();
  await expect(surface).toHaveAttribute("data-detail-open", "false");
  await expect(shell).not.toHaveAttribute("aria-hidden", "true");
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScroll);
});

test("Browse cards use one full-area target, preserve keyboard activation, and ignore vertical scroll release", async ({
  page,
}) => {
  const { surface } = await openDevelopmentSurface(page);
  const card = surface
    .locator('[data-qa-panel="home"] [data-catalog-card]')
    .first();
  const action = card.locator("[data-open-catalog-detail]");
  const [cardBox, actionBox] = await Promise.all([
    requireBoundingBox(card),
    requireBoundingBox(action),
  ]);
  expect(Math.abs(cardBox.x - actionBox.x)).toBeLessThan(2);
  expect(Math.abs(cardBox.y - actionBox.y)).toBeLessThan(2);
  expect(Math.abs(cardBox.width - actionBox.width)).toBeLessThan(2);
  expect(Math.abs(cardBox.height - actionBox.height)).toBeLessThan(2);

  await action.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const init = {
      bubbles: true,
      button: 0,
      isPrimary: true,
      pointerId: 901,
      pointerType: "touch",
    };
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        ...init,
        clientX: box.right - 8,
        clientY: box.top + 12,
      }),
    );
    element.dispatchEvent(
      new PointerEvent("pointermove", {
        ...init,
        buttons: 1,
        clientX: box.right - 8,
        clientY: box.top + 68,
      }),
    );
    element.dispatchEvent(
      new PointerEvent("pointerup", {
        ...init,
        clientX: box.right - 8,
        clientY: box.top + 68,
      }),
    );
    (element as HTMLButtonElement).click();
  });
  await expect(surface).toHaveAttribute("data-detail-open", "false");

  await action.click({
    position: { x: actionBox.width - 8, y: actionBox.height - 8 },
  });
  await expect(surface).toHaveAttribute("data-detail-open", "true");
  await page.goBack();
  await expect(action).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(surface).toHaveAttribute("data-detail-open", "true");
});

test("Primary navigation keeps one hydrated DOM instance and stable inline marks across destination changes", async ({
  page,
}) => {
  const failedResources: string[] = [];
  page.on("response", (response) => {
    if (
      !response.ok() &&
      /(?:assets\/icons|assets\/labels)/.test(response.url())
    ) {
      failedResources.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      const runtime = window as Window & {
        __t02pPlatformTrace?: string[];
      };
      const surface = document.querySelector(
        "[data-t02p-development-acceptance]",
      );
      runtime.__t02pPlatformTrace = [
        surface?.getAttribute("data-platform") ?? "missing",
      ];
      if (surface === null) return;
      new MutationObserver(() => {
        runtime.__t02pPlatformTrace?.push(
          surface.getAttribute("data-platform") ?? "missing",
        );
      }).observe(surface, { attributeFilter: ["data-platform"] });
    });
  });

  const { navigation, surface } = await openDevelopmentSurface(page);
  await navigation.evaluate((element) => {
    (element as HTMLElement).dataset.testStableIdentity = "retained";
  });
  for (const destination of ["碑刻", "书帖", "首页"] as const) {
    await navigation
      .getByRole("button", { exact: true, name: destination })
      .click();
    await expect(navigation).toHaveAttribute(
      "data-test-stable-identity",
      "retained",
    );
  }

  const opener = surface
    .locator('[data-qa-panel="home"] [data-open-catalog-detail]')
    .first();
  await opener.click();
  await expect(surface.locator("[data-primary-navigation]")).toHaveAttribute(
    "hidden",
    "",
  );
  await page.goBack();
  await expect(navigation).toHaveAttribute(
    "data-test-stable-identity",
    "retained",
  );
  await expect(
    navigation.locator("[data-primary-navigation-destination]").first(),
  ).toHaveCSS("transition-duration", "0s");
  await expect(navigation.locator("svg[data-icon]")).toHaveCount(3);
  await expect(navigation.locator("[data-label]")).toHaveCount(3);
  expect(
    await navigation
      .locator("svg[data-icon], [data-label]")
      .evaluateAll((marks) =>
        marks.every((mark) => {
          const style = getComputedStyle(mark);
          return (
            style.maskImage === "none" &&
            style.visibility === "visible" &&
            style.opacity === "1"
          );
        }),
      ),
  ).toBe(true);

  await expect.poll(() => failedResources).toEqual([]);
  const platformTrace = await page.evaluate(
    () =>
      (window as Window & { __t02pPlatformTrace?: string[] })
        .__t02pPlatformTrace ?? [],
  );
  expect(platformTrace).toEqual([await surface.getAttribute("data-platform")]);
});

test("Carousel and Viewer support dots, swipe, keyboard, zoom, pan, close, and direct image URLs", async ({
  page,
}) => {
  await page.goto("/dev/t02p?detail=calligraphy-mixed");
  const carousel = page.locator("[data-detail-media-carousel]");
  const stage = carousel.locator("[data-detail-main-stage]");
  const counter = carousel.locator("[data-detail-media-index]");
  const dots = carousel.locator("[data-detail-media-dot]");
  await expect(counter).toHaveText("第 1 张，共 3 张");
  await expect(dots).toHaveCount(3);
  await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(page.locator("[data-detail-thumbnail-grid]")).toHaveCount(0);
  const platform = await page
    .locator("[data-t02p-development-acceptance]")
    .getAttribute("data-platform");
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const edgeControls = carousel.locator(
    "[data-detail-media-previous], [data-detail-media-next]",
  );
  if (platform === "pc" && viewportWidth >= 1100) {
    await expect(edgeControls.first()).toBeVisible();
  } else {
    await expect(edgeControls.first()).toBeHidden();
  }
  await dots.nth(1).click();
  await expect(counter).toHaveText("第 2 张，共 3 张");
  await expect(dots.nth(1)).toHaveAttribute("aria-current", "true");
  await dots.first().click();
  await expect(counter).toHaveText("第 1 张，共 3 张");

  const box = await requireBoundingBox(stage);
  await stage.dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    clientX: box.x + box.width * 0.8,
    clientY: box.y + box.height / 2,
    isPrimary: true,
    pointerId: 401,
    pointerType: "touch",
  });
  await stage.dispatchEvent("pointermove", {
    button: 0,
    buttons: 1,
    clientX: box.x + box.width * 0.45,
    clientY: box.y + box.height / 2,
    isPrimary: true,
    pointerId: 401,
    pointerType: "touch",
  });
  await expect(stage).toHaveAttribute("data-dragging", "true");
  expect(
    await carousel
      .locator("[data-detail-media-track]")
      .evaluate((track) => getComputedStyle(track).transform),
  ).not.toBe("none");
  await stage.dispatchEvent("pointerup", {
    button: 0,
    buttons: 0,
    clientX: box.x + box.width * 0.2,
    clientY: box.y + box.height / 2,
    isPrimary: true,
    pointerId: 401,
    pointerType: "touch",
  });
  await expect(counter).toHaveText("第 2 张，共 3 张");

  const mainImage = carousel.locator("[data-detail-main-image]");
  const detailScroller = page.locator("[data-detail-scroll]");
  await detailScroller.evaluate((element) => {
    element.scrollTop = 40;
  });
  await mainImage.click();
  const viewer = page.locator("[data-detail-viewer]");
  const viewerStage = viewer.locator("[data-viewer-scale]");
  await expect(viewer).toBeVisible();
  const savedDetailScroll = await detailScroller.evaluate(
    (element) => element.scrollTop,
  );
  await expect(viewer.locator("[data-detail-viewer-index]")).toHaveText(
    "2 / 3",
  );
  await expect(page).toHaveURL(/image=qa-detail-calligraphy-mixed-media-2/);

  await page.goBack();
  await expect(viewer).toBeHidden();
  await expect(page).toHaveURL(/\?detail=calligraphy-mixed$/);
  await expect(mainImage).toBeFocused();
  await expect
    .poll(() => detailScroller.evaluate((element) => element.scrollTop))
    .toBe(savedDetailScroll);

  await mainImage.click();
  await expect(viewer).toBeVisible();
  await expect(page).toHaveURL(/image=qa-detail-calligraphy-mixed-media-2/);

  await page.keyboard.press("ArrowRight");
  await expect(viewer.locator("[data-detail-viewer-index]")).toHaveText(
    "3 / 3",
  );
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.locator("[data-detail-viewer-index]")).toHaveText(
    "2 / 3",
  );

  const viewerBox = await requireBoundingBox(viewerStage);
  await viewerStage.dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    clientX: viewerBox.x + 260,
    clientY: viewerBox.y + 240,
    isPrimary: true,
    pointerId: 501,
    pointerType: "touch",
  });
  await viewerStage.dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    clientX: viewerBox.x + 360,
    clientY: viewerBox.y + 240,
    isPrimary: false,
    pointerId: 502,
    pointerType: "touch",
  });
  await viewerStage.dispatchEvent("pointermove", {
    button: 0,
    buttons: 1,
    clientX: viewerBox.x + 460,
    clientY: viewerBox.y + 240,
    isPrimary: false,
    pointerId: 502,
    pointerType: "touch",
  });
  await expect(viewerStage).toHaveAttribute("data-viewer-scale", "zoomed");
  await viewerStage.dispatchEvent("pointerup", {
    button: 0,
    buttons: 0,
    clientX: viewerBox.x + 460,
    clientY: viewerBox.y + 240,
    isPrimary: false,
    pointerId: 502,
    pointerType: "touch",
  });
  await viewerStage.dispatchEvent("pointerup", {
    button: 0,
    buttons: 0,
    clientX: viewerBox.x + 260,
    clientY: viewerBox.y + 240,
    isPrimary: true,
    pointerId: 501,
    pointerType: "touch",
  });

  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(page).not.toHaveURL(/image=/);
  await expect(mainImage).toBeFocused();

  await mainImage.click();
  await expect(viewer).toBeVisible();
  await expect(viewerStage).toHaveAttribute("data-viewer-scale", "fit");
  await viewer
    .getByRole("button", { exact: true, name: "关闭图像查看" })
    .click();
  await expect(viewer).toBeHidden();
  await expect(mainImage).toBeFocused();

  await page.goto(
    "/dev/t02p?detail=calligraphy-mixed&image=qa-detail-calligraphy-mixed-media-3",
  );
  await expect(page.locator("[data-detail-viewer]")).toBeVisible();
  await expect(page.locator("[data-detail-viewer-index]")).toHaveText("3 / 3");
});

test("Carousel preserves the accepted settle easing and reduced-motion duration", async ({
  page,
}) => {
  await page.goto("/dev/t02p?detail=calligraphy-mixed");
  const track = page.locator(
    "[data-detail-media-carousel] [data-detail-media-track]",
  );
  await expect(track).toHaveCSS("transition-duration", "0.22s");
  await expect(track).toHaveCSS(
    "transition-timing-function",
    "cubic-bezier(0.22, 1, 0.36, 1)",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(track).toHaveCSS("transition-duration", "0.001s");
});

test("Viewer reports a truthful failure for a broken direct image", async ({
  page,
}) => {
  await page.route("**/qa-visual-square.svg", (route) => route.abort());
  await page.goto(
    "/dev/t02p?detail=calligraphy-mixed&image=qa-detail-calligraphy-mixed-media-3",
  );

  const viewer = page.locator("[data-detail-viewer]");
  await expect(viewer).toBeVisible();
  await expect(
    viewer.locator('[data-detail-viewer-media-state="failed"]'),
  ).toHaveText("图像无法加载");
  await expect(viewer.locator("[data-detail-viewer-image]")).toHaveCount(0);
});

test("Tablet landscape uses a split Detail composition with one carousel and independent reading cards", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "tablet-webkit",
    "The Tablet Detail composition audit runs only in Tablet WebKit.",
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/dev/t02p?detail=tablet-ultrawide-grid");
  const surface = page.locator("[data-t02p-development-acceptance]");
  await expectPresentationPlatform(surface, "tablet");
  const detail = page.locator("[data-detail-composition]");
  await expect(detail).toHaveAttribute(
    "data-detail-composition",
    "tablet-landscape",
  );

  const carousel = page.locator("[data-detail-media-carousel]");
  await expect(carousel).toBeVisible();
  await expect(carousel).toHaveAttribute("data-media-count", "5");
  await expect(carousel.locator("[data-detail-media-dot]")).toHaveCount(5);
  await expect(page.locator("[data-detail-thumbnail-grid]")).toHaveCount(0);
  await expect(page.locator("[data-detail-info-panel]")).toBeVisible();
  await expect(
    page.locator('[data-detail-section]:not([data-detail-section="sources"])'),
  ).toHaveCount(5);
});

test("captures corrected Browse and Detail compositions for the approved device matrix", async ({
  page,
}, testInfo) => {
  const profiles =
    testInfo.project.name === "mobile-webkit"
      ? [
          ["iphone-portrait", 390, 844],
          ["iphone-landscape", 844, 390],
        ]
      : testInfo.project.name === "tablet-webkit"
        ? [
            ["ipad-portrait", 834, 1194],
            ["ipad-landscape", 1194, 834],
          ]
        : [["pc", 1440, 1000]];

  for (const [name, width, height] of profiles) {
    if (typeof width !== "number" || typeof height !== "number") continue;
    await page.setViewportSize({ height, width });
    await page.goto("/dev/t02p");
    await expect(
      page.locator("[data-t02p-development-acceptance]"),
    ).toBeVisible();
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`${name}-browse.png`),
    });
    const ultraWideCard = page
      .locator('[data-catalog-feed-span="full"]')
      .first();
    await ultraWideCard.scrollIntoViewIfNeeded();
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`${name}-ultrawide.png`),
    });

    await page.goto("/dev/t02p?detail=calligraphy-mixed");
    await expect(page.locator("[data-detail-state=loaded]")).toBeVisible();
    await expect(page.locator("[data-detail-media-carousel]")).toBeVisible();
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`${name}-detail.png`),
    });
  }
});
