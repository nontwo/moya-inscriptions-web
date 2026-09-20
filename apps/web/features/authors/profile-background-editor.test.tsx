// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { AuthorProfile } from "@moya/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { upload, background, accountEpoch, readImage, author } = vi.hoisted(
  () => ({
    upload: vi.fn(),
    background: vi.fn(),
    accountEpoch: vi.fn(() => 0),
    readImage: vi.fn(),
    author: {
      viewer: { id: "author" } as { id: string } | null,
      checking: false,
      sessionError: false,
      mutate: vi.fn(),
      notify: vi.fn(),
    },
  }),
);
vi.mock("./author-context", () => ({ useAuthors: () => author }));
vi.mock("./author-data", () => ({
  authorClient: { upload, background, accountEpoch },
}));
vi.mock("./avatar-image", () => ({
  readAvatarImage: readImage,
  normalizeAvatarPng: (bytes: Uint8Array) => bytes,
}));
vi.mock("react-easy-crop", () => ({
  default: ({
    onCropAreaChange,
  }: {
    onCropAreaChange: (
      a: unknown,
      b: { x: number; y: number; width: number; height: number },
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onCropAreaChange(null, { x: 0, y: 0, width: 160, height: 90 })
      }
    >
      完成裁剪
    </button>
  ),
}));
import { ProfileBackgroundEditor } from "./profile-background-editor";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const profile: AuthorProfile = {
  id: "author",
  handle: "owner",
  displayName: "作者",
  bio: "",
  avatar: null,
  background: {
    id: "background-old",
    src: "/old.png",
    width: 160,
    height: 90,
  },
  isOwner: true,
  following: false,
  privacy: {
    following: "public",
    followers: "public",
    favorites: "public",
    likes: "public",
  },
  totals: { works: 0, following: 0, followers: 0, favorites: 0, likes: 0 },
  nextAvatarChangeAt: null,
};
let root: Root | null = null;
const onSaved = vi.fn(),
  onClose = vi.fn();
const view = () => (
  <ProfileBackgroundEditor
    profile={profile}
    onSaved={onSaved}
    onClose={onClose}
  />
);
const render = async () => {
  const node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(view()));
};
const click = async (text: string) => {
  const control = Array.from(document.querySelectorAll("button")).find(
    (item) => item.textContent === text,
  )!;
  await act(async () => control.click());
};
beforeEach(() => {
  vi.clearAllMocks();
  author.viewer = { id: "author" };
  author.checking = false;
  author.sessionError = false;
  accountEpoch.mockReturnValue(0);
  upload.mockResolvedValue({ id: "background-new" });
  background.mockResolvedValue({});
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.open = false;
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(window.history, "back").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,AQID",
  );
  readImage.mockResolvedValue({
    image: { naturalWidth: 160, naturalHeight: 90 },
    url: "blob:background-preview",
  });
  window.history.replaceState({ source: "profile" }, "", "/#profile");
});
afterEach(async () => {
  window.history.replaceState({ source: "profile" }, "", "/#profile");
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const selectImage = async () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["image"], "cover.png", { type: "image/png" })],
  });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  await click("完成裁剪");
};
it("does not save a removal until explicitly requested", async () => {
  await render();
  await click("恢复空白背景");
  expect(background).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
  await click("保存背景");
  expect(background).toHaveBeenCalledWith({
    requestId: expect.any(String),
    mediaId: null,
  });
  expect(onSaved).toHaveBeenCalledOnce();
});
it("uploads the cropped PNG and saves its returned owned media id", async () => {
  await render();
  await selectImage();
  expect(upload).not.toHaveBeenCalled();
  await click("保存背景");
  expect(upload).toHaveBeenCalledWith(expect.any(Blob), expect.any(String));
  expect(background).toHaveBeenCalledWith({
    requestId: expect.any(String),
    mediaId: "background-new",
  });
  expect(author.notify).toHaveBeenCalledWith("主页背景已保存");
});
it("does not attach an upload after the account changes", async () => {
  let resolve!: (value: { id: string }) => void;
  upload.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render();
  await selectImage();
  await click("保存背景");
  accountEpoch.mockReturnValue(1);
  author.viewer = { id: "different" };
  await act(async () => root!.render(view()));
  await act(async () => resolve({ id: "late-media" }));
  expect(background).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});
it("reuses the uploaded media and exact save request after a failed response", async () => {
  background.mockRejectedValueOnce(Error("连接中断"));
  await render();
  await selectImage();
  await click("保存背景");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "连接中断",
  );
  const first = background.mock.calls[0];
  await click("保存背景");
  expect(upload).toHaveBeenCalledOnce();
  expect(background.mock.calls[1]).toEqual(first);
  expect(onSaved).toHaveBeenCalledOnce();
});
it("ignores an upload that finishes after the editor unmounts", async () => {
  let resolve!: (value: { id: string }) => void;
  upload.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render();
  await selectImage();
  await click("保存背景");
  await act(async () => root!.unmount());
  root = null;
  await act(async () => resolve({ id: "late-media" }));
  expect(background).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});
