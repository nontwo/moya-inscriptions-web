import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));

vi.mock("../../../../../lib/public-api/server", () => ({
  signOutServerDevelopmentSession: signOutMock,
}));

import { POST } from "./route";

const opaqueSession = "E".repeat(43);
const request = (cookie?: string, accept = "application/json") =>
  new Request("http://127.0.0.1:3000/api/community/development/sign-out", {
    method: "POST",
    headers: { accept, ...(cookie === undefined ? {} : { cookie }) },
  });
const clearedCookie = "yoyi-session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT";

beforeEach(() => {
  signOutMock.mockReset();
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Development sign-out bridge", () => {
  it("is unavailable outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request(`yoyi-session=${opaqueSession}`));
    expect(response.status).toBe(404);
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("revokes through the Backend, then clears the cookie", async () => {
    signOutMock.mockResolvedValue({ state: "success" });
    const response = await POST(request(`yoyi-session=${opaqueSession}`));
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain(clearedCookie);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(signOutMock).toHaveBeenCalledWith(opaqueSession);
  });

  it("clears an already inactive session and redirects the page form", async () => {
    signOutMock.mockResolvedValue({ state: "unauthenticated" });
    const response = await POST(
      request(`yoyi-session=${opaqueSession}`, "text/html"),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/dev/community?notice=signed-out",
    );
    expect(response.headers.get("set-cookie")).toContain(clearedCookie);
  });

  it("clears the cookie without a Backend call when no credential is present", async () => {
    const response = await POST(request());
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain(clearedCookie);
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("keeps the cookie when the Backend could not revoke the session", async () => {
    signOutMock.mockResolvedValue({ state: "unavailable" });
    const json = await POST(request(`yoyi-session=${opaqueSession}`));
    expect(json.status).toBe(503);
    expect(json.headers.get("set-cookie")).toBeNull();
    const form = await POST(
      request(`yoyi-session=${opaqueSession}`, "text/html"),
    );
    expect(form.status).toBe(303);
    expect(form.headers.get("location")).toBe(
      "/dev/community?notice=unavailable",
    );
    expect(form.headers.get("set-cookie")).toBeNull();
    signOutMock.mockResolvedValue({ state: "unexpected-error" });
    expect((await POST(request(`yoyi-session=${opaqueSession}`))).status).toBe(
      502,
    );
  });
});
