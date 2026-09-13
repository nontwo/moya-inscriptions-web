import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProductApplication } from "./product-application";
import { DiscussionSection } from "../authors/discussion-section";

import type { T02pProductPreviewProps } from "../product-preview/t02p-product-preview";

const { previewMock } = vi.hoisted(() => ({ previewMock: vi.fn() }));

vi.mock("../product-preview/t02p-product-preview", () => ({
  T02pProductPreview: (props: unknown) => {
    previewMock(props);
    return <div data-clean-product-preview="" />;
  },
}));

const states = {
  identity: "states",
} as unknown as T02pProductPreviewProps["states"];
const lastPreviewProps = () =>
  previewMock.mock.calls.at(-1)?.[0] as T02pProductPreviewProps;

beforeEach(() => previewMock.mockReset());

describe("ProductApplication", () => {
  it("keeps the accepted Detail without a comment section when comments are not composed", () => {
    const markup = renderToStaticMarkup(
      <ProductApplication
        comments={null}
        initialHomeFeed="nearby"
        initialPlatform="phone"
        initialTopicId="topic-one"
        states={states}
      />,
    );
    expect(markup).toContain("data-clean-product-preview");
    expect(lastPreviewProps()).toEqual({
      initialHomeFeed: "nearby",
      initialPlatform: "phone",
      initialTopicId: "topic-one",
      states,
    });
    expect(lastPreviewProps()).not.toHaveProperty("renderCommentSection");
  });

  it("composes typed Phase 4 discussion and author surfaces only when Development is enabled", () => {
    renderToStaticMarkup(
      <ProductApplication
        comments={{ signInHref: "/dev/community" }}
        authorCommunity
        initialPlatform="pc"
        states={states}
      />,
    );
    const { renderDiscussion, renderProfileOverlay, workDetailLoader } =
      lastPreviewProps();
    expect(renderDiscussion).toBeTypeOf("function");
    const section = renderDiscussion?.({
      type: "catalog",
      id: "catalog-one",
    }) as {
      key: string | null;
      props: Record<string, unknown>;
      type: unknown;
    };
    expect(renderProfileOverlay).toBeTypeOf("function");
    expect(workDetailLoader).toBeTypeOf("function");
    expect(section.type).toBe(DiscussionSection);
    expect(section.key).toBe("catalog:catalog-one");
    expect(section.props).toEqual({
      target: { type: "catalog", id: "catalog-one" },
    });
  });
});
