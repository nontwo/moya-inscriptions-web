import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { headersMock, loadDetailMock, notFoundMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  loadDetailMock: vi.fn(),
  notFoundMock: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("../../../features/detail/load-catalog-detail", () => ({
  loadCatalogDetailPresentation: loadDetailMock,
}));

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

    await expect(
      T02pDevelopmentPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(headersMock).not.toHaveBeenCalled();
  });

  it("composes all QA scenarios and same-origin Visual media in Development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const markup = renderToStaticMarkup(
      await T02pDevelopmentPage({ searchParams: Promise.resolve({}) }),
    );

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
    expect(markup.match(/data-qa-detail-scenario-selector/g)).toHaveLength(1);
    expect(markup).toContain(
      '<option value="single-portrait" selected="">Single portrait</option>',
    );
    for (const key of [
      "single-landscape",
      "single-ultrawide",
      "inscription-complete",
      "calligraphy-mixed",
      "tablet-ultrawide-grid",
      "no-media",
      "long-partial",
    ]) {
      expect(markup).toContain(`<option value="${key}">`);
    }
    expect(markup).toContain(
      'src="http://192.0.2.44:3102/docs/design-system/assets/demo/',
    );
    expect(markup.match(/data-primary-destination=/g)).toHaveLength(3);
    expect(loadDetailMock).not.toHaveBeenCalled();
  });

  it("renders a direct QA Detail and Viewer query without a runtime fetch", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const markup = renderToStaticMarkup(
      await T02pDevelopmentPage({
        searchParams: Promise.resolve({
          detail: "calligraphy-mixed",
          image: "qa-detail-calligraphy-mixed-media-2",
        }),
      }),
    );

    expect(markup).toContain('data-detail-open="true"');
    expect(markup).toContain('data-detail-qa-scenario="calligraphy-mixed"');
    expect(markup).toContain("墨册试页（混合 Gallery QA）");
    expect(loadDetailMock).not.toHaveBeenCalled();
  });

  it("loads an explicit runtime CatalogId without any QA fallback", async () => {
    vi.stubEnv("NODE_ENV", "development");
    loadDetailMock.mockResolvedValue({ state: "not-found" });

    const markup = renderToStaticMarkup(
      await T02pDevelopmentPage({
        searchParams: Promise.resolve({ catalogId: "runtime-missing" }),
      }),
    );

    expect(loadDetailMock).toHaveBeenCalledWith(
      "runtime-missing",
      "development",
    );
    expect(markup).toContain('data-detail-state="not-found"');
    expect(markup).not.toContain('data-detail-qa-scenario="');
  });

  it("fails closed when the Development request has no unambiguous Host", async () => {
    vi.stubEnv("NODE_ENV", "development");
    headersMock.mockResolvedValue(new Headers());

    await expect(
      T02pDevelopmentPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("Missing Host header");
  });
});
