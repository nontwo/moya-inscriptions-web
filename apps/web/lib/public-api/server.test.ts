import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchServerCatalogPage, parsePublicApiBaseUrl } from "./server.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Public API server wiring", () => {
  it.each([
    undefined,
    "",
    " https://api.example.invalid",
    "relative/path",
    "ftp://api.example.invalid",
    "https://user:password@api.example.invalid",
    "https://api.example.invalid?tenant=one",
    "https://api.example.invalid#catalog",
  ])("rejects invalid base URL configuration: %s", (value) => {
    expect(() => parsePublicApiBaseUrl(value)).toThrow();
  });

  it("normalizes a root base URL", () => {
    expect(parsePublicApiBaseUrl("http://127.0.0.1:3001").toString()).toBe(
      "http://127.0.0.1:3001/",
    );
  });

  it("preserves and normalizes a fixed gateway path prefix", () => {
    expect(
      parsePublicApiBaseUrl("https://web.example.invalid/api//").toString(),
    ).toBe("https://web.example.invalid/api/");
  });

  it("does not fetch when server configuration is missing", async () => {
    vi.stubEnv("MOYA_PUBLIC_API_BASE_URL", "");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchServerCatalogPage()).resolves.toEqual({
      state: "unexpected-error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("supplies the validated server base URL and fetch implementation", async () => {
    vi.stubEnv("MOYA_PUBLIC_API_BASE_URL", "https://web.example.invalid/api");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchServerCatalogPage()).resolves.toMatchObject({
      state: "success",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://web.example.invalid/api/v1/catalog",
      expect.any(Object),
    );
  });
});
