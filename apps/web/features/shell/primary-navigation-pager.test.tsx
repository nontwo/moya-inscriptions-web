import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  PrimaryNavigationPager,
  resolveAdjacentPrimaryDestination,
} from "./primary-navigation-pager";

import type { PresentationPlatform } from "./device-platform";
import type {
  PrimaryNavigationPagerProps,
  PrimaryDestinationDirection,
} from "./primary-navigation-pager";
import type { PrimaryDestination } from "./primary-shell";

const destinations = [
  ["home", "首页"],
  ["inscriptions", "碑刻"],
  ["calligraphy", "书帖"],
] as const satisfies readonly (readonly [PrimaryDestination, string])[];

const renderCoordination = (
  activeDestination: PrimaryDestination = "home",
  platform: PresentationPlatform = "pc",
  showDevelopmentPagerControls = false,
) =>
  renderToStaticMarkup(
    <PrimaryNavigationPager
      activeDestination={activeDestination}
      platform={platform}
      onDestinationChange={vi.fn()}
      home={<p>home content</p>}
      inscriptions={<p>inscriptions content</p>}
      calligraphy={<p>calligraphy content</p>}
      showDevelopmentPagerControls={showDevelopmentPagerControls}
    />,
  );

describe("PrimaryNavigationPager", () => {
  it("renders the product navigation without QA pager controls by default", () => {
    const markup = renderCoordination();

    expect(markup.match(/data-primary-navigation-destination=/g)).toHaveLength(
      3,
    );
    for (const [destination, label] of destinations) {
      expect(markup).toContain(
        `data-primary-navigation-destination="${destination}"`,
      );
      expect(markup).toContain(`aria-label="${label}"`);
    }
    expect(markup).not.toContain('aria-label="主要内容分页"');
    expect(markup).not.toContain("data-development-primary-pager");
  });

  it("can expose the existing bounded pager only for a Development harness", () => {
    const markup = renderCoordination("inscriptions", "tablet", true);

    expect(markup).toContain('aria-label="主要内容分页"');
    expect(markup).toContain("data-development-primary-pager");
    expect(markup).toContain(">上一页</button>");
    expect(markup).toContain(">下一页</button>");
  });

  it.each(destinations)(
    "selects only the active %s destination",
    (activeDestination) => {
      const markup = renderCoordination(activeDestination);

      expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
      for (const [destination] of destinations) {
        expect(markup).toMatch(
          new RegExp(
            `data-primary-navigation-destination="${destination}" data-selected="${
              destination === activeDestination ? "true" : "false"
            }"`,
          ),
        );
      }
    },
  );

  it("uses one controlled active destination for navigation, pager, and PrimaryShell", () => {
    const markup = renderCoordination("inscriptions", "tablet", true);

    expect(
      markup.match(/data-active-destination="inscriptions"/g),
    ).toHaveLength(2);
    expect(markup).toContain("data-primary-shell");
    expect(markup).toContain('data-platform="tablet"');
    expect(markup).toContain(
      'data-primary-pager-action="previous" data-target-destination="home"',
    );
    expect(markup).toContain(
      'data-primary-pager-action="next" data-target-destination="calligraphy"',
    );
  });

  it.each([
    ["home", "previous", null],
    ["home", "next", "inscriptions"],
    ["inscriptions", "previous", "home"],
    ["inscriptions", "next", "calligraphy"],
    ["calligraphy", "previous", "inscriptions"],
    ["calligraphy", "next", null],
  ] as const satisfies readonly (readonly [
    PrimaryDestination,
    PrimaryDestinationDirection,
    PrimaryDestination | null,
  ])[])(
    "resolves the pager-only sequence from %s %s to %s without wrapping",
    (activeDestination, direction, expected) => {
      expect(
        resolveAdjacentPrimaryDestination(activeDestination, direction),
      ).toBe(expected);
    },
  );

  it("disables only the unavailable edge action", () => {
    const homeMarkup = renderCoordination("home", "pc", true);
    const calligraphyMarkup = renderCoordination("calligraphy", "pc", true);

    expect(homeMarkup).toContain(
      'data-primary-pager-action="previous" disabled=""',
    );
    expect(homeMarkup).toContain(
      'data-primary-pager-action="next" data-target-destination="inscriptions"',
    );
    expect(calligraphyMarkup).toContain(
      'data-primary-pager-action="previous" data-target-destination="inscriptions"',
    );
    expect(calligraphyMarkup).toContain(
      'data-primary-pager-action="next" disabled=""',
    );
  });

  it("accepts only the shared semantic, platform, callback, and structural inputs", () => {
    expectTypeOf<
      PrimaryNavigationPagerProps["activeDestination"]
    >().toEqualTypeOf<PrimaryDestination>();
    expectTypeOf<
      PrimaryNavigationPagerProps["platform"]
    >().toEqualTypeOf<PresentationPlatform>();
    expectTypeOf<keyof PrimaryNavigationPagerProps>().toEqualTypeOf<
      | "activeDestination"
      | "platform"
      | "onDestinationChange"
      | "home"
      | "inscriptions"
      | "calligraphy"
      | "navigationAction"
      | "navigationHidden"
      | "navigationMinimized"
      | "onNavigationExpand"
      | "showDevelopmentPagerControls"
    >();
  });

  it("hides the unchanged navigation while an owned overlay is active", () => {
    const markup = renderToStaticMarkup(
      <PrimaryNavigationPager
        activeDestination="home"
        calligraphy={<p>calligraphy content</p>}
        home={<p>home content</p>}
        inscriptions={<p>inscriptions content</p>}
        navigationHidden
        onDestinationChange={vi.fn()}
        platform="phone"
      />,
    );

    expect(markup).toContain(
      'aria-hidden="true" data-primary-navigation-layer="" hidden=""',
    );
    expect(markup).toContain("data-primary-navigation");
  });

  it("renders native buttons without prototype browser globals", () => {
    expect("window" in globalThis).toBe(false);
    expect("document" in globalThis).toBe(false);
    expect(() => renderCoordination()).not.toThrow();
    expect(renderCoordination().match(/<button/g)).toHaveLength(3);
  });
});
