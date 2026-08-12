(function bootstrapDevicePlatform(global) {
  const root = global.document.documentElement;
  const PHONE_MAX = 768;
  const PC_MIN = 896;
  const phonePattern = /iPhone|iPod|Windows Phone|IEMobile|Opera Mini|Mobile/i;
  const tabletPattern = /iPad|Tablet|PlayBook|Silk|Kindle/i;

  function detectDeviceClass(navigatorLike = global.navigator) {
    const userAgent = String(navigatorLike?.userAgent ?? "");
    const mobileHint = navigatorLike?.userAgentData?.mobile;
    const touchPoints = Number(navigatorLike?.maxTouchPoints ?? 0);

    if (
      tabletPattern.test(userAgent) ||
      (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) ||
      (/Macintosh/i.test(userAgent) && touchPoints > 1)
    ) {
      return "tablet";
    }
    if (mobileHint === true || phonePattern.test(userAgent)) return "phone";
    return "desktop";
  }

  function resolvePlatform(deviceClass, viewportWidth = global.innerWidth) {
    const width = Number.isFinite(viewportWidth) ? viewportWidth : PC_MIN;
    if (deviceClass === "phone") return "phone";
    if (deviceClass === "tablet") {
      return width < PHONE_MAX ? "phone" : "tablet";
    }
    if (width < PHONE_MAX) return "phone";
    return width < PC_MIN ? "tablet" : "pc";
  }

  function syncStyles(platform = root.dataset.platform) {
    global.document
      .querySelectorAll("link[data-platform-stylesheet]")
      .forEach((link) => {
        link.media =
          link.dataset.platformStylesheet === platform ? "all" : "not all";
      });
  }

  function sync(options = {}) {
    const deviceClass = detectDeviceClass(
      options.navigatorLike ?? global.navigator,
    );
    const platform = resolvePlatform(
      deviceClass,
      options.viewportWidth ?? global.innerWidth,
    );
    const previousPlatform = root.dataset.platform;
    root.dataset.deviceClass = deviceClass;
    root.dataset.platform = platform;
    syncStyles(platform);

    if (previousPlatform && previousPlatform !== platform) {
      global.dispatchEvent(
        new global.CustomEvent("yoyi:platformchange", {
          detail: { deviceClass, platform, previousPlatform },
        }),
      );
    }
    return { deviceClass, platform };
  }

  global.YOYI_DEVICE_PLATFORM = Object.freeze({
    detectDeviceClass,
    resolvePlatform,
    sync,
    syncStyles,
  });

  sync();
  global.addEventListener("resize", () => sync());
  global.addEventListener("orientationchange", () => sync());
})(window);
