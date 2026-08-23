import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";

import { PrimaryShell } from "./primary-shell";

import type { PresentationPlatform } from "./device-platform";
import type { PrimaryDestination, PrimaryShellProps } from "./primary-shell";

const destinations = [
  "home",
  "inscriptions",
  "calligraphy",
] as const satisfies readonly PrimaryDestination[];

const renderShell = (
  activeDestination: PrimaryDestination = "home",
  platform: PresentationPlatform = "pc",
) =>
  renderToStaticMarkup(
    <PrimaryShell
      activeDestination={activeDestination}
      platform={platform}
      home={<p>home content</p>}
      inscriptions={<p>inscriptions content</p>}
      calligraphy={<p>calligraphy content</p>}
    />,
  );

describe("PrimaryShell", () => {
  it("represents exactly the three semantic destinations with distinguishable mounted content", () => {
    const markup = renderShell();

    expect(markup.match(/data-primary-destination=/g)).toHaveLength(3);
    for (const destination of destinations) {
      expect(markup).toContain(`data-primary-destination="${destination}"`);
      expect(markup).toContain(`${destination} content`);
    }
  });

  it.each(destinations)(
    "expresses %s as the active destination independently of presentation order",
    (activeDestination) => {
      const markup = renderShell(activeDestination);

      expect(markup).toContain(
        `data-active-destination="${activeDestination}"`,
      );
      for (const destination of destinations) {
        expect(markup).toMatch(
          new RegExp(
            `data-primary-destination="${destination}" data-active="${
              destination === activeDestination ? "true" : "false"
            }"`,
          ),
        );
      }
    },
  );

  it.each([
    "phone",
    "tablet",
    "pc",
  ] as const satisfies readonly PresentationPlatform[])(
    "expresses the provided %s platform without resolving it",
    (platform) => {
      expect(renderShell("home", platform)).toContain(
        `data-platform="${platform}"`,
      );
    },
  );

  it("accepts only structural inputs and no Catalog source", () => {
    expectTypeOf<keyof PrimaryShellProps>().toEqualTypeOf<
      "activeDestination" | "platform" | "home" | "inscriptions" | "calligraphy"
    >();
  });

  it("renders without prototype browser globals", () => {
    expect("window" in globalThis).toBe(false);
    expect("document" in globalThis).toBe(false);
    expect(() => renderShell()).not.toThrow();
  });
});
