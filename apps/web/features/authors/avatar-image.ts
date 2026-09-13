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
export const exportAvatar = async (
  image: HTMLImageElement,
  area: Area,
): Promise<Blob> => {
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
  const context = canvas.getContext("2d");
  if (!context) throw Error("当前浏览器无法导出图像");
  context.drawImage(image, x, y, width, height, 0, 0, 512, 512);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(Error("图像导出失败，请重试")),
      "image/png",
    ),
  );
  if (blob.type !== "image/png" || blob.size > MAX_BYTES)
    throw Error("图像导出失败，请重试");
  return blob;
};
