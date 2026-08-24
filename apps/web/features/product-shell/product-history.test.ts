import { describe, expect, it } from "vitest";

import {
  PRODUCT_SHELL_HISTORY_VERSION,
  isPrimaryDestination,
  parseProductHistoryState,
  primaryHistoryState,
  settingsHistoryState,
} from "./product-history";

describe("Product Shell history", () => {
  it.each(["home", "inscriptions", "calligraphy"] as const)(
    "accepts the bounded %s primary destination",
    (destination) => {
      expect(isPrimaryDestination(destination)).toBe(true);
      expect(
        parseProductHistoryState(primaryHistoryState(destination)),
      ).toEqual(primaryHistoryState(destination));
    },
  );

  it("parses the explicit Settings layer", () => {
    expect(
      parseProductHistoryState(settingsHistoryState("inscriptions")),
    ).toEqual(settingsHistoryState("inscriptions"));
  });

  it.each([
    null,
    {},
    { kind: "primary", version: PRODUCT_SHELL_HISTORY_VERSION },
    {
      destination: "unknown",
      kind: "primary",
      version: PRODUCT_SHELL_HISTORY_VERSION,
    },
    {
      kind: "settings",
      sourceDestination: "viewer",
      version: PRODUCT_SHELL_HISTORY_VERSION,
    },
    { destination: "home", kind: "primary", version: 999 },
  ])("rejects invalid or future state %#", (value) => {
    expect(parseProductHistoryState(value)).toBeNull();
  });
});
