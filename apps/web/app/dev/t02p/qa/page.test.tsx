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

import T02pQaPage from "./page";

describe("T02pQaPage", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(
      new Headers({
        host: "192.0.2.44:3102",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps the QA Harness unavailable in Production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(T02pQaPage({})).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(headersMock).not.toHaveBeenCalled();
  });

  it("renders Development controls outside the shared Product Shell", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const markup = renderToStaticMarkup(await T02pQaPage({}));

    expect(markup).toContain("T02P QA Harness");
    expect(markup).toContain("data-t02p-qa-harness");
    expect(markup).toContain("data-qa-controls");
    expect(markup).toContain("data-clean-product-preview");
    expect(markup).toContain("data-product-shell");
    expect(markup).toContain("data-development-primary-pager");
    expect(markup).toContain(
      '<option value="visual" selected="">Visual</option>',
    );
  });
});
