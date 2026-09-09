import { describe, expect, it, vi } from "vitest";
import { fetchEditorialPreview } from "./editorial-preview-server";

const detail = {
  id: "catalog-preview",
  kind: "inscription",
  title: "Synthetic preview",
  aliases: [],
  media: [],
  sourceCitations: [],
};

describe("protected preview server transport", () => {
  it("forwards only a session to a fixed endpoint without redirects or shared caching", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      expect(String(url)).toBe(
        "https://cms.example.invalid/api/editorial/preview/7",
      );
      expect(init?.cache).toBe("no-store");
      expect(init?.redirect).toBe("error");
      expect(init?.headers).toEqual({
        Accept: "application/json",
        Cookie: "payload-token=fictional-session",
      });
      return new Response(JSON.stringify(detail));
    });
    expect(
      await fetchEditorialPreview("7", {
        baseURL: "https://cms.example.invalid",
        session: "fictional-session",
        fetch,
      }),
    ).toEqual({ state: "success", detail });
  });
  it("rejects missing auth, invalid ids and source-directed endpoints before fetching", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(
      await fetchEditorialPreview("7", {
        baseURL: "https://cms.example.invalid",
        fetch,
      }),
    ).toEqual({ state: "unauthorized" });
    expect(
      await fetchEditorialPreview("../escape", {
        baseURL: "https://cms.example.invalid",
        session: "fictional-session",
        fetch,
      }),
    ).toEqual({ state: "not-found" });
    expect(
      await fetchEditorialPreview("7", {
        baseURL: "https://cms.example.invalid/?redirect=1",
        session: "fictional-session",
        fetch,
      }),
    ).toEqual({ state: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [403, "unauthorized"],
    [404, "not-found"],
    [422, "incomplete"],
    [500, "unavailable"],
  ] as const)("handles protected endpoint status %s", async (status, state) => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response("Private response must not be forwarded", { status }),
    );
    expect(
      await fetchEditorialPreview("7", {
        baseURL: "https://cms.example.invalid",
        session: "fictional-session",
        fetch,
      }),
    ).toEqual({ state });
  });
  it("validates the DTO and never exposes malformed CMS responses", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({ private: "fictional-private-test-value" }),
        ),
    );
    expect(
      await fetchEditorialPreview("7", {
        baseURL: "https://cms.example.invalid",
        session: "fictional-session",
        fetch,
      }),
    ).toEqual({ state: "unavailable" });
  });
});
