import { describe, expect, it, vi } from "vitest";

import { fetchSameOriginCatalogDetail } from "./catalog-detail-client";

import type { CatalogDetail, CatalogId } from "@moya/contracts";

const detail = {
  aliases: [],
  id: "catalog-one" as CatalogId,
  kind: "inscription",
  media: [],
  sourceCitations: [],
  title: "目录一",
} satisfies CatalogDetail;

const context = (fetch: typeof globalThis.fetch) => ({
  baseUrl: new URL("https://example.test/dev/t02p"),
  fetch,
});

describe("same-origin Catalog Detail client", () => {
  it("loads and validates the requested identity from the existing route", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(detail));

    await expect(
      fetchSameOriginCatalogDetail("catalog-one", undefined, context(fetch)),
    ).resolves.toEqual({ detail, state: "success" });
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://example.test/api/catalog/catalog-one"),
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetch.mock.instances[0]).toBe(globalThis);
  });

  it("rejects a valid payload whose identity does not match the request", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ...detail, id: "catalog-other" as CatalogId }),
      );

    await expect(
      fetchSameOriginCatalogDetail("catalog-one", undefined, context(fetch)),
    ).resolves.toEqual({ state: "unexpected-error" });
  });

  it.each([
    [404, "not-found"],
    [503, "unavailable"],
    [502, "unexpected-error"],
  ] as const)("maps HTTP %s to %s", async (status, state) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(
      fetchSameOriginCatalogDetail("catalog-one", undefined, context(fetch)),
    ).resolves.toEqual({ state });
  });

  it("propagates an aborted request instead of presenting it as an error", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });

    await expect(
      fetchSameOriginCatalogDetail(
        "catalog-one",
        controller.signal,
        context(fetch),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
