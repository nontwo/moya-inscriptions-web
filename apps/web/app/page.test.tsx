import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadProductionProductStatesMock,
  readFormalRequestContextMock,
  t02pProductPreviewMock,
} = vi.hoisted(() => ({
  loadProductionProductStatesMock: vi.fn(),
  readFormalRequestContextMock: vi.fn(),
  t02pProductPreviewMock: vi.fn(),
}));

vi.mock(
  "../features/product-application/load-production-product-states",
  () => ({ loadProductionProductStates: loadProductionProductStatesMock }),
);
vi.mock("./formal-request-context", () => ({
  readFormalRequestContext: readFormalRequestContextMock,
}));
vi.mock("../features/product-preview/t02p-product-preview", () => ({
  T02pProductPreview: (props: unknown) => {
    t02pProductPreviewMock(props);
    return <div data-formal-product-application="" />;
  },
}));

import FormalPage from "./page";

const states = { identity: "production-states" };

beforeEach(() => {
  loadProductionProductStatesMock.mockReset();
  readFormalRequestContextMock.mockReset();
  t02pProductPreviewMock.mockReset();
  loadProductionProductStatesMock.mockResolvedValue(states);
  readFormalRequestContextMock.mockResolvedValue({
    initialPlatform: "tablet",
  });
});

describe("FormalPage", () => {
  it("renders the accepted Product application with Production state only", async () => {
    const markup = renderToStaticMarkup(await FormalPage({}));

    expect(markup).toContain("data-formal-product-application");
    expect(readFormalRequestContextMock).toHaveBeenCalledOnce();
    expect(loadProductionProductStatesMock).toHaveBeenCalledOnce();
    expect(t02pProductPreviewMock.mock.calls[0]?.[0]).toEqual({
      initialHomeFeed: "discover",
      initialPlatform: "tablet",
      initialTopicId: null,
      states,
    });
    expect(t02pProductPreviewMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "inscriptionUtility",
    );
    expect(t02pProductPreviewMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "productUtility",
    );
    expect(t02pProductPreviewMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "navigationAction",
    );
  });

  it.each(["discover", "nearby", "topics"] as const)(
    "accepts the existing %s feed query",
    async (feed) => {
      renderToStaticMarkup(
        await FormalPage({ searchParams: Promise.resolve({ feed }) }),
      );

      expect(t02pProductPreviewMock.mock.calls[0]?.[0]).toMatchObject({
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

    expect(t02pProductPreviewMock.mock.calls[0]?.[0]).toMatchObject({
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

    expect(t02pProductPreviewMock.mock.calls[0]?.[0]).toMatchObject({
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

    expect(t02pProductPreviewMock.mock.calls[0]?.[0]).toEqual({
      initialHomeFeed: "nearby",
      initialPlatform: "tablet",
      initialTopicId: null,
      states,
    });
  });
});
