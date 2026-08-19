export type DeviceClass = "phone" | "tablet" | "desktop";
export type ProductPlatform = "phone" | "tablet" | "pc";

export interface DeviceSignals {
  readonly userAgent: string;
  readonly mobileHint?: boolean | undefined;
  readonly maxTouchPoints?: number | undefined;
  readonly platform?: string | undefined;
}

export const detectDeviceClass = ({
  userAgent,
  mobileHint,
  maxTouchPoints = 0,
  platform = "",
}: DeviceSignals): DeviceClass => {
  if (mobileHint === true || /iPhone|iPod|Android.+Mobile/i.test(userAgent)) {
    return "phone";
  }
  if (
    /iPad|Tablet|Android/i.test(userAgent) ||
    (/Mac/i.test(platform || userAgent) && maxTouchPoints > 1)
  ) {
    return "tablet";
  }
  return "desktop";
};

export const resolveProductPlatform = (
  deviceClass: DeviceClass,
  viewportWidth: number,
): ProductPlatform => {
  if (deviceClass === "phone") return "phone";
  if (deviceClass === "tablet") return viewportWidth < 768 ? "phone" : "tablet";
  if (viewportWidth < 768) return "phone";
  return viewportWidth < 896 ? "tablet" : "pc";
};

export const devicePlatformBootstrap = `(() => {
  const root = document.documentElement;
  const nav = navigator;
  const ua = nav.userAgent || "";
  const mobileHint = nav.userAgentData && nav.userAgentData.mobile;
  const touchPoints = nav.maxTouchPoints || 0;
  const platform = nav.platform || "";
  let deviceClass = "desktop";
  if (mobileHint === true || /iPhone|iPod|Android.+Mobile/i.test(ua)) deviceClass = "phone";
  else if (/iPad|Tablet|Android/i.test(ua) || (/Mac/i.test(platform || ua) && touchPoints > 1)) deviceClass = "tablet";
  const width = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  let productPlatform = "pc";
  if (deviceClass === "phone") productPlatform = "phone";
  else if (deviceClass === "tablet") productPlatform = width < 768 ? "phone" : "tablet";
  else productPlatform = width < 768 ? "phone" : width < 896 ? "tablet" : "pc";
  root.dataset.deviceClass = deviceClass;
  root.dataset.platform = productPlatform;
})();`;

interface NavigatorWithUserAgentData extends Navigator {
  readonly userAgentData?: { readonly mobile?: boolean | undefined };
}

export const readBrowserDeviceClass = (): DeviceClass => {
  const browserNavigator = navigator as NavigatorWithUserAgentData;
  return detectDeviceClass({
    userAgent: browserNavigator.userAgent,
    mobileHint: browserNavigator.userAgentData?.mobile,
    maxTouchPoints: browserNavigator.maxTouchPoints,
    platform: browserNavigator.platform,
  });
};

export const currentViewportWidth = (): number =>
  window.visualViewport?.width ?? window.innerWidth;

export const applyBrowserPlatform = (): ProductPlatform => {
  const deviceClass = readBrowserDeviceClass();
  const productPlatform = resolveProductPlatform(
    deviceClass,
    currentViewportWidth(),
  );
  document.documentElement.dataset.deviceClass = deviceClass;
  document.documentElement.dataset.platform = productPlatform;
  window.dispatchEvent(
    new CustomEvent("yoyi:platformchange", {
      detail: { deviceClass, platform: productPlatform },
    }),
  );
  return productPlatform;
};
