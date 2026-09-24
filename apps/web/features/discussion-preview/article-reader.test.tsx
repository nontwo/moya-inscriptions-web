// @vitest-environment jsdom
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * content-community-completion-v1: a live comment section supplied to the
 * accepted readers takes the same comment column as the preview's comments
 * (max width, centred, side padding and room for the fixed composer). Without
 * it the live Article discussion ran edge to edge.
 */
vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => ({ platform: "desktop" }),
}));
vi.mock("../shell/horizontal-pager", () => ({
  HorizontalPager: ({ panels }: { panels: Record<string, ReactNode> }) => (
    <div>
      {Object.entries(panels).map(([key, panel]) => (
        <section key={key} data-reading-page={key}>
          {panel}
        </section>
      ))}
    </div>
  ),
}));
import { ArticleReader, PostReader } from "./article-reader";
import styles from "./discussion-preview.module.css";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let node: HTMLDivElement;
beforeEach(() => {
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

const live = <div data-live-section="">实时评论</div>;
const column = () =>
  document.querySelector("[data-live-section]")?.parentElement ?? null;

describe("Accepted readers with a live comment section", () => {
  it("gives the Article reader's live comments the accepted comment column", async () => {
    await act(async () =>
      root!.render(
        <ArticleReader id="article-1" comments={live} onOpenProfile={() => {}}>
          <p>正文</p>
        </ArticleReader>,
      ),
    );
    expect(document.querySelector("[data-live-section]")).not.toBeNull();
    expect(column()?.className).toBe(styles.comments);
  });

  it("gives the post reader's live comments the accepted comment column", async () => {
    await act(async () =>
      root!.render(
        <PostReader id="post-1" comments={live} onOpenProfile={() => {}}>
          <p>正文</p>
        </PostReader>,
      ),
    );
    expect(column()?.className).toBe(styles.comments);
  });
});
