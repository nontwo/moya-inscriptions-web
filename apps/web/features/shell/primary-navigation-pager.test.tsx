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
) =>
  renderToStaticMarkup(
    <PrimaryNavigationPager
      activeDestination={activeDestination}
      platform={platform}
      onDestinationChange={vi.fn()}
      home={<p>home content</p>}
      inscriptions={<p>inscriptions content</p>}
      calligraphy={<p>calligraphy content</p>}
    />,
  );

describe("PrimaryNavigationPager", () => {
  it("renders exactly the three semantic navigation destinations with their labels", () => {
    const markup = renderCoordination();

    expect(markup.match(/data-primary-navigation-destination=/g)).toHaveLength(
      3,
    );
    for (const [destination, label] of destinations) {
      expect(markup).toContain(
        `data-primary-navigation-destination="${destination}"`,
      );
      expect(markup).toMatch(
        new RegExp(
          `data-primary-navigation-destination="${destination}"[^>]*>${label}</button>`,
        ),
      );
    }
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
    const markup = renderCoordination("inscriptions", "tablet");

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
    "resolves %s %s to %s without wrapping",
    (activeDestination, direction, expected) => {
      expect(
        resolveAdjacentPrimaryDestination(activeDestination, direction),
      ).toBe(expected);
    },
  );

  it("disables only the unavailable edge action", () => {
    const homeMarkup = renderCoordination("home");
    const calligraphyMarkup = renderCoordination("calligraphy");

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
    >();
  });

  it("renders native buttons without prototype browser globals", () => {
    expect("window" in globalThis).toBe(false);
    expect("document" in globalThis).toBe(false);
    expect(() => renderCoordination()).not.toThrow();
    expect(renderCoordination().match(/<button/g)).toHaveLength(5);
  });
});
