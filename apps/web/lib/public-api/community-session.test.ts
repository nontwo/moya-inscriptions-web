import { describe, expect, it, vi } from "vitest";

import {
  fetchCurrentUser,
  parseDevelopmentSignInHandle,
  parseSessionToken,
  signInDevelopmentAccount,
  signOutDevelopmentSession,
} from "./community-session";

const opaqueSession = "A".repeat(43);
const profile = {
  id: "user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01",
  handle: "dev-user-01",
  displayName: "拓片爱好者",
};
const baseUrl = new URL("http://backend.invalid/");

const respond = (status: number, body?: unknown) =>
  vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      body === undefined
        ? new Response(null, { status })
        : Response.json(body, { status }),
    );

describe("community session transport", () => {
  it("accepts only the opaque credential shape and normalized handles", () => {
    expect(parseSessionToken(opaqueSession)).toBe(opaqueSession);
    for (const candidate of ["", "short", `${opaqueSession}=`, 42, undefined])
      expect(parseSessionToken(candidate)).toBeNull();
    expect(parseDevelopmentSignInHandle("dev-user-01")).toBe("dev-user-01");
    for (const candidate of ["Dev-User-01", "a", "with space", null])
      expect(parseDevelopmentSignInHandle(candidate)).toBeNull();
  });

  it("identifies the session owner with a bearer credential and never a cookie", async () => {
    const fetchMock = respond(200, profile);
    await expect(
      fetchCurrentUser({ baseUrl, fetch: fetchMock }, opaqueSession),
    ).resolves.toEqual({ state: "success", profile });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://backend.invalid/v1/me");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${opaqueSession}`,
    );
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
    expect(init?.cache).toBe("no-store");
  });

  it.each([
    [401, "unauthenticated"],
    [503, "unavailable"],
    [500, "unexpected-error"],
  ] as const)("maps /v1/me status %s", async (status, state) => {
    await expect(
      fetchCurrentUser({ baseUrl, fetch: respond(status) }, opaqueSession),
    ).resolves.toEqual({ state });
  });

  it("does not call the Backend for a malformed credential and rejects malformed profiles", async () => {
    const fetchMock = respond(200, { ...profile, status: "active" });
    await expect(
      fetchCurrentUser({ baseUrl, fetch: fetchMock }, "bad"),
    ).resolves.toEqual({ state: "unauthenticated" });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      fetchCurrentUser({ baseUrl, fetch: fetchMock }, opaqueSession),
    ).resolves.toEqual({ state: "unexpected-error" });
  });

  it("signs in a Development account with a strict JSON body", async () => {
    const session = {
      token: opaqueSession,
      expiresAt: "2026-09-13T03:00:00.000Z",
      profile,
    };
    const fetchMock = respond(201, session);
    await expect(
      signInDevelopmentAccount({ baseUrl, fetch: fetchMock }, "dev-user-01"),
    ).resolves.toEqual({ state: "success", session });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://backend.invalid/v1/development/sign-in");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ handle: "dev-user-01" }));
    await expect(
      signInDevelopmentAccount({ baseUrl, fetch: fetchMock }, "Nope"),
    ).resolves.toEqual({ state: "invalid-request" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, "invalid-request"],
    [404, "not-found"],
    [503, "unavailable"],
    [500, "unexpected-error"],
  ] as const)("maps sign-in status %s", async (status, state) => {
    await expect(
      signInDevelopmentAccount(
        { baseUrl, fetch: respond(status) },
        "dev-user-01",
      ),
    ).resolves.toEqual({ state });
  });

  it("signs out with the bearer credential", async () => {
    const fetchMock = respond(204);
    await expect(
      signOutDevelopmentSession({ baseUrl, fetch: fetchMock }, opaqueSession),
    ).resolves.toEqual({ state: "success" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://backend.invalid/v1/development/sign-out");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${opaqueSession}`,
    );
    for (const [status, state] of [
      [401, "unauthenticated"],
      [503, "unavailable"],
      [500, "unexpected-error"],
    ] as const)
      await expect(
        signOutDevelopmentSession(
          { baseUrl, fetch: respond(status) },
          opaqueSession,
        ),
      ).resolves.toEqual({ state });
    await expect(
      signOutDevelopmentSession({ baseUrl, fetch: fetchMock }, "bad"),
    ).resolves.toEqual({ state: "unauthenticated" });
  });

  it("treats network failures as unexpected errors", async () => {
    const failing = vi.fn<typeof fetch>().mockRejectedValue(new Error("down"));
    await expect(
      fetchCurrentUser({ baseUrl, fetch: failing }, opaqueSession),
    ).resolves.toEqual({ state: "unexpected-error" });
    await expect(
      signInDevelopmentAccount({ baseUrl, fetch: failing }, "dev-user-01"),
    ).resolves.toEqual({ state: "unexpected-error" });
  });
});
