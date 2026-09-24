import { afterEach, describe, expect, it, vi } from "vitest";

const { relay } = vi.hoisted(() => ({ relay: vi.fn() }));
vi.mock("../../../../lib/public-api/editorial-media", () => ({
  relayServerLocalEditorialMedia: relay,
}));
import { GET } from "./route";

const file = `${"e".repeat(64)}-${"f".repeat(64)}.png`;
const params = { params: Promise.resolve({ file }) };
afterEach(() => {
  vi.unstubAllEnvs();
  relay.mockReset();
});

describe("GET /api/editorial-media/[file]", () => {
  it("exists only in Development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await GET(
      new Request(`http://web.invalid/api/editorial-media/${file}`),
      params,
    );
    expect(response.status).toBe(404);
    expect(relay).not.toHaveBeenCalled();
  });

  it("relays the named file in Development and refuses a query", async () => {
    vi.stubEnv("NODE_ENV", "development");
    relay.mockResolvedValue(new Response(null, { status: 200 }));
    expect(
      (
        await GET(
          new Request(`http://web.invalid/api/editorial-media/${file}`),
          params,
        )
      ).status,
    ).toBe(200);
    expect(relay).toHaveBeenCalledWith(file);
    expect(
      (
        await GET(
          new Request(`http://web.invalid/api/editorial-media/${file}?x=1`),
          params,
        )
      ).status,
    ).toBe(404);
  });
});
