// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { author, shell } = vi.hoisted(() => ({
  author: {
    checking: false,
    viewer: null as { id: string } | null,
    signInHref: "/dev/community",
  },
  shell: { openEditor: vi.fn(), openProfile: vi.fn() },
}));
vi.mock("../authors/author-context", () => ({ useAuthors: () => author }));
vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => shell,
}));

import {
  PublishingEntryProvider,
  renderPublishingEditorOverlay,
  usePublishingEntry,
} from "./publishing-entry";

import type { Root } from "react-dom/client";
import type { EditorTarget } from "../product-shell/product-history";
import type { ProductShellEditorOverlayControls } from "../product-shell/product-shell";
import type { PublishingEditorRenderer } from "./publishing-entry";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const controls = (): ProductShellEditorOverlayControls => ({
  backButtonRef: createRef<HTMLButtonElement>(),
  close: vi.fn(),
  completeWith: vi.fn(),
  registerLeaveGuard: vi.fn(() => () => undefined),
  replaceTarget: vi.fn(),
});
const render = (
  target: EditorTarget,
  shellControls: ProductShellEditorOverlayControls,
  renderEditor?: PublishingEditorRenderer,
) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() =>
    root.render(
      <PublishingEntryProvider
        {...(renderEditor === undefined ? {} : { renderEditor })}
      >
        {renderPublishingEditorOverlay(target, shellControls)}
      </PublishingEntryProvider>,
    ),
  );
  return container;
};

beforeEach(() => {
  author.checking = false;
  author.viewer = { id: `user-${"a".repeat(32)}` };
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("Publishing editor host", () => {
  it("owns a return bar bound to the shell's back ref and close", () => {
    const shellControls = controls();
    const container = render({ type: "new" }, shellControls);
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("发布作品");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    const back = container.querySelector<HTMLButtonElement>(
      'header button[aria-label="返回"]',
    );
    expect(back).not.toBeNull();
    expect(shellControls.backButtonRef.current).toBe(back);
    act(() => back?.click());
    expect(shellControls.close).toHaveBeenCalledOnce();
    // No editor is registered yet: the host shows no invented content.
    expect(
      container.querySelector("[data-publishing-editor-body]")
        ?.childElementCount,
    ).toBe(0);
  });

  it("renders the registered editor for a signed-in author with the shell controls", () => {
    const shellControls = controls();
    const target = {
      type: "draft",
      id: `work-draft-${"c".repeat(32)}`,
    } as const;
    const renderEditor = vi.fn<PublishingEditorRenderer>(() => (
      <p data-registered-editor="">editor</p>
    ));
    const container = render(target, shellControls, renderEditor);
    expect(renderEditor).toHaveBeenCalledWith(target, shellControls);
    expect(container.querySelector("[data-registered-editor]")).not.toBeNull();
    expect(
      container.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    ).toBe("编辑草稿");
  });

  it("never renders the editor for a guest or while the session is checked", () => {
    const renderEditor = vi.fn<PublishingEditorRenderer>(() => (
      <p data-registered-editor="">editor</p>
    ));
    author.viewer = null;
    const guest = render(
      { type: "work", id: `work-${"b".repeat(32)}` },
      controls(),
      renderEditor,
    );
    expect(renderEditor).not.toHaveBeenCalled();
    expect(
      guest.querySelector<HTMLAnchorElement>("a")?.getAttribute("href"),
    ).toBe("/dev/community");
    expect(
      guest.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    ).toBe("编辑作品");

    author.checking = true;
    const checking = render({ type: "new" }, controls(), renderEditor);
    expect(renderEditor).not.toHaveBeenCalled();
    expect(checking.querySelector("a")).toBeNull();
  });
  it("reports whether the editor opened and keeps its opener stable", () => {
    const opener = document.createElement("button");
    const entries: ReturnType<typeof usePublishingEntry>[] = [];
    const Probe = ({ label }: { readonly label: string }) => {
      entries.push(usePublishingEntry());
      return <span>{label}</span>;
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const renderProbe = (label: string) =>
      act(() =>
        root.render(
          <PublishingEntryProvider>
            <Probe label={label} />
          </PublishingEntryProvider>,
        ),
      );
    renderProbe("first");
    renderProbe("second");
    expect(entries.at(-1)?.openEditor).toBe(entries[0]?.openEditor);

    shell.openEditor.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(entries.at(-1)?.openEditor({ type: "new" }, opener)).toBe(true);
    expect(entries.at(-1)?.openEditor({ type: "new" }, opener)).toBe(false);
    expect(shell.openProfile).not.toHaveBeenCalled();

    author.viewer = null;
    renderProbe("guest");
    expect(entries.at(-1)?.openEditor({ type: "new" }, opener)).toBe(false);
    expect(shell.openProfile).toHaveBeenCalledExactlyOnceWith(null, opener);
    expect(shell.openEditor).toHaveBeenCalledTimes(2);
  });
});
