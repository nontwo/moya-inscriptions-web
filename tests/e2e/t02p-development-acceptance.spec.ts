import { expect, test } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";

const destinationAcceptance = {
  calligraphy: {
    label: "书帖",
    panel: "Calligraphy acceptance panel",
  },
  home: { label: "首页", panel: "Home acceptance panel" },
  inscriptions: {
    label: "碑刻",
    panel: "Inscription acceptance panel",
  },
} as const;

type AcceptanceDestination = keyof typeof destinationAcceptance;

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
    navigation.locator("[data-primary-navigation-bubble]"),
  ).toBeVisible();
  await expect(
    navigation.getByRole("button", {
      exact: true,
      name: destinationAcceptance[destination].label,
    }),
  ).toHaveAttribute("aria-current", "page");

  const activeSection = shell.locator(
    `[data-primary-destination="${destination}"]`,
  );
  await expect(activeSection).toHaveAttribute("data-active", "true");
  await expect(
    activeSection.locator(`[data-qa-panel="${destination}"]`),
  ).toHaveText(destinationAcceptance[destination].panel);
};

const pagerAction = (surface: Locator, action: "previous" | "next") =>
  surface.locator(`[data-primary-pager-action="${action}"]`);

const locatorCenter = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Expected a visible locator bounding box");

  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
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
}) => {
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
  await expectActiveDestination(surface, "home");
  await expect(pagerAction(surface, "previous")).toBeDisabled();

  await navigation.getByRole("button", { name: "碑刻", exact: true }).click();
  await expectActiveDestination(surface, "inscriptions");

  await navigation.getByRole("button", { name: "书帖", exact: true }).click();
  await expectActiveDestination(surface, "calligraphy");
  await expect(pagerAction(surface, "next")).toBeDisabled();

  await pagerAction(surface, "previous").click();
  await expectActiveDestination(surface, "inscriptions");
  await pagerAction(surface, "previous").click();
  await expectActiveDestination(surface, "home");
  await expect(pagerAction(surface, "previous")).toBeDisabled();

  await pagerAction(surface, "next").click();
  await expectActiveDestination(surface, "inscriptions");

  const platformSelector = surface.getByRole("combobox", {
    name: "QA presentation platform",
  });
  await expect(platformSelector).toHaveValue("pc");
  await platformSelector.selectOption("phone");
  await expect(surface).toHaveAttribute("data-platform", "phone");
  await expect(surface.locator("[data-primary-shell]")).toHaveAttribute(
    "data-platform",
    "phone",
  );
  await expect(navigation).toHaveAttribute("data-platform", "phone");
  await expect(navigation).toBeVisible();
  await expectActiveDestination(surface, "inscriptions");

  await platformSelector.selectOption("tablet");
  await expect(surface).toHaveAttribute("data-platform", "tablet");
  await expect(surface.locator("[data-primary-shell]")).toHaveAttribute(
    "data-platform",
    "tablet",
  );
  await expect(navigation).toHaveAttribute("data-platform", "tablet");
  await expect(navigation).toBeVisible();
  await expectActiveDestination(surface, "inscriptions");
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

  await page.mouse.move(homeCenter.x, homeCenter.y);
  await page.mouse.down();
  await page.mouse.move(inscriptionsCenter.x, inscriptionsCenter.y, {
    steps: 5,
  });

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
  await expect(navigation).not.toHaveAttribute("data-dragging", "true");
  await expect(navigation).not.toHaveAttribute(
    "data-bubble-preview-index",
    /.+/,
  );
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
