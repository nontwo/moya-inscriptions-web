// ============================================================
// @moya/image — 图片路径构建与 CDN 工具
// 按照 AGENTS.md 规则 5：图片用 object key 表示，派生 URL
// ============================================================

/**
 * CDN 基础 URL（阶段 0 使用空字符串，后续通过环境变量注入）
 * 不得硬编码生产域名或 CDN 地址
 */
const CDN_URL = "";

/**
 * 获取缩略图 URL
 */
export function getThumbnailUrl(key: string): string {
  return `${CDN_URL}/${key}`;
}

/**
 * 获取展示图 URL
 */
export function getDisplayUrl(key: string): string {
  return `${CDN_URL}/${key}`;
}

/**
 * 获取原图 URL
 */
export function getOriginalUrl(key: string): string {
  return `${CDN_URL}/${key}`;
}

/**
 * 根据 siteCode、imageId 和类型生成标准化的图片 key
 */
export function generateImageKey(
  siteCode: string,
  imageId: string,
  type: "thumbnail" | "display" | "original",
): string {
  const ext = type === "original" ? "tif" : "webp";
  return type === "original"
    ? `archive/${siteCode}/original/${imageId}.${ext}`
    : `sites/${siteCode}/${type}/${imageId}.${ext}`;
}

/**
 * 生成占位图片 URL（开发期使用）
 */
export function placeholderImage(text: string, width = 800, height = 600): string {
  return `https://placehold.co/${width}x${height}/F5F0E8/2C2C2C?text=${encodeURIComponent(text)}`;
}

/**
 * 从 CDN key 推导完整 URL
 * 阶段 0：直接拼接；后续阶段：签名 URL / 图片处理管线
 */
export function resolveImageUrl(key: string, options?: {
  width?: number;
  height?: number;
  quality?: number;
  format?: "webp" | "avif" | "jpeg";
}): string {
  const base = getDisplayUrl(key);
  if (!options) return base;

  // 后续阶段接入图片处理管线时在此扩展
  const params = new URLSearchParams();
  if (options.width) params.set("w", String(options.width));
  if (options.height) params.set("h", String(options.height));
  if (options.quality) params.set("q", String(options.quality));
  if (options.format) params.set("fmt", options.format);

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
