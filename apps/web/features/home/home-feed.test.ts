import { describe, expect, it } from "vitest";

import { homeFeeds, parseHomeFeed } from "./home-feed";

describe("Home feed identity", () => {
  it("accepts every bounded feed identity", () => {
    for (const feed of homeFeeds) expect(parseHomeFeed(feed)).toBe(feed);
  });

  it.each([undefined, null, "", "unknown", ["topics"]])(
    "falls back invalid input %o to Discover",
    (value) => {
      expect(parseHomeFeed(value)).toBe("discover");
    },
  );
});
