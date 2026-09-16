// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { crop, frame } = vi.hoisted(() => ({
  crop: {
    props: null as null | {
      aspect: number;
      rotation: number;
      image: string;
      initialCroppedAreaPercentages?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      onCropAreaChange: (
        area: { x: number; y: number; width: number; height: number },
        pixels: { x: number; y: number; width: number; height: number },
      ) => void;
      onCropChange: (position: { x: number; y: number }) => void;
      onZoomChange?: (zoom: number) => void;
    },
  },
  frame: {
    release: null as null | (() => void),
    render: null as null | ((src: string, edit: unknown) => Promise<unknown>),
  },
}));
vi.mock("react-easy-crop", () => ({
  default: (props: NonNullable<typeof crop.props>) => {
    crop.props = props;
    return <div data-test-cropper="" />;
  },
}));
vi.mock("./edited-frame", () => ({
  renderEditedFrame: (src: string, edit: unknown) => frame.render!(src, edit),
}));

import { createPreviewCache } from "./bounded-preview";
import { CoverCropDialog } from "./cover-crop-dialog";
import { MediaEditDialog } from "./media-edit-dialog";
import { useBoundedPreview } from "./media-preview";

import type { PreviewEnvironment } from "./bounded-preview";
import type { BoundedPreviewState } from "./media-preview";
import type { CoverDraft, EditDraft } from "./media-ui-store";
import type { Root } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const buttonByText = (text: string) => {
  const found = [...document.querySelectorAll("button")].find(
    (button) =>
      (button.getAttribute("aria-label") ?? button.textContent) === text,
  );
  if (!found) throw new Error(`No button ${text}`);
  return found;
};

const click = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
  });
};

const radio = (label: string) =>
  [...document.querySelectorAll("label")]
    .find((element) => element.textContent === label)!
    .querySelector("input")!;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  crop.props = null;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  });
  window.history.replaceState({}, "", "/#editor");
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("MediaEditDialog", () => {
  it("still rotates without a preview and notes that Live motion follows", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    await act(async () =>
      root.render(
        <MediaEditDialog
          blob={null}
          edit={{ rotation: 0, crop: null }}
          itemNumber={2}
          kind="live"
          onApply={onApply}
          onClose={onClose}
          src={null}
        />,
      ),
    );
    expect(document.body.textContent).toContain(
      "实况照片的动态影像会使用相同的旋转和裁剪。",
    );
    expect(document.body.textContent).toContain("仍可旋转");
    expect(radio("1:1").closest("fieldset")!.disabled).toBe(true);
    await click(buttonByText("向左旋转 90°"));
    await click(buttonByText("完成"));
    expect(onApply).toHaveBeenCalledWith({ rotation: 270, crop: null });
    expect(onClose).toHaveBeenCalled();
  });

  it("reopens a stored crop at its preset and keeps it unless changed", async () => {
    const onApply = vi.fn();
    const stored = { x: 0.125, y: 0, width: 0.75, height: 1 };
    await act(async () =>
      root.render(
        <MediaEditDialog
          blob={null}
          edit={{ rotation: 0, crop: stored }}
          itemNumber={1}
          kind="static"
          knownSize={{ width: 4000, height: 3000 }}
          onApply={onApply}
          onClose={() => undefined}
          src="/api/community/publishing/media/example/display/base"
        />,
      ),
    );
    expect(radio("1:1").checked).toBe(true);
    expect(crop.props?.aspect).toBe(1);
    expect(crop.props?.initialCroppedAreaPercentages).toEqual({
      x: 12.5,
      y: 0,
      width: 75,
      height: 100,
    });
    expect(document.body.textContent).not.toContain("实况照片的动态影像");
    await click(buttonByText("完成"));
    expect(onApply).toHaveBeenCalledWith({ rotation: 0, crop: stored });

    // Choosing 16:9 without dragging stores the centered crop of that shape.
    await click(radio("16:9"));
    expect(crop.props?.aspect).toBeCloseTo(16 / 9);
    await click(buttonByText("完成"));
    expect(onApply).toHaveBeenLastCalledWith({
      rotation: 0,
      crop: { x: 0, y: 0.125, width: 1, height: 0.75 },
    });
  });
});

describe("MediaEditDialog crop intent (D2)", () => {
  /** What react-easy-crop reports by itself for a turned 4:3 image on a wide layout. */
  const mountReport = async () => {
    await act(async () => {
      crop.props!.onCropChange({ x: 0, y: 0 });
      crop.props!.onCropAreaChange(
        { x: 9.375, y: 9.375, width: 81.25, height: 81.25 },
        { x: 375, y: 281, width: 3250, height: 2437 },
      );
    });
  };

  const renderDialog = async (onApply: (edit: unknown) => void) =>
    act(async () =>
      root.render(
        <MediaEditDialog
          blob={null}
          edit={{ rotation: 0, crop: null }}
          itemNumber={3}
          kind="static"
          knownSize={{ width: 4032, height: 3024 }}
          onApply={onApply}
          onClose={() => undefined}
          src="/api/community/publishing/media/example/display/base"
        />,
      ),
    );

  it("stores a rotate-only edit without a crop, whatever the cropper reports on its own", async () => {
    const onApply = vi.fn();
    await renderDialog(onApply);
    await mountReport();
    await click(buttonByText("向右旋转 90°"));
    expect(radio("原始比例").checked).toBe(true);
    await mountReport();
    await click(buttonByText("完成"));
    expect(onApply).toHaveBeenCalledWith({ rotation: 90, crop: null });
  });

  it("stores the crop once the author moves or zooms it, and a full frame stays null", async () => {
    const onApply = vi.fn();
    await renderDialog(onApply);
    await click(buttonByText("向右旋转 90°"));
    await act(async () => {
      crop.props!.onZoomChange!(2);
      crop.props!.onCropAreaChange(
        { x: 25, y: 25, width: 50, height: 50 },
        { x: 756, y: 1008, width: 1512, height: 2016 },
      );
    });
    await click(buttonByText("完成"));
    expect(onApply).toHaveBeenLastCalledWith({
      rotation: 90,
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    });

    // Dragged back to the full frame within tolerance: no crop is stored.
    await act(async () => {
      crop.props!.onCropChange({ x: 3, y: 0 });
      crop.props!.onCropAreaChange(
        { x: 0.1, y: 0, width: 99.9, height: 100 },
        { x: 3, y: 0, width: 3021, height: 4032 },
      );
    });
    await click(buttonByText("完成"));
    expect(onApply).toHaveBeenLastCalledWith({ rotation: 90, crop: null });
  });
});

describe("CoverCropDialog", () => {
  it("keeps the full frame as the composition when the author leaves 原始比例 alone", async () => {
    frame.render = vi.fn(async () => ({
      url: "blob:edited-frame",
      size: { width: 300, height: 400 },
      release: vi.fn(),
    }));
    const onApply = vi.fn();
    await act(async () =>
      root.render(
        <CoverCropDialog
          blob={null}
          coverCrop={null}
          edit={{ rotation: 90, crop: null }}
          itemNumber={1}
          onApply={onApply}
          onClose={() => undefined}
          src="/api/community/publishing/media/example/display/base"
        />,
      ),
    );
    await act(async () => undefined);
    await act(async () => {
      crop.props!.onCropChange({ x: 0, y: 0 });
      crop.props!.onCropAreaChange(
        { x: 9.375, y: 9.375, width: 81.25, height: 81.25 },
        { x: 28, y: 37, width: 244, height: 325 },
      );
    });
    await click(buttonByText("完成"));
    expect(onApply).toHaveBeenCalledWith(null);
  });

  it("composes the card cover inside the edited frame and releases the preview", async () => {
    const release = vi.fn();
    frame.render = vi.fn(async () => ({
      url: "blob:edited-frame",
      size: { width: 300, height: 400 },
      release,
    }));
    const onApply = vi.fn();
    const edit = { rotation: 90 as const, crop: null };
    await act(async () =>
      root.render(
        <CoverCropDialog
          blob={null}
          coverCrop={null}
          edit={edit}
          itemNumber={3}
          onApply={onApply}
          onClose={() => undefined}
          src="/api/community/publishing/media/example/display/base"
        />,
      ),
    );
    await act(async () => undefined);
    expect(frame.render).toHaveBeenCalledWith(
      "/api/community/publishing/media/example/display/base",
      edit,
    );
    expect(crop.props?.image).toBe("blob:edited-frame");
    expect(crop.props?.rotation).toBe(0);
    expect(document.body.textContent).toContain("封面构图只影响作品卡片的显示");
    await click(radio("1:1"));
    await act(async () =>
      crop.props!.onCropAreaChange(
        { x: 0, y: 20, width: 100, height: 75 },
        { x: 0, y: 80, width: 300, height: 300 },
      ),
    );
    await click(buttonByText("完成"));
    expect(onApply).toHaveBeenCalledWith({
      x: 0,
      y: 0.2,
      width: 1,
      height: 0.75,
    });
    await click(buttonByText("还原"));
    await click(buttonByText("完成"));
    expect(onApply).toHaveBeenLastCalledWith(null);

    expect(release).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    expect(release).toHaveBeenCalledTimes(1);
    root = createRoot(container);
  });

  it("explains when the frame cannot be shown", async () => {
    frame.render = vi.fn(async () => {
      throw new Error("decode failed");
    });
    await act(async () =>
      root.render(
        <CoverCropDialog
          blob={null}
          coverCrop={null}
          edit={{ rotation: 0, crop: null }}
          itemNumber={1}
          onApply={() => undefined}
          onClose={() => undefined}
          src="/api/community/publishing/media/example/display/base"
        />,
      ),
    );
    await act(async () => undefined);
    expect(document.body.textContent).toContain("暂时无法显示这张图片");
  });
});

describe("unfinished dialog work", () => {
  it("continues a crop after the edit dialog remounts, and reports its work", async () => {
    const drafts: EditDraft[] = [];
    const props = {
      blob: null,
      edit: { rotation: 0 as const, crop: null },
      itemNumber: 1,
      kind: "static" as const,
      knownSize: { width: 4000, height: 3000 },
      onApply: vi.fn(),
      onClose: () => undefined,
      onDraftChange: (draft: EditDraft) => drafts.push(draft),
      src: "/api/community/publishing/media/example/display/base",
    };
    await act(async () => root.render(<MediaEditDialog {...props} />));
    await click(buttonByText("向右旋转 90°"));
    await click(radio("1:1"));
    await act(async () =>
      crop.props!.onCropAreaChange(
        { x: 0, y: 12.5, width: 100, height: 75 },
        { x: 0, y: 1, width: 3, height: 3 },
      ),
    );
    const saved = drafts.at(-1)!;
    expect(saved.rotation).toBe(90);

    // The layout swap: a new dialog with the saved work.
    await act(async () => root.unmount());
    root = createRoot(container);
    Object.assign(crop, { props: null });
    await act(async () =>
      root.render(<MediaEditDialog {...props} initialDraft={saved} />),
    );
    expect(crop.props?.rotation).toBe(90);
    expect(radio("1:1").checked).toBe(true);
    expect(crop.props?.initialCroppedAreaPercentages).toEqual({
      x: 0,
      y: 12.5,
      width: 100,
      height: 75,
    });
    await click(buttonByText("完成"));
    expect(props.onApply).toHaveBeenCalledWith({
      rotation: 90,
      crop: { x: 0, y: 0.125, width: 1, height: 0.75 },
    });
  });

  it("drops saved work made for a different edit", async () => {
    const stale: EditDraft = {
      basis: { rotation: 180, crop: null },
      rotation: 270,
      stored: null,
    };
    const onApply = vi.fn();
    await act(async () =>
      root.render(
        <MediaEditDialog
          blob={null}
          edit={{ rotation: 0, crop: null }}
          initialDraft={stale}
          itemNumber={1}
          kind="static"
          onApply={onApply}
          onClose={() => undefined}
          src={null}
        />,
      ),
    );
    expect(document.body.textContent).toContain("未旋转");
    await click(buttonByText("完成"));
    expect(onApply).toHaveBeenCalledWith({ rotation: 0, crop: null });
  });

  it("does not count the cropper's re-report of a stored crop as a change", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onApply = vi.fn();
    const onClose = vi.fn();
    const stored = { x: 0.125, y: 0, width: 0.75, height: 1 };
    await act(async () =>
      root.render(
        <MediaEditDialog
          blob={null}
          edit={{ rotation: 0, crop: stored }}
          itemNumber={1}
          kind="static"
          knownSize={{ width: 4000, height: 3000 }}
          onApply={onApply}
          onClose={onClose}
          src="/api/community/publishing/media/example/display/base"
        />,
      ),
    );
    // Pixel rounding inside the cropper.
    await act(async () =>
      crop.props!.onCropAreaChange(
        { x: 12.49, y: 0, width: 75.02, height: 100 },
        { x: 500, y: 0, width: 3001, height: 3000 },
      ),
    );
    await click(buttonByText("完成"));
    expect(onApply).toHaveBeenCalledWith({ rotation: 0, crop: stored });
    await act(async () => root.unmount());
    root = createRoot(container);

    const onCover = vi.fn();
    const closeCover = vi.fn();
    frame.render = vi.fn(async () => ({
      url: "blob:edited-frame",
      size: { width: 400, height: 300 },
      release: () => undefined,
    }));
    const composition = { x: 0.125, y: 0, width: 0.75, height: 1 };
    const drafts: CoverDraft[] = [];
    await act(async () =>
      root.render(
        <CoverCropDialog
          blob={null}
          coverCrop={composition}
          edit={{ rotation: 0, crop: null }}
          itemNumber={1}
          onApply={onCover}
          onClose={closeCover}
          onDraftChange={(draft) => drafts.push(draft)}
          src="/api/community/publishing/media/example/display/base"
        />,
      ),
    );
    await act(async () => undefined);
    await act(async () =>
      crop.props!.onCropAreaChange(
        { x: 12.51, y: 0, width: 74.98, height: 100 },
        { x: 50, y: 0, width: 300, height: 300 },
      ),
    );
    // 返回 closes without asking: nothing changed.
    await click(buttonByText("返回"));
    expect(confirm).not.toHaveBeenCalled();
    expect(drafts.at(-1)?.basisCrop).toEqual(composition);
  });

  it("says when no preview will come for an item waiting on the author", async () => {
    await act(async () =>
      root.render(
        <MediaEditDialog
          blob={null}
          derivativeExpected={false}
          edit={{ rotation: 0, crop: null }}
          itemNumber={1}
          kind="static"
          onApply={() => undefined}
          onClose={() => undefined}
          src={null}
        />,
      ),
    );
    expect(document.body.textContent).toContain(
      "这台设备无法预览这张图片，仍可旋转。",
    );
    expect(document.body.textContent).not.toContain("处理完成后");
  });
});

describe("bounded previews in components", () => {
  it("show the bounded copy, report loading until it exists, and release it on replacement and unmount", async () => {
    let sequence = 0;
    const revoked: string[] = [];
    const timers: (() => void)[] = [];
    const decode = vi.fn(async () => ({
      width: 384,
      height: 288,
      close: vi.fn(),
    }));
    const environment: PreviewEnvironment = {
      decoder: () => decode as never,
      createCanvas: () =>
        ({
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: () => undefined }),
          toBlob: (callback: (blob: Blob | null) => void) =>
            callback(new Blob(["small"], { type: "image/jpeg" })),
        }) as unknown as HTMLCanvasElement,
      createObjectURL: () => `blob:preview-${(sequence += 1)}`,
      revokeObjectURL: (url) => revoked.push(url),
      setTimeout: (callback) => timers.push(callback),
      clearTimeout: () => undefined,
    };
    const cache = createPreviewCache(environment);
    const seen: BoundedPreviewState[] = [];
    const Probe = ({ blob }: { readonly blob: Blob | null }) => {
      seen.push(useBoundedPreview(blob, 384, cache));
      return null;
    };
    const first = new Blob(["a"], { type: "image/jpeg" });
    const second = new Blob(["b"], { type: "image/jpeg" });
    await act(async () => root.render(<Probe blob={first} />));
    expect(seen[0]).toEqual({ status: "loading", url: null, size: null });
    await act(async () => undefined);
    expect(seen.at(-1)).toEqual({
      status: "ready",
      url: "blob:preview-1",
      size: { width: 384, height: 288 },
    });
    await act(async () => root.render(<Probe blob={second} />));
    await act(async () => undefined);
    expect(seen.at(-1)?.url).toBe("blob:preview-2");
    // Released after a moment (a remount of the same tile keeps it).
    for (const run of timers.splice(0)) run();
    expect(revoked).toEqual(["blob:preview-1"]);
    await act(async () => root.render(<Probe blob={null} />));
    expect(seen.at(-1)).toEqual({ status: "idle", url: null, size: null });
    for (const run of timers.splice(0)) run();
    expect(revoked).toEqual(["blob:preview-1", "blob:preview-2"]);
  });
});
