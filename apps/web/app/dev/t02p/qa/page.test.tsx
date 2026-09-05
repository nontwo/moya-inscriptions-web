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
import { T02pQaHarness } from "../../../../features/qa/t02p-qa-harness";

import type { T02pQaHarnessProps } from "../../../../features/qa/t02p-qa-harness";

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
    expect(markup).toContain('data-qa-chrome="visible"');
    expect(markup).toContain("data-qa-controls");
    expect(markup).toContain("data-clean-product-preview");
    expect(markup).toContain("data-product-shell");
    expect(markup).toContain("data-development-primary-pager");
    expect(markup).not.toContain("data-inscription-filter");
    expect(markup).not.toContain("data-filter-trigger");
    expect(markup).toContain("data-t02p-qa-search");
    expect(markup).toContain("data-search-trigger");
    expect(markup).toContain("data-qa-search-scenario-selector");
    expect(markup).toContain("data-qa-user-interface");
    expect(markup).toContain("data-user-trigger");
    expect(markup).toContain("data-qa-user-scenario-selector");
    expect(markup).not.toContain("data-open-settings");
    expect(markup).toContain(
      '<option value="visual" selected="">Visual</option>',
    );
  });

  it("supports direct QA links for phone and tablet presentation modes", async () => {
    vi.stubEnv("NODE_ENV", "development");

    for (const platform of ["phone", "tablet"] as const) {
      const markup = renderToStaticMarkup(
        await T02pQaPage({ searchParams: Promise.resolve({ platform }) }),
      );

      expect(markup).toContain(
        `<option value="${platform}" selected="">${
          platform === "phone" ? "Phone" : "Tablet"
        }</option>`,
      );
    }
  });

  it("hides only the QA chrome for the exact QA-local hidden value", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const markup = renderToStaticMarkup(
      await T02pQaPage({
        searchParams: Promise.resolve({ qaChrome: "hidden" }),
      }),
    );

    expect(markup).toContain('data-qa-chrome="hidden"');
    expect(markup).not.toContain("data-qa-controls");
    expect(markup).not.toContain("T02P QA Harness");
    expect(markup).not.toContain("data-qa-platform-selector");
    expect(markup).not.toContain("data-development-primary-pager");
    expect(markup).toContain("data-product-shell");
    expect(markup).toContain("data-search-trigger");
    expect(markup).toContain("data-user-trigger");
    expect(markup).not.toContain("<style");
  });

  it.each([
    { qaChrome: "visible" },
    { qaChrome: "unknown" },
    { qaChrome: "HIDDEN" },
    { qaChrome: " hidden " },
    { qaChrome: ["hidden"] },
    { qaChrome: ["hidden", "visible"] },
    { preview: "owner" },
  ])("retains complete QA chrome for unsupported values: %j", async (query) => {
    vi.stubEnv("NODE_ENV", "development");

    const markup = renderToStaticMarkup(
      await T02pQaPage({ searchParams: Promise.resolve(query) }),
    );

    expect(markup).toContain('data-qa-chrome="visible"');
    expect(markup).toContain("data-qa-controls");
    expect(markup).toContain("data-qa-platform-selector");
    expect(markup).toContain("data-qa-search-scenario-selector");
    expect(markup).toContain("data-qa-user-scenario-selector");
    expect(markup).toContain("data-development-primary-pager");
  });

  it("preserves other query parameters, platform and all scenario data in the same Harness", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const query = {
      scenario: "topic-long-blocks",
      feed: "topics",
      topic: "qa-owner-topic",
    };
    const visible = await T02pQaPage({
      searchParams: Promise.resolve(query),
    });
    const hidden = await T02pQaPage({
      searchParams: Promise.resolve({ ...query, qaChrome: "hidden" }),
    });
    const visibleProps = visible.props as T02pQaHarnessProps;
    const hiddenProps = hidden.props as T02pQaHarnessProps;

    expect(visible.type).toBe(T02pQaHarness);
    expect(hidden.type).toBe(T02pQaHarness);
    expect(visibleProps).toMatchObject({
      initialHomeScenario: "topic-long-blocks",
      initialHomeFeed: "topics",
      initialTopicId: "qa-owner-topic",
      initialPlatform: "pc",
      qaChrome: "visible",
    });
    expect({ ...hiddenProps, qaChrome: "visible" }).toEqual(visibleProps);
    expect(hiddenProps.qaChrome).toBe("hidden");
    expect(query).toEqual({
      scenario: "topic-long-blocks",
      feed: "topics",
      topic: "qa-owner-topic",
    });
  });
});
