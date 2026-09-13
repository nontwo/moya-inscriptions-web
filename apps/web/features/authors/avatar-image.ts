import type { Area } from "react-easy-crop";

const MAX_BYTES = 4 * 1024 * 1024;
export type AvatarImage = { image: HTMLImageElement; url: string };

/** Avatar-only decoding; the work editor retains its existing strict PNG input. */
export const readAvatarImage = async (file: File): Promise<AvatarImage> => {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size === 0 ||
    file.size > MAX_BYTES
  )
    throw Error("请选择不超过 4 MiB 的 JPG、PNG 或 WebP 图像");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (
      !width ||
      !height ||
      width > 8192 ||
      height > 8192 ||
      width * height > 16 * 1024 * 1024
    )
      throw Error("图像宽高不能超过 8192 像素，总像素不能超过 16 Mi");
    return { image, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
};

/** The cropper reports natural-image pixels, including browser-applied orientation. */
const avatarCanvas = (
  image: HTMLImageElement,
  area: Area,
): HTMLCanvasElement => {
  const { x, y, width, height } = area;
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > image.naturalWidth ||
    y + height > image.naturalHeight ||
    Math.abs(width - height) > 1
  )
    throw Error("裁剪区域尚未就绪，请重试");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d", { colorSpace: "srgb" });
  if (!context) throw Error("当前浏览器无法导出图像");
  context.drawImage(image, x, y, width, height, 0, 0, 512, 512);
  return canvas;
};

/** Safari adds eXIf even to an sRGB canvas. Keep only the Backend's accepted
 * chunks; their original bytes/CRCs and compressed pixels remain unchanged. */
export const normalizeAvatarPng = (bytes: Uint8Array): Uint8Array => {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length > MAX_BYTES || !signature.every((b, i) => bytes[i] === b))
    throw Error("图像导出失败，请重试");
  const chunks = [bytes.subarray(0, 8)];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8,
    ended = false;
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset),
      end = offset + size + 12;
    if (end > bytes.length) throw Error("图像导出失败，请重试");
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (["IHDR", "IDAT", "IEND", "sRGB", "gAMA", "pHYs", "cHRM"].includes(type))
      chunks.push(bytes.subarray(offset, end));
    else if (type[0] === type[0]?.toUpperCase())
      throw Error("当前浏览器导出的图像格式不支持");
    offset = end;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!ended || offset !== bytes.length) throw Error("图像导出失败，请重试");
  const output = new Uint8Array(
    chunks.reduce((n, chunk) => n + chunk.length, 0),
  );
  let index = 0;
  for (const chunk of chunks) {
    output.set(chunk, index);
    index += chunk.length;
  }
  return output;
};

/** Synchronous, bounded512px snapshot: Save can durably record intent in the
 * same click handler, before any navigation/unload can interrupt an await. */
export const exportAvatarSnapshot = (
  image: HTMLImageElement,
  area: Area,
): string => {
  const data = avatarCanvas(image, area).toDataURL("image/png");
  if (!data.startsWith("data:image/png;base64,"))
    throw Error("图像导出失败，请重试");
  const raw = atob(data.slice("data:image/png;base64,".length));
  const bytes = normalizeAvatarPng(
    Uint8Array.from(raw, (c) => c.charCodeAt(0)),
  );
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:image/png;base64,${btoa(binary)}`;
};

export const exportAvatar = async (
  image: HTMLImageElement,
  area: Area,
): Promise<Blob> => {
  const canvas = avatarCanvas(image, area);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(Error("图像导出失败，请重试")),
      "image/png",
    ),
  );
  if (blob.type !== "image/png" || blob.size > MAX_BYTES)
    throw Error("图像导出失败，请重试");
  return new Blob(
    [
      normalizeAvatarPng(
        new Uint8Array(await blob.arrayBuffer()),
      ) as Uint8Array<ArrayBuffer>,
    ],
    { type: "image/png" },
  );
};
