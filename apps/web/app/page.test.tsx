import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadProductionProductStatesMock,
  readFormalRequestContextMock,
  productApplicationMock,
} = vi.hoisted(() => ({
  loadProductionProductStatesMock: vi.fn(),
  readFormalRequestContextMock: vi.fn(),
  productApplicationMock: vi.fn(),
}));

vi.mock(
  "../features/product-application/load-production-product-states",
  () => ({ loadProductionProductStates: loadProductionProductStatesMock }),
);
vi.mock("./formal-request-context", () => ({
  readFormalRequestContext: readFormalRequestContextMock,
}));
vi.mock("../features/product-application/product-application", () => ({
  ProductApplication: (props: unknown) => {
    productApplicationMock(props);
    return <div data-formal-product-application="" />;
  },
}));

import FormalPage from "./page";
import {
  CatalogSearch,
  CatalogSearchNavigationAction,
} from "../features/search/catalog-search";

const states = { identity: "production-states" };

beforeEach(() => {
  loadProductionProductStatesMock.mockReset();
  readFormalRequestContextMock.mockReset();
  productApplicationMock.mockReset();
  loadProductionProductStatesMock.mockResolvedValue(states);
  readFormalRequestContextMock.mockResolvedValue({
    initialPlatform: "tablet",
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("FormalPage", () => {
  it("renders the accepted Product application with Production state only", async () => {
    const markup = renderToStaticMarkup(await FormalPage({}));

    expect(markup).toContain("data-formal-product-application");
    expect(productApplicationMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "quickActions",
    );
    expect(readFormalRequestContextMock).toHaveBeenCalledOnce();
    expect(loadProductionProductStatesMock).toHaveBeenCalledOnce();
    // Outside the Development runtime no comment section is composed.
    expect(productApplicationMock.mock.calls[0]?.[0]).toEqual({
      comments: null,
      initialHomeFeed: "discover",
      initialPlatform: "tablet",
      initialTopicId: null,
      navigationAction: expect.objectContaining({
        type: CatalogSearchNavigationAction,
      }),
      productUtility: expect.objectContaining({ type: CatalogSearch }),
      states,
    });
    expect(productApplicationMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "inscriptionUtility",
    );
  });

  it("composes the live comment section with the Development sign-in entry only in Development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    renderToStaticMarkup(await FormalPage({}));
    expect(productApplicationMock.mock.calls[0]?.[0]).toMatchObject({
      comments: { signInHref: "/dev/community" },
    });

    productApplicationMock.mockReset();
    vi.stubEnv("NODE_ENV", "production");
    renderToStaticMarkup(await FormalPage({}));
    expect(productApplicationMock.mock.calls[0]?.[0]).toMatchObject({
      comments: null,
    });
  });

  it.each(["discover", "nearby", "topics"] as const)(
    "accepts the existing %s feed query",
    async (feed) => {
      renderToStaticMarkup(
        await FormalPage({ searchParams: Promise.resolve({ feed }) }),
      );

      expect(productApplicationMock.mock.calls[0]?.[0]).toMatchObject({
        initialHomeFeed: feed,
        initialTopicId: null,
      });
    },
  );

  it("falls back invalid feed input to Discover", async () => {
    renderToStaticMarkup(
      await FormalPage({
        searchParams: Promise.resolve({ feed: ["topics"] }),
      }),
    );

    expect(productApplicationMock.mock.calls[0]?.[0]).toMatchObject({
      initialHomeFeed: "discover",
      initialTopicId: null,
    });
  });

  it("accepts a bounded topic and forces the Topics feed", async () => {
    renderToStaticMarkup(
      await FormalPage({
        searchParams: Promise.resolve({ feed: "nearby", topic: "topic-one" }),
      }),
    );

    expect(productApplicationMock.mock.calls[0]?.[0]).toMatchObject({
      initialHomeFeed: "topics",
      initialTopicId: "topic-one",
    });
  });

  it("ignores invalid topic and page-unowned Product History inputs", async () => {
    renderToStaticMarkup(
      await FormalPage({
        searchParams: Promise.resolve({
          catalogId: "catalog-one",
          feed: "nearby",
          image: "media-one",
          topic: "x".repeat(161),
        }),
      }),
    );

    expect(productApplicationMock.mock.calls[0]?.[0]).toEqual({
      comments: null,
      initialHomeFeed: "nearby",
      initialPlatform: "tablet",
      initialTopicId: null,
      navigationAction: expect.objectContaining({
        type: CatalogSearchNavigationAction,
      }),
      productUtility: expect.objectContaining({ type: CatalogSearch }),
      states,
    });
  });
});
