import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProductApplication } from "./product-application";
import { DiscussionSection } from "../authors/discussion-section";
import { CreateWorkAction } from "../publishing/create-action";
import { renderPublishingEditorOverlay } from "../publishing/publishing-entry";
import {
  CatalogSearchHeaderAction,
  CatalogSearchNavigationAction,
} from "../search/catalog-search";

import type { ReactElement } from "react";

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

  it("gives the author composition the plus dock action, header Search, and the editor seam", () => {
    renderToStaticMarkup(
      <ProductApplication
        comments={{ signInHref: "/dev/community" }}
        authorCommunity
        initialPlatform="phone"
        navigationAction={<CatalogSearchNavigationAction />}
        states={
          {
            ...states,
            home: { identity: "home" },
          } as unknown as T02pProductPreviewProps["states"]
        }
      />,
    );
    const props = lastPreviewProps();
    const element = (node: unknown) =>
      node as ReactElement<{
        headerStart?: unknown;
      }>;
    expect(element(props.navigationAction).type).toBe(CreateWorkAction);
    expect(props.renderEditorOverlay).toBe(renderPublishingEditorOverlay);
    expect(element(props.headerStart).type).toBe(CatalogSearchHeaderAction);
    for (const page of [props.discoveryHome, props.filteredInscriptions])
      expect(element(element(page).props.headerStart).type).toBe(
        CatalogSearchHeaderAction,
      );
  });

  it("keeps the Search dock action and no editor outside the author composition", () => {
    const navigationAction = <CatalogSearchNavigationAction />;
    renderToStaticMarkup(
      <ProductApplication
        comments={{ signInHref: "/dev/community" }}
        initialPlatform="phone"
        navigationAction={navigationAction}
        states={states}
      />,
    );
    expect(lastPreviewProps().navigationAction).toBe(navigationAction);
    expect(lastPreviewProps()).not.toHaveProperty("renderEditorOverlay");
    expect(lastPreviewProps()).not.toHaveProperty("headerStart");
  });
});
