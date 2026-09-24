import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { relayServerLocalEditorialMedia } from "./editorial-media";

const file = `${"c".repeat(64)}-${"d".repeat(64)}.png`;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("relayServerLocalEditorialMedia (Development)", () => {
  it("reads the file anonymously from the loopback CMS and returns the image", async () => {
    vi.stubEnv("CMS_INTERNAL_URL", "http://127.0.0.1:3522");
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const response = await relayServerLocalEditorialMedia(file);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
    expect(String(upstream.mock.calls[0]![0])).toBe(
      `http://127.0.0.1:3522/api/media/file/${file}`,
    );
    const headers = new Headers(upstream.mock.calls[0]![1]?.headers);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
  });

  it.each([
    "x.png",
    `${"c".repeat(64)}-${"d".repeat(64)}.gif`,
    "../etc/passwd",
  ])("refuses the name %s without reading anything", async (name) => {
    vi.stubEnv("CMS_INTERNAL_URL", "http://127.0.0.1:3522");
    const upstream = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", upstream);
    expect((await relayServerLocalEditorialMedia(name)).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([undefined, "https://cms.example.invalid", "http://10.0.0.5:3522"])(
    "never reads from a non-loopback CMS origin (%s)",
    async (origin) => {
      if (origin !== undefined) vi.stubEnv("CMS_INTERNAL_URL", origin);
      else vi.stubEnv("CMS_INTERNAL_URL", "");
      const upstream = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", upstream);
      expect((await relayServerLocalEditorialMedia(file)).status).toBe(503);
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it("answers 404 for an unpublished or missing file and 502 for another type", async () => {
    vi.stubEnv("CMS_INTERNAL_URL", "http://127.0.0.1:3522");
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(
          new Response("<html>", { headers: { "content-type": "text/html" } }),
        ),
    );
    expect((await relayServerLocalEditorialMedia(file)).status).toBe(404);
    expect((await relayServerLocalEditorialMedia(file)).status).toBe(502);
  });
});
