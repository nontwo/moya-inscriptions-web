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

test("Development real-device log shows compact settled status and starts fresh after clear", async ({
  page,
}) => {
  const response = await page.goto("/dev/t02p?iphone=diagnostic-test-head");
  expect(response?.status()).toBe(200);

  const surface = page.locator("[data-t02p-development-acceptance]");
  const panel = surface.locator("[data-t02p-interaction-log]");
  const compactLog = panel.locator("[data-t02p-interaction-log-entries]");
  const eventCount = panel.locator('[data-interaction-status="eventCount"]');
  const visualTraceCount = panel.locator(
    '[data-interaction-status="visualTraceCount"]',
  );
  const lastSignificantEvent = panel.locator(
    '[data-interaction-status="lastSignificantEvent"]',
  );
  const navigation = surface.getByRole("navigation", { name: "主要内容" });

  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading")).toHaveText(
    "Real-device interaction log",
  );
  await expect(
    panel.locator('[data-interaction-status="hydration"]'),
  ).toHaveText("Hydrated");
  await expect(eventCount).toHaveText("1");
  await expect(visualTraceCount).toHaveText("0");
  await expect(lastSignificantEvent).toHaveText("SESSION HYDRATED");
  await expect(compactLog).toContainText("activeDestination: home");
  await expect(compactLog).not.toContainText("POINTER type=");

  await navigation.getByRole("button", { exact: true, name: "碑刻" }).click();
  await expectActiveDestination(surface, "inscriptions");
  await expect(visualTraceCount).toHaveText("1");
  await expect(lastSignificantEvent).toHaveText(
    "NAV VISUAL TRACE home -> inscriptions complete",
  );
  await expect
    .poll(async () => Number(await eventCount.textContent()))
    .toBeGreaterThan(1);
  await expect(compactLog).not.toContainText("MOUSE type=click");

  await panel.getByRole("button", { name: "Clear log" }).click();
  await expect(eventCount).toHaveText("1");
  await expect(visualTraceCount).toHaveText("0");
  await expect(lastSignificantEvent).toHaveText("SESSION HYDRATED");
  await expect(compactLog).toContainText("activeDestination: inscriptions");
  await expect(panel.getByRole("button", { name: "Copy log" })).toBeVisible();
});

test("Raw event bursts update only the isolated logger after settling", async ({
  page,
}) => {
  const { surface } = await openDevelopmentSurface(page);
  const panel = surface.locator("[data-t02p-interaction-log]");
  const eventCount = panel.locator('[data-interaction-status="eventCount"]');
  const target = surface.locator('[data-qa-panel="home"]');

  await expect(
    panel.locator('[data-interaction-status="hydration"]'),
  ).toHaveText("Hydrated");
  await page.waitForTimeout(400);

  const initialEventCount = Number(await eventCount.textContent());
  const initialSurfaceRenderCount = Number(
    await surface.getAttribute("data-t02p-surface-render-count"),
  );
  const initialLoggerRenderCount = Number(
    await panel.getAttribute("data-t02p-log-render-count"),
  );

  await target.evaluate(async (element) => {
    for (let index = 0; index < 4; index += 1) {
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          buttons: 1,
          isPrimary: true,
          pointerId: index + 1,
          pointerType: "touch",
        }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 15));
      element.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          button: 0,
          buttons: 0,
          isPrimary: true,
          pointerId: index + 1,
          pointerType: "touch",
        }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 15));
      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0 }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 15));
    }
  });

  await expect
    .poll(async () => Number(await eventCount.textContent()))
    .toBe(initialEventCount + 12);
  expect(
    Number(await surface.getAttribute("data-t02p-surface-render-count")),
  ).toBe(initialSurfaceRenderCount);
  expect(
    Number(await panel.getAttribute("data-t02p-log-render-count")) -
      initialLoggerRenderCount,
  ).toBeLessThanOrEqual(2);

  await target.evaluate((element) => {
    for (let index = 0; index < 410; index += 1) {
      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0 }),
      );
    }
  });
  await expect(eventCount).toHaveText("400");
  expect(
    Number(await surface.getAttribute("data-t02p-surface-render-count")),
  ).toBe(initialSurfaceRenderCount);
});

test("Desktop Chromium copies the plain-text real-device report", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Clipboard automation is asserted in its supported Chromium context.",
  );

  const response = await page.goto("/dev/t02p?iphone=clipboard-test-head");
  expect(response?.status()).toBe(200);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });

  const panel = page.locator("[data-t02p-interaction-log]");
  const surface = page.locator("[data-t02p-development-acceptance]");
  const navigation = surface.getByRole("navigation", { name: "主要内容" });
  await expect(
    panel.locator('[data-interaction-status="hydration"]'),
  ).toHaveText("Hydrated");
  await navigation.getByRole("button", { exact: true, name: "碑刻" }).click();
  await expectActiveDestination(surface, "inscriptions");
  const surfaceRenderCountAfterState = await surface.getAttribute(
    "data-t02p-surface-render-count",
  );
  await expect(
    panel.locator('[data-interaction-status="visualTraceCount"]'),
  ).toHaveText("1");
  await expect(
    panel.locator('[data-interaction-status="lastSignificantEvent"]'),
  ).toHaveText("NAV VISUAL TRACE home -> inscriptions complete");
  expect(await surface.getAttribute("data-t02p-surface-render-count")).toBe(
    surfaceRenderCountAfterState,
  );
  await panel.getByRole("button", { name: "Copy log" }).click();
  await expect(panel.locator("[data-copy-log-status]")).toHaveText("Copied");
  await expect(panel.locator("[data-manual-copy-fallback]")).toHaveCount(0);

  const clipboardText = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  expect(clipboardText).toContain("SESSION\n");
  expect(clipboardText).toContain('iphone="clipboard-test-head"');
  expect(clipboardText).toContain("EVENTS\n");
  expect(clipboardText).toContain("POINTER type=pointerdown");
  expect(clipboardText).toContain("POINTER type=pointerup");
  expect(clipboardText).toContain("MOUSE type=click");
  expect(clipboardText).toContain(
    "STATE activeDestination: home -> inscriptions",
  );
  expect(clipboardText).toContain("CURRENT STATE\n");
  expect(clipboardText).toContain("NAV VISUAL TRACE\n");
  expect(clipboardText).toContain("interaction: home -> inscriptions");
  expect(clipboardText).toContain("VISUAL FRAME 0");
  expect(clipboardText).toContain("VISUAL FRAME 1");
  expect(clipboardText).toContain("VISUAL FRAME 2");
  expect(clipboardText).toContain("VISUAL FRAME 3");
  expect(clipboardText).toContain("VISUAL FRAME 5");
  expect(clipboardText).toContain("VISUAL FRAME +300ms");
  expect(clipboardText).toContain("home.nodes buttonNode=");
  expect(clipboardText).toContain("iconWrapNode=");
  expect(clipboardText).toContain("iconNode=");
  expect(clipboardText).toContain("labelNode=");
  expect(clipboardText).toContain("home.icon backgroundColor=");
  expect(clipboardText).toContain("WebkitMaskImage=");
  expect(clipboardText).toContain("home.label backgroundColor=");
  expect(clipboardText).toContain("home.button active=");
  expect(clipboardText).toContain('rect="x:');
  expect(clipboardText).toContain("navigation activeDestination=");
  expect(clipboardText).toContain("WebkitBackdropFilter=");
  expect(clipboardText).toContain("bubble backgroundColor=");
  expect(clipboardText).toContain("transition=");
  expect(clipboardText).toContain("renders acceptanceSurface=");
  expect(clipboardText).toContain("FOCUS ACTIVE activeElementNode=");
  expect(clipboardText).toContain("MUTATION attribute");
  expect(clipboardText).toContain("name=data-selected");
  expect(clipboardText).toContain("DOM replacements: none");
  expect(clipboardText).toContain("childList mutations: none");

  await panel.getByRole("button", { name: "Clear log" }).click();
  await expect(
    panel.locator('[data-interaction-status="eventCount"]'),
  ).toHaveText("1");
  await expect(
    panel.locator('[data-interaction-status="visualTraceCount"]'),
  ).toHaveText("0");
  await panel.getByRole("button", { name: "Copy log" }).click();
  await expect(panel.locator("[data-copy-log-status]")).toHaveText("Copied");

  const clearedClipboardText = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  expect(clearedClipboardText).toContain("SESSION HYDRATED");
  expect(clearedClipboardText).toContain("activeDestination=inscriptions");
  expect(clearedClipboardText).not.toContain(
    "STATE activeDestination: home -> inscriptions",
  );
  expect(clearedClipboardText).toContain("NAV VISUAL TRACE\n(none)");
});

test("Clipboard failure exposes a selectable manual-copy report and Clear removes it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("Clipboard unavailable")),
      },
    });
  });

  const response = await page.goto("/dev/t02p?iphone=manual-copy-test-head");
  expect(response?.status()).toBe(200);

  const panel = page.locator("[data-t02p-interaction-log]");
  const surface = page.locator("[data-t02p-development-acceptance]");
  const navigation = surface.getByRole("navigation", { name: "主要内容" });
  await expect(
    panel.locator('[data-interaction-status="hydration"]'),
  ).toHaveText("Hydrated");
  await navigation.getByRole("button", { exact: true, name: "碑刻" }).click();
  await expectActiveDestination(surface, "inscriptions");
  await expect(
    panel.locator('[data-interaction-status="visualTraceCount"]'),
  ).toHaveText("1");

  await panel.getByRole("button", { name: "Copy log" }).click();
  await expect(panel.locator("[data-copy-log-status]")).toHaveText(
    "Copy failed — manual copy below",
  );

  const textarea = panel.getByRole("textbox", {
    name: "Manual-copy interaction report",
  });
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveAttribute("readonly", "");
  const report = await textarea.inputValue();
  expect(report).toContain("SESSION\n");
  expect(report).toContain('iphone="manual-copy-test-head"');
  expect(report).toContain("EVENTS\n");
  expect(report).toContain("CURRENT STATE\n");
  expect(report).toContain("NAV VISUAL TRACE\n");
  expect(report).toContain("interaction: home -> inscriptions");

  await panel.getByRole("button", { name: "Select all" }).click();
  expect(
    await textarea.evaluate((element) => {
      const textAreaElement = element as HTMLTextAreaElement;
      return {
        active: document.activeElement === textAreaElement,
        selectionEnd: textAreaElement.selectionEnd,
        selectionStart: textAreaElement.selectionStart,
        valueLength: textAreaElement.value.length,
      };
    }),
  ).toEqual({
    active: true,
    selectionEnd: report.length,
    selectionStart: 0,
    valueLength: report.length,
  });

  await panel.getByRole("button", { name: "Clear log" }).click();
  await expect(panel.locator("[data-manual-copy-fallback]")).toHaveCount(0);
  await expect(panel.locator("[data-copy-log-status]")).toHaveText("");
});

test("Formal root excludes the Development real-device interaction log", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("[data-t02p-interaction-log]")).toHaveCount(0);
});

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

  await expect
    .poll(async () => {
      await navigation
        .getByRole("button", { name: "碑刻", exact: true })
        .click();
      return surface.getAttribute("data-active-destination");
    })
    .toBe("inscriptions");
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

  await trackPointerCaptureCalls(homeButton);

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
