import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Search request confidentiality", () => {
  it("excludes search request text from Next incoming logs while preserving other routes", () => {
    const logging = nextConfig.logging;
    if (
      logging === false ||
      logging === undefined ||
      typeof logging.incomingRequests !== "object"
    )
      throw new Error("Expected bounded incoming request configuration");
    const excluded = (url: string) =>
      logging.incomingRequests &&
      typeof logging.incomingRequests === "object" &&
      logging.incomingRequests.ignore?.some((pattern) => pattern.test(url));
    expect(excluded("/api/catalog-search?q=synthetic-search-text")).toBe(true);
    expect(excluded("/api/catalog-search")).toBe(true);
    expect(excluded("/api/catalog?kind=calligraphy")).toBe(false);
    expect(excluded("/api/catalog-search-unrelated")).toBe(false);
    expect(excluded("/")).toBe(false);
  });
});
