// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { AuthorProfile } from "@moya/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
type CropProps = {
  cropShape: string;
  crop: { x: number; y: number };
  zoom: number;
  showGrid: boolean;
  cropperProps: { tabIndex: number };
  onTouchRequest: () => boolean;
  onCropChange: (value: { x: number; y: number }) => void;
  onZoomChange: (value: number) => void;
  onCropAreaChange: (
    unused: object,
    area: { x: number; y: number; width: number; height: number },
  ) => void;
};
const state = vi.hoisted(() => ({
  account: "user-00000000000000000000000000000001",
  upload: vi.fn(),
  avatar: vi.fn(),
  profile: vi.fn(),
  mutate: vi.fn(),
  notify: vi.fn(),
  read: vi.fn(),
  export: vi.fn(),
  crop: null as CropProps | null,
}));
vi.mock("./author-data", () => ({
  authorClient: {
    account: () => state.account,
    upload: state.upload,
    avatar: state.avatar,
    profile: state.profile,
  },
  AuthorRequestError: class extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("./author-context", () => ({
  useAuthors: () => ({
    viewer: { id: "user-00000000000000000000000000000001" },
    mutate: state.mutate,
    notify: state.notify,
  }),
}));
vi.mock("./avatar-image", () => ({
  readAvatarImage: state.read,
  exportAvatar: state.export,
}));
vi.mock("react-easy-crop", async () => {
  const { useEffect } = await import("react");
  return {
    default: (props: CropProps) => {
      state.crop = props;
      useEffect(
        () =>
          props.onCropAreaChange({}, { x: 100, y: 0, width: 600, height: 600 }),
        [],
      );
      return <div data-crop-shape={props.cropShape} />;
    },
  };
});
import { AvatarEditor, AvatarEntry } from "./avatar-editor";
import { AuthorRequestError } from "./author-data";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const profile: AuthorProfile = {
  id: state.account,
  handle: "synthetic-avatar-owner",
  displayName: "头像测试",
  bio: "",
  avatar: null,
  isOwner: true,
  following: false,
  nextAvatarChangeAt: null,
  privacy: {
    following: "public",
    followers: "private",
    favorites: "private",
    likes: "private",
  },
  totals: { works: 0, following: 0, followers: 0, favorites: 0, likes: 0 },
};
let root: Root, node: HTMLDivElement;
const blob = new Blob(["synthetic output"], { type: "image/png" });
const file = new File(["synthetic input"], "photo.jpg", { type: "image/jpeg" });
const close = vi.fn(),
  saved = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  state.account = profile.id;
  state.crop = null;
  state.upload.mockResolvedValue({ id: "media-synthetic-avatar" });
  state.avatar.mockResolvedValue({ nextChangeAt: "2099-01-01T05:00:00Z" });
  state.export.mockResolvedValue(blob);
  state.read.mockResolvedValue({ image: {}, url: "blob:synthetic-avatar" });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  window.history.replaceState({}, "", "/#profile");
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});
afterEach(async () => {
  window.history.replaceState({}, "", "/#profile");
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const render = async (next: string | null = null) =>
  act(async () =>
    root.render(
      <AvatarEditor
        profile={{ ...profile, nextAvatarChangeAt: next }}
        file={file}
        onClose={close}
        onSaved={saved}
      />,
    ),
  );
const button = (name: string) =>
  Array.from(node.querySelectorAll("button")).find(
    (b) => b.textContent === name,
  )!;
const click = async (name = "保存头像") =>
  act(async () => button(name).click());
const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

it("opens the device picker before the editor and keeps other authors read-only", async () => {
  await act(async () =>
    root.render(
      <AvatarEntry profile={profile} className="avatar" onSaved={saved}>
        <span>头</span>
      </AvatarEntry>,
    ),
  );
  expect(node.querySelector("dialog")).toBeNull();
  const input = node.querySelector("input")!;
  const picker = vi.spyOn(input, "click");
  await act(async () => node.querySelector("button")!.click());
  expect(picker).toHaveBeenCalledOnce();
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  expect(node.querySelector("dialog")).not.toBeNull();
  await act(async () =>
    root.render(
      <AvatarEntry
        profile={{ ...profile, isOwner: false }}
        className="avatar"
        onSaved={saved}
      >
        头
      </AvatarEntry>,
    ),
  );
  expect(node.querySelector("button")).toBeNull();
});
it("shows a round mask, direct positioning and only one zoom slider", async () => {
  await render();
  expect(node.querySelectorAll('input[type="range"]')).toHaveLength(1);
  expect(node.querySelector('[data-crop-shape="round"]')).not.toBeNull();
  await act(async () => {
    state.crop!.onCropChange({ x: 20, y: -30 });
    state.crop!.onZoomChange(2);
  });
  expect(state.crop!.crop).toEqual({ x: 20, y: -30 });
  expect(state.crop!.zoom).toBe(2);
  expect(state.crop!.showGrid).toBe(false);
});
it("cancel before saving never uploads or binds", async () => {
  await render();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  window.history.replaceState({}, "", "/#profile");
  await click("返回");
  expect(close).toHaveBeenCalledOnce();
  expect(state.upload).not.toHaveBeenCalled();
  expect(state.avatar).not.toHaveBeenCalled();
});
it("preserves crop after upload failure and retries the same upload identity", async () => {
  state.upload.mockRejectedValueOnce(Error("上传失败"));
  await render();
  await act(async () => state.crop!.onCropChange({ x: 32, y: 21 }));
  await click();
  expect(node.querySelector('[role="alert"]')?.textContent).toBe("上传失败");
  expect(state.crop!.crop).toEqual({ x: 32, y: 21 });
  await click();
  expect(state.upload.mock.calls[1]).toEqual(state.upload.mock.calls[0]);
  expect(state.export).toHaveBeenCalledOnce();
  expect(saved).toHaveBeenCalledOnce();
  expect(state.mutate).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
it("retries failed binding without uploading again or changing the save identity", async () => {
  state.avatar.mockRejectedValueOnce(Error("保存未确认"));
  await render();
  await click();
  await click();
  expect(state.upload).toHaveBeenCalledOnce();
  expect(state.avatar.mock.calls[1]).toEqual(state.avatar.mock.calls[0]);
});
it("freezes crop, duplicate save and dismissal while saving", async () => {
  const upload = deferred();
  state.upload.mockReturnValue(upload.promise);
  await render();
  await act(async () => {
    button("保存头像").click();
    button("保存头像").click();
  });
  expect(state.upload).toHaveBeenCalledOnce();
  expect(button("返回").disabled).toBe(true);
  await act(async () => {
    state.crop!.onCropChange({ x: 99, y: 88 });
    state.crop!.onZoomChange(3);
  });
  expect(state.crop!.crop).toEqual({ x: 0, y: 0 });
  expect(state.crop!.zoom).toBe(1);
  expect(state.crop!.cropperProps.tabIndex).toBe(-1);
  expect(state.crop!.onTouchRequest()).toBe(false);
  await act(async () =>
    node
      .querySelector("dialog")!
      .dispatchEvent(new Event("cancel", { cancelable: true })),
  );
  expect(close).not.toHaveBeenCalled();
  await act(async () => upload.resolve({ id: "media-synthetic-avatar" }));
  expect(state.avatar).toHaveBeenCalledOnce();
});
it("shows future cooldown in New York time, but permits an expired cooldown", async () => {
  await render("2099-01-02T05:00:00Z");
  expect(button("保存头像").disabled).toBe(true);
  expect(node.textContent).toContain("2099年1月2日");
  expect(node.textContent).toContain("00:00");
  expect(node.textContent).toContain("美国纽约时间");
});
it("does not treat a past next-change timestamp as a limit", async () => {
  await render("2020-01-01T05:00:00Z");
  expect(button("保存头像").disabled).toBe(false);
  await click();
  expect(saved).toHaveBeenCalledOnce();
});
it("refreshes server cooldown after a competing session saves, retaining the crop", async () => {
  state.avatar.mockRejectedValue(new AuthorRequestError(409, "daily limit"));
  state.profile.mockResolvedValue({
    ...profile,
    nextAvatarChangeAt: "2099-01-02T05:00:00Z",
  });
  await render();
  await act(async () => state.crop!.onCropChange({ x: 13, y: 7 }));
  await click();
  expect(button("保存头像").disabled).toBe(true);
  expect(node.textContent).toContain("当前裁剪已保留");
  expect(state.crop!.crop).toEqual({ x: 13, y: 7 });
});
it("does not bind under a changed account after upload completes", async () => {
  const upload = deferred();
  state.upload.mockReturnValue(upload.promise);
  await render();
  await click();
  state.account = "user-00000000000000000000000000000002";
  await act(async () => upload.resolve({ id: "media-synthetic-avatar" }));
  expect(state.avatar).not.toHaveBeenCalled();
});

it("keeps decoded photos and exits busy during transient account refresh", async () => {
  state.account = "";
  await render();
  expect(node.querySelector("[data-avatar-crop]")).not.toBeNull();
  await click();
  expect(button("返回").disabled).toBe(false);
  expect(node.querySelector('[role="alert"]')?.textContent).toContain(
    "账户状态已变化",
  );
  state.account = profile.id;
  await click();
  expect(saved).toHaveBeenCalledOnce();
});
it("retains the crop and pending upload when replacement decoding fails", async () => {
  state.avatar.mockRejectedValueOnce(Error("保存未确认"));
  await render();
  await act(async () => state.crop!.onCropChange({ x: 23, y: 18 }));
  await click();
  state.read.mockRejectedValueOnce(Error("replacement invalid"));
  const input = node.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", {
    value: [new File(["bad"], "bad.jpg", { type: "image/jpeg" })],
  });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  expect(state.crop!.crop).toEqual({ x: 23, y: 18 });
  expect(node.querySelector('[role="alert"]')?.textContent).toBe(
    "replacement invalid",
  );
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  await click();
  expect(state.upload).toHaveBeenCalledOnce();
  expect(state.avatar.mock.calls[1]).toEqual(state.avatar.mock.calls[0]);
});
