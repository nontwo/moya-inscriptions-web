import { describe, expect, it } from "vitest";

import {
  communitySessionCookieName,
  isSecureRequest,
  readCommunitySessionToken,
  serializeClearedCommunitySessionCookie,
  serializeCommunitySessionCookie,
} from "./community-session-cookie";

const opaqueSession = "B".repeat(43);

describe("community session cookie", () => {
  it("uses a dedicated HttpOnly cookie distinct from payload-token", () => {
    expect(communitySessionCookieName).not.toBe("payload-token");
    const cookie = serializeCommunitySessionCookie(
      opaqueSession,
      new Date("2026-09-13T03:00:00.000Z"),
      true,
    );
    expect(cookie).toBe(
      `yoyi-session=${opaqueSession}; Expires=Sun, 13 Sep 2026 03:00:00 GMT; Path=/; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(
      serializeCommunitySessionCookie(opaqueSession, new Date(0), false),
    ).not.toContain("Secure");
    expect(() =>
      serializeCommunitySessionCookie("bad", new Date(), true),
    ).toThrow();
    expect(serializeClearedCommunitySessionCookie(true)).toBe(
      "yoyi-session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure",
    );
  });

  it("reads only a well-formed credential from the Cookie header", () => {
    expect(
      readCommunitySessionToken(
        `payload-token=abc; yoyi-session=${opaqueSession}`,
      ),
    ).toBe(opaqueSession);
    expect(readCommunitySessionToken(`yoyi-session=${opaqueSession}`)).toBe(
      opaqueSession,
    );
    for (const header of [
      null,
      undefined,
      "",
      "payload-token=abc",
      "yoyi-session=short",
      `yoyi-session=${opaqueSession}x`,
      `yoyi-sessions=${opaqueSession}`,
    ])
      expect(readCommunitySessionToken(header)).toBeUndefined();
  });

  it("marks cookies Secure only for HTTPS requests", () => {
    expect(isSecureRequest(new Request("https://web.example.invalid/"))).toBe(
      true,
    );
    expect(isSecureRequest(new Request("http://127.0.0.1:3000/"))).toBe(false);
    expect(
      isSecureRequest(
        new Request("http://127.0.0.1:3000/", {
          headers: { "x-forwarded-proto": "https" },
        }),
      ),
    ).toBe(true);
  });
});
