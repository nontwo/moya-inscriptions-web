// ============================================================
// 图片路径构建工具
// ============================================================

const CDN_URL = '';

export function getThumbnailUrl(key: string): string {
  return `${CDN_URL}/${key}`;
}

export function getDisplayUrl(key: string): string {
  return `${CDN_URL}/${key}`;
}

export function generateImageKey(siteCode: string, imageId: string, type: 'thumbnail' | 'display' | 'original'): string {
  const ext = type === 'original' ? 'tif' : 'webp';
  return type === 'original'
    ? `archive/${siteCode}/original/${imageId}.${ext}`
    : `sites/${siteCode}/${type}/${imageId}.${ext}`;
}

export function placeholderImage(text: string, width = 800, height = 600): string {
  return `https://placehold.co/${width}x${height}/F5F0E8/2C2C2C?text=${encodeURIComponent(text)}`;
}
