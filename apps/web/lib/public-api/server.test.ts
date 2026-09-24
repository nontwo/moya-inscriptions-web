import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchServerCatalogDetail,
  fetchServerCatalogPage,
  parsePublicApiBaseUrl,
  relayServerAuthorCommunity,
  relayServerLocalEditorialMedia,
} from "./server.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Public API server wiring", () => {
  it("accepts the browser Host when Next normalizes its internal development URL", async () => {
    vi.stubEnv("MOYA_PUBLIC_API_BASE_URL", "http://127.0.0.1:3411");
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ saved: true }));
    vi.stubGlobal("fetch", upstream);
    const response = await relayServerAuthorCommunity(
      new Request("http://localhost:3410/api/community/favorites/merge", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3410",
          origin: "http://127.0.0.1:3410",
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
  });
  it.each(["https://foreign.invalid", "null", "http://127.0.0.1:3410/path"])(
    "rejects foreign or malformed mutation origin %s even with a forwarded host",
    async (origin) => {
      const upstream = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", upstream);
      const response = await relayServerAuthorCommunity(
        new Request("http://localhost:3410/api/community/favorites/merge", {
          method: "POST",
          headers: {
            host: "127.0.0.1:3410",
            origin,
            "x-forwarded-host": "foreign.invalid",
            "content-type": "application/json",
          },
          body: "{}",
        }),
      );
      expect(response.status).toBe(403);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each([
    undefined,
    "",
    " https://api.example.invalid",
    "relative/path",
    "ftp://api.example.invalid",
    "https://synthetic:placeholder@api.example.invalid",
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

  it("does not fetch Detail when server configuration is missing", async () => {
    vi.stubEnv("MOYA_PUBLIC_API_BASE_URL", "");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchServerCatalogDetail("catalog-001")).resolves.toEqual({
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

  it("forwards Detail through the same server-only base URL boundary", async () => {
    vi.stubEnv("MOYA_PUBLIC_API_BASE_URL", "https://web.example.invalid/api");
    const detail = {
      id: "catalog-001",
      kind: "inscription",
      title: "真实碑刻",
      aliases: [],
      sourceCitations: [],
      media: [],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(detail));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchServerCatalogDetail(detail.id)).resolves.toEqual({
      state: "success",
      detail,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://web.example.invalid/api/v1/catalog/catalog-001",
      expect.any(Object),
    );
  });
});

/* content-community-completion-v1: Development editorial images for a phone on the LAN. */

const file = `${"c".repeat(64)}-${"d".repeat(64)}.png`;
const other = `${"e".repeat(64)}-${"f".repeat(64)}.png`;
const article = `article-${"1".repeat(32)}`;
const collection = `collection-${"2".repeat(32)}`;
const local = (name: string) => `http://127.0.0.1:3522/api/media/file/${name}`;
const detail = (src: string) =>
  Response.json({
    id: article,
    cover: { src: local(other), alt: "封面" },
    sections: [{ image: { src, alt: "插图" } }],
  });
const png = () =>
  new Response(new Uint8Array([137, 80, 78, 71]), {
    headers: { "content-type": "image/png" },
  });

describe("relayServerLocalEditorialMedia (Development)", () => {
  it("serves an image the published Article shows, read anonymously from its loopback URL", async () => {
    vi.stubEnv("MOYA_PUBLIC_API_BASE_URL", "http://127.0.0.1:3521");
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(detail(local(file)))
      .mockResolvedValueOnce(png());
    vi.stubGlobal("fetch", upstream);
    const response = await relayServerLocalEditorialMedia(article, file);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(String(upstream.mock.calls[0]![0])).toBe(
      `http://127.0.0.1:3521/v1/community/editorial/articles/${article}`,
    );
    expect(String(upstream.mock.calls[1]![0])).toBe(local(file));
    for (const call of upstream.mock.calls) {
      const headers = new Headers(call[1]?.headers);
      expect(headers.get("cookie")).toBeNull();
      expect(headers.get("authorization")).toBeNull();
    }
  });

  it("looks a Collection image up in the published Collection", async () => {
    vi.stubEnv("MOYA_PUBLIC_API_BASE_URL", "http://127.0.0.1:3521");
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ id: collection, cover: { src: local(file), alt: "" } }),
      )
      .mockResolvedValueOnce(png());
    vi.stubGlobal("fetch", upstream);
    expect(
      (await relayServerLocalEditorialMedia(collection, file)).status,
    ).toBe(200);
    expect(String(upstream.mock.calls[0]![0])).toBe(
      `http://127.0.0.1:3521/v1/community/editorial/collections/${collection}`,
    );
  });

  it("never serves a file the published item does not show", async () => {
    vi.stubEnv("MOYA_PUBLIC_API_BASE_URL", "http://127.0.0.1:3521");
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(detail(local(other)));
    vi.stubGlobal("fetch", upstream);
    expect((await relayServerLocalEditorialMedia(article, file)).status).toBe(
      404,
    );
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("answers 404 when the item is not published", async () => {
    vi.stubEnv("MOYA_PUBLIC_API_BASE_URL", "http://127.0.0.1:3521");
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    );
    expect((await relayServerLocalEditorialMedia(article, file)).status).toBe(
      404,
    );
  });

  it("only reads a loopback file the detail names, never a foreign source", async () => {
    vi.stubEnv("MOYA_PUBLIC_API_BASE_URL", "http://127.0.0.1:3521");
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        detail(`https://cdn.example.invalid/api/media/file/${file}`),
      );
    vi.stubGlobal("fetch", upstream);
    expect((await relayServerLocalEditorialMedia(article, file)).status).toBe(
      404,
    );
    expect(upstream).toHaveBeenCalledOnce();
  });

  it.each([
    ["user-" + "1".repeat(32), file],
    [article, "x.png"],
    [article, `${"c".repeat(64)}-${"d".repeat(64)}.gif`],
    ["../article", file],
  ])(
    "refuses owner %s / file %s without reading anything",
    async (owner, name) => {
      const upstream = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", upstream);
      expect((await relayServerLocalEditorialMedia(owner, name)).status).toBe(
        404,
      );
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it("answers 404 for a file Payload refuses and 502 for another type", async () => {
    vi.stubEnv("MOYA_PUBLIC_API_BASE_URL", "http://127.0.0.1:3521");
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(detail(local(file)))
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(detail(local(file)))
        .mockResolvedValueOnce(
          new Response("<html>", { headers: { "content-type": "text/html" } }),
        ),
    );
    expect((await relayServerLocalEditorialMedia(article, file)).status).toBe(
      404,
    );
    expect((await relayServerLocalEditorialMedia(article, file)).status).toBe(
      502,
    );
  });
});
