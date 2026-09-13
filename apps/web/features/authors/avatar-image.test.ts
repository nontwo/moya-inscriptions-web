// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exportAvatar, readAvatarImage } from "./avatar-image";
let decoded: {
  naturalWidth: number;
  naturalHeight: number;
  src: string;
  decode: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  decoded = {
    naturalWidth: 1200,
    naturalHeight: 800,
    src: "",
    decode: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal(
    "Image",
    class {
      constructor() {
        return decoded;
      }
    },
  );
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:avatar-test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("accepts common photos and retains the object URL for the editor lifetime", async () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    const result = await readAvatarImage(
      new File(["synthetic"], "photo", { type: type ?? "image/png" }),
    );
    expect(result.url).toBe("blob:avatar-test");
    expect(result.image).toBe(decoded);
  }
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});
it("rejects unsupported, empty, oversize and excessive decoded images", async () => {
  await expect(
    readAvatarImage(new File(["svg"], "photo.svg", { type: "image/svg+xml" })),
  ).rejects.toThrow("JPG");
  await expect(
    readAvatarImage(new File([], "empty.png", { type: "image/png" })),
  ).rejects.toThrow();
  await expect(
    readAvatarImage(
      new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.jpg", {
        type: "image/jpeg",
      }),
    ),
  ).rejects.toThrow();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  decoded.naturalWidth = 8193;
  await expect(
    readAvatarImage(new File(["x"], "large.png", { type: "image/png" })),
  ).rejects.toThrow("8192");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar-test");
  decoded.naturalWidth = decoded.naturalHeight = 5000;
  await expect(
    readAvatarImage(new File(["x"], "large.png", { type: "image/png" })),
  ).rejects.toThrow("16 Mi");
});
it("releases a failed decode URL", async () => {
  decoded.decode.mockRejectedValue(Error("decode failed"));
  await expect(
    readAvatarImage(new File(["bad"], "bad.png", { type: "image/png" })),
  ).rejects.toThrow("decode failed");
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
it("exports the exact natural-pixel crop directly as a bounded 512px PNG", async () => {
  const draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback,
    type,
  ) {
    expect(this.width).toBe(512);
    expect(this.height).toBe(512);
    expect(type).toBe("image/png");
    callback(new Blob(["synthetic output"], { type: type ?? "image/png" }));
  });
  const image = decoded as unknown as HTMLImageElement;
  const output = await exportAvatar(image, {
    x: 200,
    y: 100,
    width: 600,
    height: 600,
  });
  expect(draw).toHaveBeenCalledWith(image, 200, 100, 600, 600, 0, 0, 512, 512);
  expect(output.type).toBe("image/png");
});
it("rejects invalid crop coordinates and an unavailable export", async () => {
  const image = decoded as unknown as HTMLImageElement;
  for (const area of [
    { x: -1, y: 0, width: 600, height: 600 },
    { x: 700, y: 0, width: 600, height: 600 },
    { x: NaN, y: 0, width: 0, height: 0 },
  ])
    await expect(exportAvatar(image, area)).rejects.toThrow("裁剪区域");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => callback(null),
  );
  await expect(
    exportAvatar(image, { x: 0, y: 0, width: 600, height: 600 }),
  ).rejects.toThrow("图像导出失败");
});
