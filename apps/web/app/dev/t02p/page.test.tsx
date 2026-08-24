import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { headersMock, notFoundMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  notFoundMock: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

import T02pDevelopmentPage from "./page";

describe("T02pDevelopmentPage", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(
      new Headers({
        host: "192.0.2.44:3102",
        "x-forwarded-proto": "http",
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps the Development acceptance route unavailable in Production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(T02pDevelopmentPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(headersMock).not.toHaveBeenCalled();
  });

  it("composes all QA scenarios and same-origin Visual media in Development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const markup = renderToStaticMarkup(await T02pDevelopmentPage());

    expect(markup).toContain("T02P Development acceptance");
    expect(markup).toContain('data-catalog-scenario="visual"');
    expect(markup).toContain(
      '<option value="visual" selected="">Visual</option>',
    );
    expect(markup).toContain(
      '<option value="small-populated">Small populated</option>',
    );
    expect(markup).toContain('<option value="empty">Empty</option>');
    expect(markup).toContain(
      '<option value="unavailable">Unavailable</option>',
    );
    expect(markup).toContain(
      '<option value="unexpected-error">Unexpected error</option>',
    );
    expect(markup).toContain(
      'src="http://192.0.2.44:3102/docs/design-system/assets/demo/',
    );
    expect(markup.match(/data-primary-destination=/g)).toHaveLength(3);
  });

  it("fails closed when the Development request has no unambiguous Host", async () => {
    vi.stubEnv("NODE_ENV", "development");
    headersMock.mockResolvedValue(new Headers());

    await expect(T02pDevelopmentPage()).rejects.toThrow("Missing Host header");
  });
});
