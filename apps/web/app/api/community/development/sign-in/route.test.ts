import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }));

vi.mock("../../../../../lib/public-api/server", () => ({
  signInServerDevelopmentAccount: signInMock,
}));

import { POST } from "./route";

const opaqueSession = "D".repeat(43);
const session = {
  token: opaqueSession,
  expiresAt: "2026-09-13T03:00:00.000Z",
  profile: {
    id: "user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01",
    handle: "dev-user-01",
    displayName: "拓片爱好者",
  },
};
const jsonRequest = (body: unknown, accept = "application/json") =>
  new Request("http://127.0.0.1:3000/api/community/development/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json", accept },
    body: JSON.stringify(body),
  });
const formRequest = (handle: string) =>
  new Request("http://127.0.0.1:3000/api/community/development/sign-in", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html,application/xhtml+xml",
    },
    body: new URLSearchParams({ handle }).toString(),
  });

beforeEach(() => {
  signInMock.mockReset();
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Development sign-in bridge", () => {
  it("is unavailable outside development before any Backend call", async () => {
    for (const nodeEnv of ["production", "test"]) {
      vi.stubEnv("NODE_ENV", nodeEnv);
      const response = await POST(jsonRequest({ handle: "dev-user-01" }));
      expect(response.status).toBe(404);
    }
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("stores the Backend credential in the HttpOnly cookie and returns only the profile", async () => {
    signInMock.mockResolvedValue({ state: "success", session });
    const response = await POST(jsonRequest({ handle: "dev-user-01" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(session.profile);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`yoyi-session=${opaqueSession}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(cookie).toContain("Expires=Sun, 13 Sep 2026 03:00:00 GMT");
    expect(signInMock).toHaveBeenCalledWith("dev-user-01");
  });

  it("redirects the Development page form back with a notice", async () => {
    signInMock.mockResolvedValue({ state: "success", session });
    const response = await POST(formRequest("dev-user-02"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/dev/community?notice=signed-in",
    );
    expect(response.headers.get("set-cookie")).toContain(
      `yoyi-session=${opaqueSession}`,
    );
    expect(signInMock).toHaveBeenCalledWith("dev-user-02");
  });

  it("marks the cookie Secure behind HTTPS", async () => {
    signInMock.mockResolvedValue({ state: "success", session });
    const response = await POST(
      new Request(
        "https://web.example.invalid/api/community/development/sign-in",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handle: "dev-user-01" }),
        },
      ),
    );
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("rejects malformed bodies without calling the Backend", async () => {
    for (const request of [
      jsonRequest({}),
      jsonRequest({ handle: 7 }),
      new Request("http://127.0.0.1:3000/api/community/development/sign-in", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "dev-user-01",
      }),
      new Request("http://127.0.0.1:3000/api/community/development/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
      new Request("http://127.0.0.1:3000/api/community/development/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: "dev-user-01", pad: "x".repeat(5_000) }),
      }),
    ]) {
      const response = await POST(request);
      expect(response.status).toBe(400);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(signInMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid-request", 400, "invalid-request"],
    ["not-found", 404, "unknown-account"],
    ["unavailable", 503, "unavailable"],
    ["unexpected-error", 502, "error"],
  ] as const)(
    "maps %s for JSON and form clients",
    async (state, status, notice) => {
      signInMock.mockResolvedValue({ state });
      const json = await POST(jsonRequest({ handle: "dev-user-01" }));
      expect(json.status).toBe(status);
      expect(await json.text()).toBe("");
      expect(json.headers.get("set-cookie")).toBeNull();
      const form = await POST(formRequest("dev-user-01"));
      expect(form.status).toBe(303);
      expect(form.headers.get("location")).toBe(
        `/dev/community?notice=${notice}`,
      );
      expect(form.headers.get("set-cookie")).toBeNull();
    },
  );
});
