/** Native synthetic Payload file URLs need the Web origin on a phone or tablet. */
export const localCatalogFileUrl = (src: string): URL | null => {
  try {
    const url = new URL(src);
    return url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/api\/media\/file\/[a-f0-9]{64}-[a-f0-9]{64}\.(png|jpg|webp)$/u.test(
        url.pathname,
      )
      ? url
      : null;
  } catch {
    return null;
  }
};
export const localCatalogMediaSrc = (
  src: string,
  catalogId: string,
  mediaId: string,
): string =>
  localCatalogFileUrl(src)
    ? `/api/catalog/${encodeURIComponent(catalogId)}/media/${encodeURIComponent(mediaId)}`
    : src;
