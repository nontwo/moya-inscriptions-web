import { describe, expect, it } from "vitest";

import {
  PRODUCT_SHELL_HISTORY_VERSION,
  detailHistoryState,
  detailLocation,
  directCatalogIdFromLocation,
  directMediaIdFromLocation,
  isPrimaryDestination,
  mergeProductHistoryState,
  parseProductHistoryState,
  primaryHistoryState,
  settingsHistoryState,
  topicHistoryState,
  topicLocation,
  viewerHistoryState,
  viewerLocation,
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

  it("parses the bounded Detail layer and preserves source/detail scroll", () => {
    const state = detailHistoryState("catalog-one", "inscriptions", 147, 63);
    expect(parseProductHistoryState(state)).toEqual(state);
    expect(detailHistoryState("catalog-one", "home", -1, -2)).toMatchObject({
      detailScrollTop: 0,
      sourceScrollTop: 0,
    });
    expect(
      detailLocation(
        {
          pathname: "/dev/t02p",
          search: "?cb=exact-head&catalogId=old",
        } as Location,
        "catalog one",
      ),
    ).toBe("/dev/t02p?cb=exact-head&catalogId=catalog+one#detail");
  });

  it("reads only a bounded direct Development CatalogId", () => {
    expect(
      directCatalogIdFromLocation({ search: "?catalogId=catalog-one" }),
    ).toBe("catalog-one");
    expect(
      directCatalogIdFromLocation({ search: "?catalogId=invalid+id" }),
    ).toBeNull();
    expect(directCatalogIdFromLocation({ search: "" })).toBeNull();
  });

  it("parses the Viewer layer and keeps media navigation on one URL layer", () => {
    const state = viewerHistoryState(
      "catalog-one",
      "media-two",
      "inscriptions",
      147,
      63,
    );
    expect(parseProductHistoryState(state)).toEqual(state);
    expect(
      viewerLocation(
        {
          pathname: "/dev/t02p",
          search: "?cb=exact-head&catalogId=old&image=old-media",
        } as Location,
        "catalog-one",
        "media-two",
      ),
    ).toBe(
      "/dev/t02p?cb=exact-head&catalogId=catalog-one&image=media-two#viewer",
    );
    expect(
      detailLocation(
        {
          pathname: "/dev/t02p",
          search: "?catalogId=catalog-one&image=media-two",
        } as Location,
        "catalog-one",
      ),
    ).toBe("/dev/t02p?catalogId=catalog-one#detail");
    expect(directMediaIdFromLocation({ search: "?image=media-two" })).toBe(
      "media-two",
    );
    expect(
      directMediaIdFromLocation({ search: "?image=invalid+media" }),
    ).toBeNull();
  });

  it("preserves router history fields without retaining stale Product fields", () => {
    const merged = mergeProductHistoryState(
      {
        __NA: true,
        __PRIVATE_NEXTJS_INTERNALS_TREE: ["existing"],
        destination: "inscriptions",
        kind: "primary",
        scrollTop: 44,
        version: PRODUCT_SHELL_HISTORY_VERSION,
      },
      topicHistoryState("topic-one", 147),
    );
    expect(merged).toMatchObject({
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: ["existing"],
      ...topicHistoryState("topic-one", 147),
    });
    expect(merged).not.toHaveProperty("destination");
    expect(merged).not.toHaveProperty("scrollTop");
    expect(parseProductHistoryState(merged)).toEqual(
      topicHistoryState("topic-one", 147),
    );
  });

  it("preserves a bounded primary scroll checkpoint for an overlay source entry", () => {
    expect(
      parseProductHistoryState(primaryHistoryState("home", 147, "topic-one")),
    ).toEqual(primaryHistoryState("home", 147, "topic-one"));
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
      focusTopicId: "",
      kind: "primary",
      version: PRODUCT_SHELL_HISTORY_VERSION,
    },
    {
      destination: "inscriptions",
      focusTopicId: "topic-one",
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
      catalogId: "catalog-one",
      detailScrollTop: -1,
      kind: "detail",
      sourceDestination: "home",
      sourceScrollTop: 0,
      version: PRODUCT_SHELL_HISTORY_VERSION,
    },
    {
      catalogId: "",
      detailScrollTop: 0,
      kind: "detail",
      sourceDestination: "home",
      sourceScrollTop: 0,
      version: PRODUCT_SHELL_HISTORY_VERSION,
    },
    {
      catalogId: "catalog-one",
      detailScrollTop: 0,
      kind: "viewer",
      mediaId: "",
      sourceDestination: "home",
      sourceScrollTop: 0,
      version: PRODUCT_SHELL_HISTORY_VERSION,
    },
    {
      catalogId: "catalog-one",
      detailScrollTop: -1,
      kind: "viewer",
      mediaId: "media-one",
      sourceDestination: "home",
      sourceScrollTop: 0,
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
