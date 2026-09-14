// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { author, crop } = vi.hoisted(() => ({
  author: {
    viewer: { id: `user-${"a".repeat(32)}` } as { id: string } | null,
    checking: false,
  },
  crop: {
    props: null as null | {
      aspect: number;
      rotation: number;
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
    },
  },
}));
vi.mock("../../../authors/author-context", () => ({
  useAuthors: () => author,
}));
vi.mock("react-easy-crop", () => ({
  default: (props: NonNullable<typeof crop.props>) => {
    crop.props = props;
    return <div data-test-cropper="" />;
  },
}));

import { identifyFiles } from "../../import-grouping";
import {
  IDENTIFIER,
  OTHER_IDENTIFIER,
  animatedGif,
  fileOf,
  heic,
  jpeg,
  motion,
  png,
} from "../../parsers/synthetic-media.test-support";
import {
  PublishingProvider,
  useUploadSession,
} from "../../publishing-provider";
import { UploadManager } from "../../upload-manager";
import {
  ACCOUNT,
  DRAFT_ID,
  SESSION_ID,
  absentMetadata,
  fakeClient,
  fakePreprocess,
  fakeTransfer,
  manualTimers,
  settle,
  uuid,
} from "../../upload-manager.test-support";
import {
  EditorSessionProvider,
  useEditorSessionRegistry,
} from "../editor/editor-session-provider";
import { MediaSection } from "./media-section";

import type {
  PublishingClientPort,
  PublishingServices,
} from "../../publishing-runtime";
import type { EditorSessionStore } from "../editor/editor-session-state";
import type {
  PublishingDraft,
  PublishingMediaItem,
  PublishingReadiness,
  WorkDraftContent,
  PublishingHolder,
} from "@moya/contracts";
import type { Root } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface FixtureOptions {
  readonly maxItems?: number;
  readonly preprocess?: () => ReturnType<typeof fakePreprocess>;
}

const fixture = ({ maxItems = 50, preprocess }: FixtureOptions = {}) => {
  const uploads = fakeClient();
  const transfer = fakeTransfer();
  const timers = manualTimers();
  const client = {
    ...uploads.client,
    limits: vi.fn(async () => ({
      maxItems,
      originalItemMaxBytes: 1_000_000,
      standardComponentMaxBytes: 1_000_000,
      titleMax: 200,
      bodyMax: 10_000,
    })),
    createSession: vi.fn(async () => ({
      id: SESSION_ID,
      state: "active" as const,
      workId: null,
      leaseExpiresAt: "2026-09-13T12:00:00.000Z",
      createdAt: "2026-09-13T12:00:00.000Z",
    })),
    heartbeatSession: vi.fn(),
    discardSession: vi.fn(async () => ({ discarded: true as const })),
    saveDraft: vi.fn(),
    saveDraftNow: vi.fn(),
    createDraft: vi.fn(),
    draft: vi.fn(),
    readiness: vi.fn<
      (
        holder: PublishingHolder,
        content: WorkDraftContent,
      ) => Promise<PublishingReadiness>
    >(async () => ({
      ready: true,
      pendingItemKeys: [],
      failedItemKeys: [],
      editKeys: {},
    })),
  };
  const services: PublishingServices = {
    client: client as unknown as PublishingClientPort,
    currentAccount: () => ACCOUNT,
    requestId: uuid,
    createTransfer: () => transfer.transfer,
    createPreprocess: () => (preprocess ?? fakePreprocess)(),
    createHasher: () => null,
    createRecovery: () => null,
    identifyFiles: (files) => identifyFiles(files),
    preprocessConcurrency: () => 1,
    transferConcurrency: 2,
    deviceClass: () => "phone",
    timers: timers.timers,
    metadata: absentMetadata,
  };
  return { services, uploads, transfer, timers, client };
};

type Layout = "phone" | "desktop";

const probe: {
  store: EditorSessionStore | null;
  upload: ReturnType<typeof useUploadSession> | null;
  setView: ((view: { layout: Layout; shown: boolean }) => void) | null;
} = { store: null, upload: null, setView: null };

/** The editor host: a step change unmounts the section, a layout swap remounts it. */
const Editor = ({ layout }: { readonly layout: Layout }) => {
  const registry = useEditorSessionRegistry();
  const upload = useUploadSession();
  const [store] = useState(() => registry.create(ACCOUNT, { type: "new" }));
  const [view, setView] = useState({ layout, shown: true });
  useEffect(() => registry.mount(store), [registry, store]);
  probe.store = store;
  probe.upload = upload;
  probe.setView = setView;
  return view.shown ? (
    <MediaSection
      key={view.layout}
      layout={view.layout}
      onSkip={() => store.setStep("text")}
      sessionKey={store.key}
    />
  ) : (
    <p data-other-step="" />
  );
};

let container: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof fixture>;

const render = async (
  layout: Layout = "phone",
  options: FixtureOptions & { readonly draft?: PublishingDraft } = {},
) => {
  current = fixture(options);
  await act(async () => {
    root.render(
      <PublishingProvider services={current.services}>
        <EditorSessionProvider>
          <Editor layout={layout} />
        </EditorSessionProvider>
      </PublishingProvider>,
    );
    await settle();
  });
  // The editor host starts the runtime session once the account is known.
  await act(async () => {
    probe.upload!.startSession(
      options.draft === undefined
        ? { target: { type: "new" }, saveMode: "unsaved" }
        : {
            target: { type: "draft", id: options.draft.id },
            saveMode: "saved",
            draft: options.draft,
          },
    );
    await settle();
  });
};

const setView = async (view: { layout: Layout; shown: boolean }) => {
  await act(async () => {
    probe.setView!(view);
    await settle();
  });
};

const announcer = () =>
  container.querySelector("[data-media-announcer]")?.textContent ?? "";

const flush = async (rounds = 3) => {
  for (let round = 0; round < rounds; round += 1)
    await act(async () => {
      await settle();
    });
};

const until = async (condition: () => boolean, rounds = 20) => {
  for (let round = 0; round < rounds && !condition(); round += 1)
    await flush(1);
  expect(condition()).toBe(true);
};

const setFiles = async (input: HTMLInputElement, files: File[]) => {
  Object.defineProperty(input, "files", { configurable: true, value: files });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  });
};

const pickerInput = () =>
  container.querySelector<HTMLInputElement>(
    "[data-media-picker] input[type=file]",
  )!;

const buttonByText = (text: string, scope: ParentNode = document.body) => {
  const found = [...scope.querySelectorAll("button")].find(
    (button) =>
      button.textContent === text || button.getAttribute("aria-label") === text,
  );
  if (!found) throw new Error(`No button ${text}`);
  return found;
};

const click = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
    await settle();
  });
};

const tiles = () =>
  [...container.querySelectorAll<HTMLElement>("[data-media-key]")].map(
    (tile) => ({
      key: tile.dataset.mediaKey!,
      handle: tile
        .querySelector("[data-media-handle]")!
        .getAttribute("aria-label"),
      status: tile.dataset.mediaStatus,
    }),
  );

const storeKeys = () => probe.store!.get().items.map((item) => item.key);

const addStatic = async (count: number) => {
  await setFiles(
    pickerInput(),
    Array.from({ length: count }, (_, index) =>
      fileOf(jpeg({ width: 4 + index }), `photo-${index}.jpg`),
    ),
  );
  await until(() => container.querySelector("[data-media-staging]") !== null);
  await click(buttonByText(`添加 ${count} 项（标准）`));
  await until(() => tiles().length === count);
};

const registered = () =>
  probe.store!.get().items.every((item) => item.itemId !== null);

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
  probe.store = null;
  probe.upload = null;
  probe.setView = null;
  vi.restoreAllMocks();
});

describe("MediaSection staging", () => {
  it("requires explicit choices before items are added under the batch mode", async () => {
    await render();
    await setFiles(pickerInput(), [
      fileOf(jpeg({}), "plain.jpg"),
      fileOf(heic({ identifier: IDENTIFIER }), "IMG_0001.HEIC"),
      fileOf(heic({ identifier: OTHER_IDENTIFIER }), "IMG_0002.HEIC"),
      fileOf(animatedGif(), "moving.gif"),
    ]);
    await until(
      () =>
        container.querySelectorAll("[data-staged-status=needs_counterpart]")
          .length === 2,
    );
    const staging = container.querySelector<HTMLElement>(
      "[data-media-staging]",
    )!;
    expect(staging.textContent).toContain(
      "可添加 1 项，2 项需要选择，1 项无法添加",
    );
    expect(buttonByText("添加 1 项（标准）", staging).disabled).toBe(false);

    const [first, second] = [
      ...staging.querySelectorAll<HTMLElement>(
        "[data-staged-status=needs_counterpart]",
      ),
    ];
    const counterpart = staging.querySelector<HTMLInputElement>(
      'input[aria-label="补选实况照片的另一部分"]',
    )!;
    // A motion file of another Live Photo is refused at the entry.
    await click(buttonByText("补选动态文件", first!));
    await setFiles(counterpart, [
      fileOf(motion({ identifier: OTHER_IDENTIFIER }), "other.MOV"),
    ]);
    await until(() => first!.querySelector("[role=alert]") !== null);
    expect(first!.querySelector("[role=alert]")!.textContent).toBe(
      "所选视频与这张照片不属于同一张实况照片",
    );
    // The matching motion completes the pair.
    await click(buttonByText("补选动态文件", first!));
    await setFiles(counterpart, [
      fileOf(motion({ identifier: IDENTIFIER }), "IMG_0001.MOV"),
    ]);
    await until(
      () =>
        container.querySelectorAll("[data-staged-status=ready]").length === 2,
    );
    // The second still is kept as a static photo; the GIF is removed.
    await click(buttonByText("作为静态照片", second!));
    const gif = container.querySelector<HTMLElement>(
      "[data-staged-status=unsupported]",
    )!;
    expect(gif.textContent).toContain("暂不支持动图");
    await click(buttonByText("移除", gif));
    expect(
      container.querySelector("[data-staged-status=unsupported]"),
    ).toBeNull();

    // 原图画质 from the session applies to this batch and resets afterwards.
    await act(async () => probe.store!.setOriginalNext(true));
    const confirm = buttonByText("添加 3 项（原图）");
    await click(confirm);
    await until(() => tiles().length === 3);
    expect(container.querySelector("[data-media-staging]")).toBeNull();
    const state = probe.store!.get();
    expect(state.originalNext).toBe(false);
    expect(state.items.map((item) => [item.kind, item.qualityMode])).toEqual([
      ["static", "original"],
      ["live", "original"],
      ["static", "original"],
    ]);
    expect(tiles().map((tile) => tile.handle)).toEqual([
      "第 1 项，照片，拖动可调整顺序",
      "第 2 项，实况照片，拖动可调整顺序",
      "第 3 项，照片，拖动可调整顺序",
    ]);
    expect(
      container.querySelectorAll("[data-media-quality=original]"),
    ).toHaveLength(3);
  });

  it("labels clipboard images as not camera originals", async () => {
    await render("desktop");
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [fileOf(png(), "image.png", "image/png")],
        items: [],
        types: ["Files"],
      },
    });
    await act(async () => {
      document.body.dispatchEvent(event);
      await settle();
    });
    await until(() => container.querySelector("[data-staged-status]") !== null);
    expect(
      container.querySelector("[data-media-staging]")!.textContent,
    ).toContain("来自剪贴板");
    await click(buttonByText("添加 1 项（标准）"));
    await until(() => tiles().length === 1);
    expect(container.querySelector("[data-media-key]")!.textContent).toContain(
      "来自剪贴板",
    );
  });

  it("keeps the clipboard label of restored items from the draft content", async () => {
    const readyId = `media-item-${"6".repeat(32)}`;
    const stamp = "2026-09-13T12:00:00.000Z";
    const clipboardItem = (
      key: string,
      itemId: string | null,
    ): PublishingDraft["content"]["items"][number] =>
      itemId === null
        ? {
            key,
            itemId: null,
            kind: "static",
            qualityMode: "standard",
            edit: { rotation: 0, crop: null },
            pendingLabel: "photo",
            origin: "clipboard",
          }
        : {
            key,
            itemId,
            kind: "static",
            qualityMode: "standard",
            edit: { rotation: 0, crop: null },
            origin: "clipboard",
          };
    const draft: PublishingDraft = {
      id: DRAFT_ID,
      kind: "new",
      workId: null,
      baseRevisionId: null,
      revision: 2,
      content: {
        title: "",
        body: "",
        authorship: { kind: "original" },
        visibility: "public",
        items: [
          clipboardItem("pasted-ready", readyId),
          clipboardItem("pasted-missing", null),
          {
            key: "picked",
            itemId: null,
            kind: "static",
            qualityMode: "standard",
            edit: { rotation: 0, crop: null },
            pendingLabel: "photo",
          },
        ],
        coverKey: null,
        coverCrop: null,
      },
      mediaItems: [readyItem(readyId)],
      conflict: null,
      deviceClass: "desktop",
      createdAt: stamp,
      updatedAt: stamp,
    };
    await render("desktop", { draft });
    const labelled = () =>
      [...container.querySelectorAll<HTMLElement>("[data-media-key]")]
        .filter((tile) => tile.querySelector("[data-media-clipboard]") !== null)
        .map((tile) => tile.dataset.mediaKey);
    // The account's items alone (no manager entry on this browser).
    await act(async () => {
      probe.store!.adoptContent(draft.content, draft.mediaItems);
      await settle();
    });
    await until(() => tiles().length === 3);
    expect(labelled()).toEqual(["pasted-ready", "pasted-missing"]);
    // Reopened on this browser: the manager's entries keep it too.
    await act(async () => {
      await probe.upload!.restoreDraftMedia(draft);
      await settle();
    });
    await until(() => tiles()[1]?.status === "missing_local");
    expect(labelled()).toEqual(["pasted-ready", "pasted-missing"]);
    expect(
      container.querySelector(
        '[data-media-key="pasted-missing"] [data-media-clipboard]',
      )?.textContent,
    ).toBe("来自剪贴板");
    // The label never becomes author content that disappears on sync.
    expect(probe.store!.get().items.map((item) => item.origin ?? null)).toEqual(
      ["clipboard", "clipboard", null],
    );
  });

  it("offers 跳过，只发布文字 only while the phone step has no media", async () => {
    await render();
    await click(buttonByText("跳过，只发布文字"));
    expect(probe.store!.get().step).toBe("text");
    await addStatic(1);
    expect(container.querySelector("[data-media-skip]")).toBeNull();
  });
});

describe("MediaSection strip", () => {
  it("reorders with buttons and keyboard while keys, identities and numbers stay consistent", async () => {
    await render();
    await addStatic(3);
    await until(registered);
    const [a, b, c] = storeKeys();
    const ids = new Map(
      probe.store!.get().items.map((item) => [item.key, item.itemId]),
    );

    await click(buttonByText("下移第 1 项"));
    expect(storeKeys()).toEqual([b, a, c]);
    expect(tiles().map((tile) => tile.key)).toEqual([b, a, c]);
    expect(tiles().map((tile) => tile.handle?.split("，")[0])).toEqual([
      "第 1 项",
      "第 2 项",
      "第 3 项",
    ]);

    // Alt + ↑ on the drag handle moves without dragging.
    const handleC = container.querySelector<HTMLElement>(
      `[data-media-handle="${c}"]`,
    )!;
    await act(async () => {
      handleC.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowUp",
          code: "ArrowUp",
          altKey: true,
          bubbles: true,
        }),
      );
      await settle();
    });
    expect(storeKeys()).toEqual([b, c, a]);

    // At the first position 上移 is disabled and focus stays in the tile.
    await click(buttonByText("上移第 2 项"));
    expect(storeKeys()).toEqual([c, b, a]);
    expect(buttonByText("上移第 1 项").disabled).toBe(true);
    expect(document.activeElement?.getAttribute("data-media-action")).toBe(
      "down",
    );
    for (const item of probe.store!.get().items)
      expect(item.itemId).toBe(ids.get(item.key));
    // Screen readers hear the product language, and every move.
    expect(
      container
        .querySelector("[data-media-handle]")!
        .getAttribute("aria-roledescription"),
    ).toBe("可排序的图片");
    expect(announcer()).toBe("第 2 项已移到第 1 位");
  });

  it("sorts with the dnd-kit keyboard sensor", async () => {
    await render();
    await addStatic(3);
    const [a, b, c] = storeKeys();
    // Layout for the sensor: rows stacked 120px apart.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const tile = this.closest("[data-media-key]");
        const index = tile
          ? [...container.querySelectorAll("[data-media-key]")].indexOf(tile)
          : -1;
        const top = index < 0 ? 0 : 100 + index * 120;
        const height = index < 0 ? 0 : 100;
        return {
          x: 0,
          y: top,
          top,
          left: 0,
          width: index < 0 ? 0 : 300,
          height,
          right: index < 0 ? 0 : 300,
          bottom: top + height,
          toJSON: () => ({}),
        } as DOMRect;
      },
    );
    Element.prototype.scrollIntoView ??= () => undefined;
    const handle = container.querySelector<HTMLElement>(
      `[data-media-handle="${a}"]`,
    )!;
    handle.focus();
    const press = async (target: EventTarget, code: string) => {
      await act(async () => {
        target.dispatchEvent(
          new KeyboardEvent("keydown", { key: code, code, bubbles: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    };
    await press(handle, "Space");
    await press(document, "ArrowDown");
    await press(document, "Space");
    await flush(1);
    expect(storeKeys()).toEqual([b, a, c]);
  });

  it("keeps an independent cover and tells the author about the fallback", async () => {
    await render();
    await addStatic(3);
    const [a, b, c] = storeKeys();
    expect(
      container
        .querySelector(`[data-media-key="${a}"] [data-media-cover]`)!
        .getAttribute("data-media-cover"),
    ).toBe("default");

    await click(buttonByText("设为封面：第 3 项"));
    expect(probe.store!.get().coverKey).toBe(c);
    await click(buttonByText("上移第 3 项"));
    expect(storeKeys()).toEqual([a, c, b]);
    expect(probe.store!.get().coverKey).toBe(c);
    expect(
      [...container.querySelectorAll("[data-media-cover]")].map((badge) => [
        badge.closest<HTMLElement>("[data-media-key]")!.dataset.mediaKey,
        badge.getAttribute("data-media-cover"),
      ]),
    ).toEqual([[c, "chosen"]]);

    await click(buttonByText("移除第 2 项"));
    expect(probe.store!.get().coverKey).toBe(null);
    expect(storeKeys()).toEqual([a, b]);
    expect(
      container.querySelector("[data-media-notice]")!.textContent,
    ).toContain("封面已移除，现在以第 1 项作为封面");
    // The notice is also said, politely, with what caused it.
    expect(announcer()).toBe(
      "已移除第 2 项。封面已移除，现在以第 1 项作为封面",
    );
    expect(
      container
        .querySelector(`[data-media-key="${a}"] [data-media-cover]`)!
        .getAttribute("data-media-cover"),
    ).toBe("default");
  });

  it("cancels a removed item through the runtime and never re-adds it", async () => {
    await render();
    await addStatic(2);
    await until(registered);
    const [a, b] = probe.store!.get().items;
    await click(buttonByText("移除第 1 项"));
    expect(current.uploads.client.cancelItem).toHaveBeenCalledWith(
      a!.itemId,
      expect.objectContaining({ requestId: expect.any(String) }),
    );
    await flush();
    expect(storeKeys()).toEqual([b!.key]);
    expect(probe.upload!.draftItems().map((item) => item.key)).toEqual([
      b!.key,
    ]);
    expect(tiles().map((tile) => tile.handle)).toEqual([
      "第 1 项，照片，拖动可调整顺序",
    ]);
    expect(document.activeElement?.getAttribute("data-media-handle")).toBe(
      b!.key,
    );
  });

  it("shows a failed transfer with a retry that restarts only that component", async () => {
    await render();
    await addStatic(1);
    await until(() => current.transfer.starts.length === 1);
    const retry = vi.spyOn(UploadManager.prototype, "retryComponent");
    await act(async () => {
      current.transfer.starts[0]!.callbacks.onSettled({
        status: 0,
        responseText: "",
        stalled: false,
      });
      await settle();
    });
    await until(() => tiles()[0]?.status === "failed");
    const tile = container.querySelector<HTMLElement>("[data-media-key]")!;
    expect(tile.textContent).toContain("失败");
    await click(buttonByText("重试第 1 项"));
    expect(retry).toHaveBeenCalledWith(storeKeys()[0], "still");
    await until(() => current.transfer.starts.length === 2);
  });

  it("shows LIVE only once a verified Live Photo is ready", async () => {
    await render();
    await setFiles(pickerInput(), [
      fileOf(heic({ identifier: IDENTIFIER }), "IMG_1.HEIC"),
      fileOf(motion({ identifier: IDENTIFIER }), "IMG_1.MOV"),
      fileOf(jpeg({}), "plain.jpg"),
    ]);
    await until(() => container.querySelector("[data-media-staging]") !== null);
    await act(async () => probe.store!.setOriginalNext(true));
    await click(buttonByText("添加 2 项（原图）"));
    await until(() => current.transfer.starts.length === 2, 40);
    const [live, still] = probe.store!.get().items;
    expect(live!.kind).toBe("live");

    // Every component arrives (two transfers at a time).
    let settled = 0;
    while (settled < 3) {
      await until(() => current.transfer.starts.length > settled, 40);
      const start = current.transfer.starts[settled]!;
      settled += 1;
      const componentId = start.request.endpoint.split("/").at(-1)!;
      const [itemId, item] = [...current.uploads.items].find(([, entry]) =>
        entry.components.some((component) => component.id === componentId),
      )!;
      const role = item.components.find(
        (component) => component.id === componentId,
      )!.role;
      await act(async () => {
        start.callbacks.onSettled({
          status: 200,
          responseText: current.uploads.receive(itemId, role),
          stalled: false,
        });
        await settle();
      });
    }
    const liveId = probe.upload!.draftItems()[0]!.itemId!;
    const stillId = probe.upload!.draftItems()[1]!.itemId!;
    await until(() =>
      tiles().every(
        (tile) => tile.status === "uploaded" || tile.status === "processing",
      ),
    );
    expect(container.querySelector("[data-media-live]")).toBeNull();

    current.uploads.makeReady(liveId);
    current.uploads.makeReady(stillId);
    await act(async () => {
      current.timers.fireAll();
      await settle();
    });
    await until(() => tiles().every((tile) => tile.status === "ready"));
    const badges = [...container.querySelectorAll("[data-media-live]")];
    expect(badges).toHaveLength(1);
    // Read as 实况照片; LIVE itself is only seen.
    expect(badges[0]!.textContent).toBe("LIVE实况照片");
    expect(badges[0]!.querySelector("[aria-hidden=true]")!.textContent).toBe(
      "LIVE",
    );
    expect(
      badges[0]!.closest<HTMLElement>("[data-media-key]")!.dataset.mediaKey,
    ).toBe(live!.key);
    expect(still!.kind).toBe("static");
  });

  it("applies rotation and crop from the edit dialog and reverts to the full frame", async () => {
    await render();
    await addStatic(1);
    await until(registered);
    const itemId = probe.store!.get().items[0]!.itemId!;
    await until(() => current.transfer.starts.length === 1);
    await act(async () => {
      current.transfer.starts[0]!.callbacks.onSettled({
        status: 200,
        responseText: current.uploads.receive(itemId, "still"),
        stalled: false,
      });
      await settle();
    });
    current.uploads.makeReady(itemId);
    await act(async () => {
      current.timers.fireAll();
      await settle();
    });
    await until(() => tiles()[0]?.status === "ready");

    // A chosen cover with a composition: an edit of that item resets it.
    await click(buttonByText("设为封面：第 1 项"));
    await act(async () =>
      probe.store!.setCoverCrop({ x: 0, y: 0, width: 0.5, height: 0.5 }),
    );

    await click(buttonByText("编辑第 1 项"));
    const dialog = document.querySelector<HTMLElement>(
      "[data-media-edit-dialog]",
    )!;
    expect(dialog).not.toBeNull();
    expect(crop.props?.rotation).toBe(0);
    await click(buttonByText("向右旋转 90°", dialog));
    expect(crop.props?.rotation).toBe(90);
    const square = [...dialog.querySelectorAll("label")].find(
      (label) => label.textContent === "1:1",
    )!;
    await click(square.querySelector("input")!);
    // Presentation 4 × 3 turned: a 3 × 4 frame; 1:1 is the centered square.
    expect(crop.props?.aspect).toBe(1);
    await act(async () =>
      crop.props!.onCropAreaChange(
        { x: 0, y: 12.5, width: 100, height: 75 },
        { x: 0, y: 1, width: 3, height: 3 },
      ),
    );
    await click(buttonByText("完成", dialog));
    expect(document.querySelector("[data-media-edit-dialog]")).toBeNull();
    const edited = probe.store!.get();
    expect(edited.items[0]!.edit).toEqual({
      rotation: 90,
      crop: { x: 0, y: 0.125, width: 1, height: 0.75 },
    });
    expect(edited.coverCrop).toBe(null);
    expect(
      container.querySelector("[data-media-notice]")!.textContent,
    ).toContain("封面构图已恢复为完整画面");

    await click(buttonByText("编辑第 1 项"));
    const reopened = document.querySelector<HTMLElement>(
      "[data-media-edit-dialog]",
    )!;
    expect(
      [...reopened.querySelectorAll<HTMLInputElement>("input[type=radio]")]
        .filter((input) => input.checked)
        .map((input) => input.value),
    ).toEqual(["1:1"]);
    await click(buttonByText("还原", reopened));
    await click(buttonByText("完成", reopened));
    expect(probe.store!.get().items[0]!.edit).toEqual({
      rotation: 0,
      crop: null,
    });
  });
});

const readyItem = (id: string): PublishingMediaItem => ({
  id,
  kind: "static",
  qualityMode: "standard",
  state: "ready",
  failureCode: null,
  components: [
    {
      id: `media-component-${"5".repeat(32)}`,
      role: "still",
      state: "verified",
      byteSize: 9,
      receivedBytes: 9,
    },
  ],
  presentation: { width: 4, height: 3 },
  media: {
    thumbSrc: `/api/community/publishing/media/${id}/thumb/base`,
    displaySrc: `/api/community/publishing/media/${id}/display/base`,
  },
});

const fileDrag = (type: string, files: File[], types = ["Files"]) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types, files, dropEffect: "none" },
  });
  return event as Event & { dataTransfer: { dropEffect: string } };
};

const dispatch = async <E extends Event>(target: EventTarget, event: E) => {
  await act(async () => {
    target.dispatchEvent(event);
    await settle();
  });
  return event;
};

/** Makes the first confirmed item ready on the account. */
const makeFirstReady = async () => {
  await until(registered);
  const itemId = probe.store!.get().items[0]!.itemId!;
  await until(() => current.transfer.starts.length >= 1);
  await act(async () => {
    current.transfer.starts[0]!.callbacks.onSettled({
      status: 200,
      responseText: current.uploads.receive(itemId, "still"),
      stalled: false,
    });
    await settle();
  });
  current.uploads.makeReady(itemId);
  await act(async () => {
    current.timers.fireAll();
    await settle();
  });
  await until(() => tiles()[0]?.status === "ready");
};

describe("MediaSection edit derivative readiness (D1)", () => {
  it("shows a turned item as 处理中 until the account confirms, then its edited thumbnail", async () => {
    await render();
    await addStatic(1);
    await makeFirstReady();
    const itemId = probe.store!.get().items[0]!.itemId!;
    const tile = () =>
      container.querySelector<HTMLElement>("[data-media-key]")!;
    expect(tile().querySelector("img")!.getAttribute("src")).toBe(
      `/api/community/publishing/media/${itemId}/thumb/base`,
    );

    current.client.readiness.mockResolvedValueOnce({
      ready: false,
      pendingItemKeys: [probe.store!.get().items[0]!.key],
      failedItemKeys: [],
      editKeys: {},
    });
    await click(buttonByText("编辑第 1 项"));
    const dialog = document.querySelector<HTMLElement>(
      "[data-media-edit-dialog]",
    )!;
    await click(buttonByText("向右旋转 90°", dialog));
    await click(buttonByText("完成", dialog));
    // Immediately after 完成: not 已就绪 any more.
    expect(tiles()[0]!.status).toBe("processing");
    expect(tile().querySelector("[data-media-state-label]")!.textContent).toBe(
      "处理中",
    );
    // The editor host forwards the edit to the runtime (as the overlay does).
    await act(async () => {
      probe.upload!.edit(probe.store!.content());
      await settle();
    });
    expect(current.client.readiness).not.toHaveBeenCalled();
    // The debounced check (session holder) still names it pending.
    await act(async () => {
      current.timers.fireAll();
      await settle();
    });
    expect(current.client.readiness).toHaveBeenCalledTimes(1);
    expect(current.client.readiness.mock.calls[0]![0]).toEqual({
      sessionId: SESSION_ID,
    });
    expect(tiles()[0]!.status).toBe("processing");
    // The poll answers ready with the edit key: the strip shows the edited thumbnail.
    const editKey = "c".repeat(32);
    current.client.readiness.mockResolvedValueOnce({
      ready: true,
      pendingItemKeys: [],
      failedItemKeys: [],
      editKeys: { [probe.store!.get().items[0]!.key]: editKey },
    });
    await act(async () => {
      current.timers.fireAll();
      await settle();
    });
    await until(() => tiles()[0]?.status === "ready");
    expect(tile().dataset.mediaThumb).toBe("edited");
    expect(tile().querySelector("img")!.getAttribute("src")).toBe(
      `/api/community/publishing/media/${itemId}/thumb/${editKey}`,
    );
    // The edited thumbnail is shown as it is (no second rotation in CSS).
    expect(
      tile().querySelector("[data-rotation]")!.getAttribute("data-rotation"),
    ).toBe("0");
  });
});

describe("MediaSection across remounts and interruptions", () => {
  it("keeps an open dialog with its unfinished crop and the notice when the layout swaps or the step changes", async () => {
    await render();
    await addStatic(3);
    await makeFirstReady();
    const [a, , c] = storeKeys();
    await click(buttonByText("设为封面：第 3 项"));
    await click(buttonByText("移除第 3 项"));
    expect(storeKeys()).not.toContain(c);

    await click(buttonByText("编辑第 1 项"));
    let dialog = document.querySelector<HTMLElement>(
      "[data-media-edit-dialog]",
    )!;
    await click(buttonByText("向右旋转 90°", dialog));
    const square = [...dialog.querySelectorAll("label")].find(
      (label) => label.textContent === "1:1",
    )!;
    await click(square.querySelector("input")!);
    await act(async () =>
      crop.props!.onCropAreaChange(
        { x: 0, y: 20, width: 100, height: 75 },
        { x: 0, y: 1, width: 3, height: 3 },
      ),
    );

    // Tablet rotated across 896 px: the editor swaps layouts.
    await setView({ layout: "desktop", shown: true });
    dialog = document.querySelector<HTMLElement>("[data-media-edit-dialog]")!;
    expect(dialog).not.toBeNull();
    expect(crop.props?.rotation).toBe(90);
    expect(crop.props?.initialCroppedAreaPercentages).toEqual({
      x: 0,
      y: 20,
      width: 100,
      height: 75,
    });
    expect(
      [...dialog.querySelectorAll<HTMLInputElement>("input[type=radio]")]
        .filter((input) => input.checked)
        .map((input) => input.value),
    ).toEqual(["1:1"]);
    expect(
      container.querySelector("[data-media-notice]")!.textContent,
    ).toContain("封面已移除");
    await click(buttonByText("完成", dialog));
    expect(probe.store!.get().items[0]).toMatchObject({
      key: a,
      edit: { rotation: 90, crop: { x: 0, y: 0.2, width: 1, height: 0.75 } },
    });
    expect(document.querySelector("[data-media-edit-dialog]")).toBeNull();

    // 下一步 and back: the notice is still there, the dialog stays closed.
    await setView({ layout: "desktop", shown: false });
    await setView({ layout: "desktop", shown: true });
    expect(
      container.querySelector("[data-media-notice]")!.textContent,
    ).toContain("封面已移除");
    expect(document.querySelector("[data-media-edit-dialog]")).toBeNull();
  });

  it("re-selects a missing file into its place with its cover, edit and quality, counting it once", async () => {
    const readyId = `media-item-${"4".repeat(32)}`;
    const stamp = "2026-09-13T12:00:00.000Z";
    const draft: PublishingDraft = {
      id: DRAFT_ID,
      kind: "new",
      workId: null,
      baseRevisionId: null,
      revision: 1,
      content: {
        title: "",
        body: "",
        authorship: { kind: "original" },
        visibility: "public",
        items: [
          {
            key: "done",
            itemId: readyId,
            kind: "static",
            qualityMode: "standard",
            edit: { rotation: 0, crop: null },
          },
          {
            key: "gone",
            itemId: null,
            kind: "static",
            qualityMode: "original",
            edit: { rotation: 90, crop: null },
            pendingLabel: "photo",
          },
        ],
        coverKey: "gone",
        coverCrop: { x: 0, y: 0, width: 0.5, height: 0.5 },
      },
      mediaItems: [readyItem(readyId)],
      conflict: null,
      deviceClass: "desktop",
      createdAt: stamp,
      updatedAt: stamp,
    };
    // The work is at its limit: the missing item still holds its place.
    await render("phone", { maxItems: 2, draft });
    await act(async () => {
      probe.store!.adoptContent(draft.content, draft.mediaItems);
      await probe.upload!.restoreDraftMedia(draft);
      await settle();
    });
    await until(() => tiles()[1]?.status === "missing_local");

    await click(buttonByText("重新选择第 2 项"));
    await setFiles(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="重新选择缺少的文件"]',
      )!,
      [fileOf(jpeg({ width: 6 }), "again.jpg")],
    );
    await until(
      () => container.querySelector("[data-staged-status=ready]") !== null,
    );
    const staging = container.querySelector<HTMLElement>(
      "[data-media-staging]",
    )!;
    expect(staging.textContent).toContain(
      "确认后，新选择的文件将替换第 2 项（原为原图画质），同类文件沿用原来的旋转和裁剪",
    );
    expect(staging.textContent).not.toContain("请先移除");
    // The missing item's quality is the batch's.
    expect(probe.store!.get().originalNext).toBe(true);

    // 下一步 and back before confirming: the re-selection is still pending.
    await setView({ layout: "phone", shown: false });
    await setView({ layout: "phone", shown: true });
    const confirm = buttonByText("添加 1 项（原图）");
    expect(confirm.disabled).toBe(false);
    await click(confirm);

    const state = probe.store!.get();
    expect(state.items.map((item) => item.key)).toHaveLength(2);
    const [first, second] = state.items;
    expect(first!.key).toBe("done");
    expect(second!.key).not.toBe("gone");
    expect(second).toMatchObject({
      kind: "static",
      qualityMode: "original",
      edit: { rotation: 90, crop: null },
    });
    expect(state.coverKey).toBe(second!.key);
    expect(state.coverCrop).toBe(null);
    expect(state.originalNext).toBe(false);
    expect(announcer()).toContain("已替换第 2 项");
    await flush();
    expect(probe.upload!.draftItems().map((item) => item.key)).toEqual([
      "done",
      second!.key,
    ]);
    expect(container.querySelector("[data-media-staging]")).toBeNull();
  });

  it("stages files dropped anywhere in the section and never lets a dropped file replace the editor", async () => {
    await render("desktop");
    const outside = document.createElement("div");
    document.body.append(outside);

    // On the drop zone: staged once (the zone handles it, the guard does not repeat it).
    await dispatch(
      container.querySelector("[data-media-picker]")!,
      fileDrag("drop", [fileOf(jpeg({}), "zone.jpg")]),
    );
    await until(
      () => container.querySelectorAll("[data-staged-key]").length === 1,
    );
    await click(buttonByText("添加 1 项（标准）"));
    await until(() => tiles().length === 1);

    // Outside the section: the browser does not open the file, nothing is staged.
    const overOutside = await dispatch(outside, fileDrag("dragover", []));
    expect(overOutside.defaultPrevented).toBe(true);
    expect(overOutside.dataTransfer.dropEffect).toBe("none");
    const dropOutside = await dispatch(
      outside,
      fileDrag("drop", [fileOf(jpeg({}), "outside.jpg")]),
    );
    expect(dropOutside.defaultPrevented).toBe(true);
    await flush();
    expect(container.querySelector("[data-media-staging]")).toBeNull();

    // Dragging text is left alone.
    const text = await dispatch(
      outside,
      fileDrag("dragover", [], ["text/plain"]),
    );
    expect(text.defaultPrevented).toBe(false);

    // On the strip: staged like the zone.
    const tile = container.querySelector("[data-media-key]")!;
    const overTile = await dispatch(tile, fileDrag("dragover", []));
    expect(overTile.dataTransfer.dropEffect).toBe("copy");
    await dispatch(
      tile,
      fileDrag("drop", [fileOf(jpeg({ width: 9 }), "strip.jpg")]),
    );
    await until(
      () => container.querySelectorAll("[data-staged-key]").length === 1,
    );
    await click(buttonByText("添加 1 项（标准）"));
    await until(() => tiles().length === 2);
  });

  it("removes an item cancelled elsewhere and says so", async () => {
    const draftItems = vi.spyOn(UploadManager.prototype, "draftItems");
    await render();
    await addStatic(2);
    await until(registered);
    const [a, b] = storeKeys();
    const manager = draftItems.mock.contexts.at(-1) as UploadManager;
    await act(async () => {
      await manager.cancelItem(a!);
      await settle();
    });
    await until(() => storeKeys().length === 1);
    expect(storeKeys()).toEqual([b]);
    expect(
      container.querySelector("[data-media-notice]")!.textContent,
    ).toContain("1 项已不可用，已从作品中移除");
    expect(announcer()).toContain("1 项已不可用，已从作品中移除");
  });

  it("offers 上传原图 when this browser cannot prepare Standard", async () => {
    const chooseOriginal = vi.spyOn(UploadManager.prototype, "chooseOriginal");
    await render("phone", {
      preprocess: () => {
        const preprocess = fakePreprocess();
        preprocess.still.mockResolvedValueOnce({
          status: "unsupported",
          reason: "decode_unsupported",
        });
        return preprocess;
      },
    });
    await addStatic(1);
    await until(() => tiles()[0]?.status === "needs_choice");
    expect(announcer()).toContain("第 1 项需要选择");
    await click(buttonByText("上传原图：第 1 项"));
    expect(chooseOriginal).toHaveBeenCalledWith(storeKeys()[0]);
    await until(() => probe.store!.get().items[0]?.qualityMode === "original");
    expect(
      container.querySelector("[data-media-quality=original]"),
    ).not.toBeNull();
  });

  it("continues paused uploads with 继续上传", async () => {
    const draftItems = vi.spyOn(UploadManager.prototype, "draftItems");
    const continueUploads = vi.spyOn(
      UploadManager.prototype,
      "continueUploads",
    );
    await render();
    await addStatic(1);
    await until(() => current.transfer.starts.length === 1);
    const manager = draftItems.mock.contexts.at(-1) as UploadManager;
    await act(async () => {
      manager.pause("offline");
      await settle();
    });
    await until(() => container.querySelector("[data-media-paused]") !== null);
    expect(tiles()[0]?.status).toBe("paused");
    expect(announcer()).toContain("第 1 项已暂停");
    await click(buttonByText("继续上传"));
    expect(continueUploads).toHaveBeenCalled();
    await until(() => current.transfer.starts.length === 2);
  });

  it("names why nothing can be added once the session has ended", async () => {
    await render();
    await setFiles(pickerInput(), [fileOf(jpeg({}), "late.jpg")]);
    await until(
      () => container.querySelector("[data-staged-status=ready]") !== null,
    );
    await act(async () => {
      probe.upload!.closeSession({ discard: true });
      await settle();
    });
    await flush();
    const picker = container.querySelector("[data-media-picker]")!;
    expect(picker.textContent).toContain("暂时无法添加图片");
    expect(picker.querySelector<HTMLButtonElement>("button")!.disabled).toBe(
      true,
    );
    await dispatch(
      container.querySelector("[data-media-section]")!,
      fileDrag("drop", [fileOf(jpeg({}), "refused.jpg")]),
    );
    expect(announcer()).toBe("暂时无法添加图片");
    expect(container.querySelector("[data-media-staging]")).toBeNull();
  });
});
