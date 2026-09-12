import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProductApplication } from "./product-application";
import { LiveCommentSection } from "../comments/live-comment-section";

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

  it("composes the live comment section through the frozen seam with the sign-in path", () => {
    renderToStaticMarkup(
      <ProductApplication
        comments={{ signInHref: "/dev/community" }}
        initialPlatform="pc"
        states={states}
      />,
    );
    const { renderCommentSection } = lastPreviewProps();
    expect(renderCommentSection).toBeTypeOf("function");
    const section = renderCommentSection?.("catalog-one") as {
      key: string | null;
      props: Record<string, unknown>;
      type: unknown;
    };
    expect(section.type).toBe(LiveCommentSection);
    expect(section.key).toBe("catalog-one");
    expect(section.props).toEqual({
      catalogId: "catalog-one",
      signInHref: "/dev/community",
    });
  });
});
