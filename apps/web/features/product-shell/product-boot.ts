export const PRODUCT_LOADING_MINIMUM_MS = 720;
export const PRODUCT_LOADING_FAILSAFE_MS = 3_000;

// This script intentionally runs before hydration so approved presentation
// preferences and platform attributes are available to the first CSS paint.
export const PRODUCT_BOOT_SCRIPT = `(() => {
  const root = document.documentElement;
  const themeKey = "yoyi.theme-preference";
  const layoutKey = "yoyi.home-feed-layout";
  const phonePattern = /iPhone|iPod|Windows Phone|IEMobile|Opera Mini|Mobile/i;
  const tabletPattern = /iPad|Tablet|PlayBook|Silk|Kindle/i;
  const started = performance.now();

  root.dataset.yoyiBoot = "pending";
  root.dataset.yoyiBootStarted = String(started);

  try {
    const theme = localStorage.getItem(themeKey);
    const preference = theme === "light" || theme === "dark" ? theme : "system";
    root.dataset.themePreference = preference;
    if (preference === "system") root.removeAttribute("data-theme");
    else root.dataset.theme = preference;

    const layout = localStorage.getItem(layoutKey);
    root.dataset.homeLayout = layout === "single" ? "single" : "double";
  } catch {
    root.dataset.themePreference = "system";
    root.removeAttribute("data-theme");
    root.dataset.homeLayout = "double";
  }

  const synchronizePlatform = () => {
    const userAgent = String(navigator.userAgent || "");
    const mobileHint = navigator.userAgentData?.mobile;
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    let deviceClass = "desktop";
    if (
      tabletPattern.test(userAgent) ||
      (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) ||
      (/Macintosh/i.test(userAgent) && touchPoints > 1)
    ) {
      deviceClass = "tablet";
    } else if (mobileHint === true || phonePattern.test(userAgent)) {
      deviceClass = "phone";
    }

    const width = Number.isFinite(window.innerWidth) ? window.innerWidth : 896;
    const platform =
      deviceClass === "phone"
        ? "phone"
        : deviceClass === "tablet"
          ? width < 768
            ? "phone"
            : "tablet"
          : width < 768
            ? "phone"
            : width < 896
              ? "tablet"
              : "pc";

    root.dataset.deviceClass = deviceClass;
    root.dataset.platform = platform;
    root.dataset.orientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
  };

  synchronizePlatform();
  window.YOYI_PRODUCT_BOOT = Object.freeze({ synchronizePlatform });
  window.setTimeout(() => {
    if (root.dataset.yoyiBoot === "pending") root.dataset.yoyiBoot = "ready";
  }, ${PRODUCT_LOADING_FAILSAFE_MS});
})();`;
