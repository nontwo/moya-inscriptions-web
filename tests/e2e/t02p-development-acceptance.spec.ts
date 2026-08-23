import { expect, test } from "@playwright/test";

import type { Locator } from "@playwright/test";

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

test("Development acceptance surface coordinates semantic navigation, pager, shell, and QA platform", async ({
  page,
}) => {
  const response = await page.goto("/dev/t02p");
  expect(response?.status()).toBe(200);

  const surface = page.locator("[data-t02p-development-acceptance]");
  await expect(surface).toBeVisible();
  await expectActiveDestination(surface, "home");
  await expect(pagerAction(surface, "previous")).toBeDisabled();

  const navigation = surface.getByRole("navigation", { name: "主要内容" });
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
  await expectActiveDestination(surface, "inscriptions");

  await platformSelector.selectOption("tablet");
  await expect(surface).toHaveAttribute("data-platform", "tablet");
  await expect(surface.locator("[data-primary-shell]")).toHaveAttribute(
    "data-platform",
    "tablet",
  );
  await expectActiveDestination(surface, "inscriptions");
});
