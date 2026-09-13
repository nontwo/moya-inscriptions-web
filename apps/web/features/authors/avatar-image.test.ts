// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  exportAvatar,
  exportAvatarSnapshot,
  normalizeAvatarPng,
  readAvatarImage,
} from "./avatar-image";
let decoded: {
  naturalWidth: number;
  naturalHeight: number;
  src: string;
  decode: ReturnType<typeof vi.fn>;
};
const chunk = (type: string, data: number[] = []) => {
  const bytes = new Uint8Array(12 + data.length);
  new DataView(bytes.buffer).setUint32(0, data.length);
  bytes.set(
    Array.from(type, (c) => c.charCodeAt(0)),
    4,
  );
  bytes.set(data, 8);
  return bytes;
};
const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const png = (...chunks: Uint8Array[]) =>
  Uint8Array.from([...signature, ...chunks.flatMap((c) => [...c])]);
const syntheticPng = png(
  chunk("IHDR", [8, 6]),
  chunk("sRGB", [0]),
  chunk("eXIf", [1, 2, 3]),
  chunk("IDAT", [42, 99]),
  chunk("IEND"),
);
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
    const blob = new Blob([syntheticPng], { type: type ?? "image/png" });
    Object.defineProperty(blob, "arrayBuffer", {
      value: async () => syntheticPng.buffer,
    });
    callback(blob);
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

it("strips Safari ancillary metadata without changing compressed pixels or retained chunk CRCs", () => {
  const expected = png(
    chunk("IHDR", [8, 6]),
    chunk("sRGB", [0]),
    chunk("IDAT", [42, 99]),
    chunk("IEND"),
  );
  expect(normalizeAvatarPng(syntheticPng)).toEqual(expected);
  expect(normalizeAvatarPng(expected)).toEqual(expected);
  expect(() => normalizeAvatarPng(syntheticPng.subarray(0, -1))).toThrow(
    "导出失败",
  );
  expect(() =>
    normalizeAvatarPng(png(chunk("IHDR"), chunk("PLTE"), chunk("IEND"))),
  ).toThrow("格式不支持");
});
it("creates a synchronous normalized sRGB snapshot for the Save click", () => {
  const context = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    `data:image/png;base64,${btoa(String.fromCharCode(...syntheticPng))}`,
  );
  const output = exportAvatarSnapshot(decoded as unknown as HTMLImageElement, {
    x: 0,
    y: 0,
    width: 600,
    height: 600,
  });
  expect(typeof output).toBe("string");
  expect(context).toHaveBeenCalledWith("2d", { colorSpace: "srgb" });
  expect(
    Uint8Array.from(atob(output.split(",")[1]!), (c) => c.charCodeAt(0)),
  ).toEqual(normalizeAvatarPng(syntheticPng));
});
