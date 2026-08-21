export type CatalogDetailDeviceClass = "desktop" | "phone" | "tablet";
export type CatalogDetailPlatform = "pc" | "phone" | "tablet";
export type CatalogDetailComposition =
  | "compact-split"
  | "compact-stacked"
  | "expanded-split"
  | "stacked"
  | "wide-stacked";

interface NavigatorLike {
  maxTouchPoints?: number;
  userAgent?: string;
  userAgentData?: { mobile?: boolean };
}

const phonePattern = /iPhone|iPod|Windows Phone|IEMobile|Opera Mini|Mobile/i;
const tabletPattern = /iPad|Tablet|PlayBook|Silk|Kindle/i;

export const detectCatalogDetailDeviceClass = (
  navigatorLike: NavigatorLike,
): CatalogDetailDeviceClass => {
  const userAgent = String(navigatorLike.userAgent ?? "");
  const touchPoints = Number(navigatorLike.maxTouchPoints ?? 0);
  if (
    tabletPattern.test(userAgent) ||
    (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) ||
    (/Macintosh/i.test(userAgent) && touchPoints > 1)
  )
    return "tablet";
  if (
    navigatorLike.userAgentData?.mobile === true ||
    phonePattern.test(userAgent)
  )
    return "phone";
  return "desktop";
};

export const resolveCatalogDetailPlatform = (
  deviceClass: CatalogDetailDeviceClass,
  viewportWidth: number,
): CatalogDetailPlatform => {
  if (deviceClass === "phone") return "phone";
  if (deviceClass === "tablet") return viewportWidth < 768 ? "phone" : "tablet";
  if (viewportWidth < 768) return "phone";
  return viewportWidth < 896 ? "tablet" : "pc";
};

export const resolveCatalogDetailComposition = (
  platform: CatalogDetailPlatform,
  landscape: boolean,
): CatalogDetailComposition => {
  if (platform === "phone") return landscape ? "compact-stacked" : "stacked";
  if (platform === "tablet")
    return landscape ? "compact-split" : "wide-stacked";
  return "expanded-split";
};

export const hasCatalogDetailPcControls = (platform: CatalogDetailPlatform) =>
  platform === "pc";
