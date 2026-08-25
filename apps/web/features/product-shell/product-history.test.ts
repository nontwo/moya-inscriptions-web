import { describe, expect, it } from "vitest";

import {
  PRODUCT_SHELL_HISTORY_VERSION,
  isPrimaryDestination,
  parseProductHistoryState,
  primaryHistoryState,
  settingsHistoryState,
  topicHistoryState,
  topicLocation,
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

  it("preserves a bounded primary scroll checkpoint for an overlay source entry", () => {
    expect(parseProductHistoryState(primaryHistoryState("home", 147))).toEqual(
      primaryHistoryState("home", 147),
    );
    expect(primaryHistoryState("home", -10).scrollTop).toBe(0);
  });

  it("parses the bounded Topic layer and clamps its source scroll", () => {
    expect(
      parseProductHistoryState(topicHistoryState("topic-one", 147)),
    ).toEqual(topicHistoryState("topic-one", 147));
    expect(topicHistoryState("topic-one", -10).sourceScrollTop).toBe(0);
    expect(
      topicLocation(
        { pathname: "/dev/t02p", search: "?cb=exact-head" } as Location,
        "专题 一",
      ),
    ).toBe("/dev/t02p?cb=exact-head#topic-%E4%B8%93%E9%A2%98%20%E4%B8%80");
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
      destination: "home",
      kind: "primary",
      scrollTop: -1,
      version: PRODUCT_SHELL_HISTORY_VERSION,
    },
    {
      kind: "settings",
      sourceDestination: "viewer",
      version: PRODUCT_SHELL_HISTORY_VERSION,
    },
    {
      kind: "topic",
      sourceDestination: "home",
      sourceHomeFeed: "topics",
      sourceScrollTop: -1,
      topicId: "topic-invalid-scroll",
      version: PRODUCT_SHELL_HISTORY_VERSION,
    },
    {
      kind: "topic",
      sourceDestination: "home",
      sourceHomeFeed: "topics",
      sourceScrollTop: 0,
      topicId: "",
      version: PRODUCT_SHELL_HISTORY_VERSION,
    },
    { destination: "home", kind: "primary", version: 999 },
  ])("rejects invalid or future state %#", (value) => {
    expect(parseProductHistoryState(value)).toBeNull();
  });
});
