import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { PrimaryBottomNavigation } from "./primary-bottom-navigation";

import type { ReactElement } from "react";
import type { PresentationPlatform } from "./device-platform";
import type { PrimaryBottomNavigationProps } from "./primary-bottom-navigation";
import type { PrimaryDestination } from "./primary-shell";

const destinations = [
  {
    id: "home",
    icon: "home",
    label: "首页",
    labelMark: "nav-home",
  },
  {
    id: "inscriptions",
    icon: "inscriptions",
    label: "碑刻",
    labelMark: "nav-inscriptions",
  },
  {
    id: "calligraphy",
    icon: "calligraphy",
    label: "书帖",
    labelMark: "nav-calligraphy",
  },
] as const satisfies readonly {
  readonly id: PrimaryDestination;
  readonly icon: string;
  readonly label: string;
  readonly labelMark: string;
}[];

const renderNavigation = (
  activeDestination: PrimaryDestination = "home",
  platform: PresentationPlatform = "pc",
) =>
  renderToStaticMarkup(
    <PrimaryBottomNavigation
      activeDestination={activeDestination}
      platform={platform}
      onDestinationChange={vi.fn()}
    />,
  );

interface NavigationButtonProps {
  readonly "data-primary-navigation-destination"?: PrimaryDestination;
  readonly onClick?: () => void;
}

const navigationButtons = (
  onDestinationChange: (destination: PrimaryDestination) => void,
) => {
  const navigation = PrimaryBottomNavigation({
    activeDestination: "home",
    platform: "phone",
    onDestinationChange,
  });

  return Children.toArray(navigation.props.children).filter(
    (child): child is ReactElement<NavigationButtonProps> =>
      isValidElement<NavigationButtonProps>(child) && child.type === "button",
  );
};

describe("PrimaryBottomNavigation", () => {
  it("renders exactly the current ordered destinations and formal marks", () => {
    const markup = renderNavigation();

    expect(markup.match(/data-primary-navigation-destination=/g)).toHaveLength(
      destinations.length,
    );
    expect(markup).toContain(`data-item-count="${destinations.length}"`);

    let lastIndex = -1;
    for (const { id, icon, label, labelMark } of destinations) {
      const itemIndex = markup.indexOf(
        `data-primary-navigation-destination="${id}"`,
      );
      expect(itemIndex).toBeGreaterThan(lastIndex);
      lastIndex = itemIndex;
      expect(markup).toContain(`aria-label="${label}"`);
      expect(markup).toContain(`data-icon="${icon}"`);
      expect(markup).toContain(`data-label="${labelMark}"`);
    }

    expect(markup).not.toMatch(/upload|上传|profile|个人中心|user/i);
  });

  it.each(destinations)(
    "derives the controlled $id selection and active index",
    ({ id }) => {
      const activeIndex = destinations.findIndex(
        (candidate) => candidate.id === id,
      );
      const markup = renderNavigation(id);

      expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
      expect(markup).toContain(`data-active-index="${activeIndex}"`);
      for (const { id: candidate } of destinations) {
        expect(markup).toContain(
          `data-primary-navigation-destination="${candidate}" data-selected="${
            candidate === id ? "true" : "false"
          }"`,
        );
      }
    },
  );

  it.each(["phone", "tablet", "pc"] as const)(
    "preserves the %s presentation platform identity",
    (platform) => {
      expect(renderNavigation("home", platform)).toContain(
        `data-platform="${platform}"`,
      );
    },
  );

  it.each(destinations)("commits one $id click exactly once", ({ id }) => {
    const onDestinationChange = vi.fn();
    const button = navigationButtons(onDestinationChange).find(
      (candidate) =>
        candidate.props["data-primary-navigation-destination"] === id,
    );

    expect(button).toBeDefined();
    button?.props.onClick?.();
    expect(onDestinationChange).toHaveBeenCalledOnce();
    expect(onDestinationChange).toHaveBeenCalledWith(id);
  });

  it("uses a thin feature-local contract without high-level navigation output", () => {
    const markup = renderNavigation();

    expectTypeOf<keyof PrimaryBottomNavigationProps>().toEqualTypeOf<
      "activeDestination" | "platform" | "onDestinationChange"
    >();
    expect(markup).toContain("yoyi-functional-glass");
    expect(markup).toContain("yoyi-navigation-entry");
    expect(markup).toContain("data-primary-navigation-bubble");
    expect(markup).not.toContain("yoyi-mobile-bottom-navigation");
    expect(markup).not.toContain("yoyi-responsive-navigation");
    expect(markup).not.toContain("yoyi-desktop-navigation");
    expect(markup).not.toContain("data-primary-pager");
  });
});
