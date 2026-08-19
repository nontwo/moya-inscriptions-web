"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";

import {
  CatalogDetailSurface,
  type CatalogDetailTarget,
} from "../demo/catalog-detail";
import {
  DemoCalligraphySurface,
  DemoInscriptionSurface,
  DemoNearbySurface,
  DemoTopicsSurface,
} from "../demo/demo-surfaces";
import { TopicDetailSurface } from "../demo/topic-detail";
import type { DemoContentId, DemoTopicId } from "../demo/demo-data";
import { HomeSurface } from "../features/home/home-surface";
import { applyBrowserPlatform } from "./device-platform";
import {
  contentWallLayoutPreferenceKey,
  contentWallLayoutPreferences,
  themePreferenceKey,
  themePreferences,
  type ContentWallLayoutPreference,
  type ThemePreference,
} from "./presentation-preferences";
import { ProductShellActionsProvider } from "./product-shell-context";
import styles from "./product-shell.module.css";

import type { CatalogSummary } from "@moya/contracts";

type PrimaryDestination = "home" | "inscriptions" | "calligraphy";
type OverlayState =
  | { readonly kind: "settings" }
  | { readonly kind: "detail"; readonly target: CatalogDetailTarget }
  | { readonly kind: "topic"; readonly id: DemoTopicId }
  | undefined;

const destinations: readonly PrimaryDestination[] = [
  "home",
  "inscriptions",
  "calligraphy",
];
const destinationLabels: Record<PrimaryDestination, string> = {
  home: "首页",
  inscriptions: "碑刻",
  calligraphy: "书帖",
};
const destinationIcons: Record<PrimaryDestination, string> = {
  home: "home",
  inscriptions: "inscriptions",
  calligraphy: "calligraphy",
};
const destinationMarks: Record<PrimaryDestination, string> = {
  home: "nav-home",
  inscriptions: "nav-inscriptions",
  calligraphy: "nav-calligraphy",
};
const themeLabels: Record<ThemePreference, string> = {
  light: "浅色模式",
  dark: "深色模式",
  system: "跟随系统",
};
const layoutLabels: Record<ContentWallLayoutPreference, string> = {
  single: "单列",
  double: "双列",
};

const icon = (name: string) => (
  <span aria-hidden="true" className="yoyi-icon" data-icon={name} />
);
const nextValue = <T extends string>(values: readonly T[], value: T): T =>
  values[(values.indexOf(value) + 1) % values.length] ?? values[0]!;
const storedPreference = <T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
): T => {
  try {
    const value = localStorage.getItem(key);
    return value !== null && values.includes(value as T)
      ? (value as T)
      : fallback;
  } catch {
    return fallback;
  }
};
const persistPreference = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences remain session-safe when storage is unavailable.
  }
};

interface ProductHistoryState {
  readonly yoyi?: true;
  readonly destination?: PrimaryDestination;
  readonly overlay?: OverlayState;
}

export function ProductShell({ homeDiscover }: { homeDiscover: ReactNode }) {
  const [destination, setDestination] = useState<PrimaryDestination>("home");
  const [overlay, setOverlay] = useState<OverlayState>();
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [layout, setLayout] = useState<ContentWallLayoutPreference>("double");
  const [navigationMinimized, setNavigationMinimized] = useState(false);
  const destinationRef = useRef(destination);
  const overlayRef = useRef(overlay);
  const navRef = useRef<HTMLElement>(null);
  const navEntries = useRef(new Map<PrimaryDestination, HTMLButtonElement>());
  const settingsTriggerRef = useRef<HTMLElement | null>(null);
  const settingsBackRef = useRef<HTMLButtonElement>(null);
  const primaryGesture = useRef<
    { x: number; y: number; time: number } | undefined
  >(undefined);
  const navGesture = useRef<{ x: number; width: number } | undefined>(
    undefined,
  );
  const minimizedRef = useRef(false);

  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);
  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);
  useEffect(() => {
    minimizedRef.current = navigationMinimized;
  }, [navigationMinimized]);

  const applyHistoryState = useCallback((state: ProductHistoryState | null) => {
    if (!state?.yoyi) {
      setOverlay(undefined);
      return;
    }
    if (state.destination) setDestination(state.destination);
    setOverlay(state.overlay);
    requestAnimationFrame(() =>
      window.dispatchEvent(new Event("yoyi:layoutchange")),
    );
  }, []);

  useEffect(() => {
    setTheme(storedPreference(themePreferenceKey, themePreferences, "system"));
    setLayout(
      storedPreference(
        contentWallLayoutPreferenceKey,
        contentWallLayoutPreferences,
        "double",
      ),
    );
    applyBrowserPlatform();
    const syncPlatform = () => applyBrowserPlatform();
    window.addEventListener("resize", syncPlatform);
    window.addEventListener("orientationchange", syncPlatform);
    window.visualViewport?.addEventListener("resize", syncPlatform);

    const hash = window.location.hash;
    let initialOverlay: OverlayState;
    if (hash.startsWith("#detail-") && hash.length > 8) {
      initialOverlay = {
        kind: "detail",
        target: { source: "demo", id: hash.slice(8) as DemoContentId },
      };
    } else if (hash.startsWith("#topic-") && hash.length > 7) {
      initialOverlay = { kind: "topic", id: hash.slice(7) as DemoTopicId };
    }
    const initial: ProductHistoryState = {
      yoyi: true,
      destination: "home",
      overlay: undefined,
    };
    if (initialOverlay) {
      const requestedHash = window.location.hash;
      history.replaceState(
        initial,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
      history.pushState(
        { ...initial, overlay: initialOverlay } satisfies ProductHistoryState,
        "",
        `${window.location.pathname}${window.location.search}${requestedHash}`,
      );
      setOverlay(initialOverlay);
    } else {
      history.replaceState(initial, "", window.location.href);
    }
    const onPopState = (event: PopStateEvent) =>
      applyHistoryState(event.state as ProductHistoryState | null);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("resize", syncPlatform);
      window.removeEventListener("orientationchange", syncPlatform);
      window.visualViewport?.removeEventListener("resize", syncPlatform);
      window.removeEventListener("popstate", onPopState);
    };
  }, [applyHistoryState]);

  const pushState = (
    nextDestination: PrimaryDestination,
    nextOverlay: OverlayState,
    hash = "",
  ) => {
    history.pushState(
      {
        yoyi: true,
        destination: nextDestination,
        overlay: nextOverlay,
      } satisfies ProductHistoryState,
      "",
      `${window.location.pathname}${window.location.search}${hash}`,
    );
  };

  const navigate = (next: PrimaryDestination, updateHistory = true) => {
    if (
      next === destinationRef.current &&
      (minimizedRef.current || navigationMinimized)
    ) {
      minimizedRef.current = false;
      setNavigationMinimized(false);
      return;
    }
    if (next === destinationRef.current) return;
    setDestination(next);
    setOverlay(undefined);
    setNavigationMinimized(false);
    if (updateHistory) pushState(next, undefined);
    requestAnimationFrame(() =>
      window.dispatchEvent(new Event("yoyi:layoutchange")),
    );
  };

  const openSettings = (trigger?: HTMLElement | null) => {
    settingsTriggerRef.current =
      trigger ?? (document.activeElement as HTMLElement | null);
    const next = { kind: "settings" } as const;
    setOverlay(next);
    pushState(destinationRef.current, next, "#settings");
  };
  const openDemoDetail = (id: DemoContentId) => {
    const next = { kind: "detail", target: { source: "demo", id } } as const;
    setOverlay(next);
    pushState(destinationRef.current, next, `#detail-${id}`);
  };
  const openRealCatalogSummary = (summary: CatalogSummary) => {
    const next = {
      kind: "detail",
      target: { source: "real-summary", summary },
    } as const;
    setOverlay(next);
    pushState(destinationRef.current, next, "#catalog-summary");
  };
  const openTopic = (id: DemoTopicId) => {
    const next = { kind: "topic", id } as const;
    setOverlay(next);
    pushState(destinationRef.current, next, `#topic-${id}`);
  };
  const closeOverlay = () => {
    if ((history.state as ProductHistoryState | null)?.overlay) history.back();
    else {
      setOverlay(undefined);
      requestAnimationFrame(() => settingsTriggerRef.current?.focus());
    }
  };

  useEffect(() => {
    if (overlay?.kind !== "settings") return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => settingsBackRef.current?.focus());
    return () => {
      document.body.style.overflow = previous;
      requestAnimationFrame(() => settingsTriggerRef.current?.focus());
    };
  }, [overlay]);

  useEffect(() => {
    const navigation = navRef.current;
    const active = navEntries.current.get(destination);
    if (!navigation || !active || navigationMinimized) return;
    const position = () => {
      const navRect = navigation.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      navigation.style.setProperty(
        "--product-nav-bubble-width",
        `${activeRect.width}px`,
      );
      navigation.style.setProperty(
        "--product-nav-bubble-height",
        `${activeRect.height}px`,
      );
      navigation.style.setProperty(
        "--product-nav-bubble-x",
        `${activeRect.left - navRect.left}px`,
      );
      navigation.style.setProperty(
        "--product-nav-bubble-y",
        `${activeRect.top - navRect.top}px`,
      );
    };
    const observer = new ResizeObserver(position);
    observer.observe(navigation);
    position();
    return () => observer.disconnect();
  }, [destination, navigationMinimized]);

  useEffect(() => {
    if (overlay) return undefined;
    let eventTarget: HTMLElement | Window = window;
    let last = 0;
    let intent = 0;
    let idleTimer = 0;
    const bind = () => {
      eventTarget.removeEventListener("scroll", onScroll);
      const platform = document.documentElement.dataset.platform;
      eventTarget =
        platform === "pc"
          ? window
          : (document.querySelector<HTMLElement>(
              `[data-primary-surface="${destinationRef.current}"]:not([hidden]) [data-surface-scroll]:not([hidden])`,
            ) ?? window);
      last =
        eventTarget instanceof HTMLElement
          ? eventTarget.scrollTop
          : window.scrollY;
      intent = 0;
      eventTarget.addEventListener("scroll", onScroll, { passive: true });
    };
    const restore = () => {
      minimizedRef.current = false;
      setNavigationMinimized(false);
    };
    const onScroll = () => {
      const current =
        eventTarget instanceof HTMLElement
          ? eventTarget.scrollTop
          : window.scrollY;
      const delta = current - last;
      last = current;
      if (current <= 8) {
        intent = 0;
        restore();
        return;
      }
      if (delta === 0) return;
      intent += delta;
      if (intent >= 12) {
        minimizedRef.current = true;
        setNavigationMinimized(true);
        intent = 0;
      } else if (intent <= -24) {
        restore();
        intent = 0;
      }
      window.clearTimeout(idleTimer);
      if (minimizedRef.current) idleTimer = window.setTimeout(restore, 400);
    };
    bind();
    window.addEventListener("yoyi:platformchange", bind);
    window.addEventListener("yoyi:layoutchange", bind);
    return () => {
      window.clearTimeout(idleTimer);
      eventTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("yoyi:platformchange", bind);
      window.removeEventListener("yoyi:layoutchange", bind);
    };
  }, [destination, overlay]);

  const primaryPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (
      overlay ||
      (event.target as HTMLElement).closest(
        "input,button,a,[data-no-primary-swipe]",
      )
    )
      return;
    primaryGesture.current = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
  };
  const primaryPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = primaryGesture.current;
    primaryGesture.current = undefined;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const velocity = Math.abs(dx) / Math.max(1, performance.now() - start.time);
    if (
      (Math.abs(dx) < 56 && velocity < 0.45) ||
      Math.abs(dx) <= Math.abs(dy) * 1.2
    )
      return;
    const index = destinations.indexOf(destinationRef.current);
    navigate(
      destinations[
        Math.max(
          0,
          Math.min(destinations.length - 1, index + (dx < 0 ? 1 : -1)),
        )
      ] ?? destinationRef.current,
    );
  };
  const primaryWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (
      overlay ||
      Math.abs(event.deltaX) < 36 ||
      Math.abs(event.deltaX) <= Math.abs(event.deltaY)
    )
      return;
    event.preventDefault();
    const index = destinations.indexOf(destinationRef.current);
    navigate(
      destinations[
        Math.max(
          0,
          Math.min(
            destinations.length - 1,
            index + (event.deltaX > 0 ? 1 : -1),
          ),
        )
      ] ?? destinationRef.current,
    );
  };

  const navPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (navigationMinimized) return;
    navGesture.current = {
      x: event.clientX,
      width: event.currentTarget.getBoundingClientRect().width,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const navPointerUp = (event: PointerEvent<HTMLElement>) => {
    const gesture = navGesture.current;
    navGesture.current = undefined;
    if (!gesture) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const progress = Math.max(
      0,
      Math.min(0.999, (event.clientX - rect.left) / rect.width),
    );
    const target = destinations[Math.floor(progress * destinations.length)];
    if (target && Math.abs(event.clientX - gesture.x) > 12) navigate(target);
  };

  const containSettingsFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const applyTheme = (value: ThemePreference) => {
    setTheme(value);
    if (value === "system")
      document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = value;
    persistPreference(themePreferenceKey, value);
  };
  const applyLayout = (value: ContentWallLayoutPreference) => {
    setLayout(value);
    document.documentElement.dataset.contentWallLayout = value;
    persistPreference(contentWallLayoutPreferenceKey, value);
    window.dispatchEvent(new Event("yoyi:layoutchange"));
  };

  return (
    <ProductShellActionsProvider value={{ openRealCatalogSummary }}>
      <div className={styles.stage} data-product-shell>
        <div className={`${styles.app} yoyi-paper yoyi-paper--visible`}>
          <div
            aria-hidden={overlay !== undefined || undefined}
            className={styles.primaryShell}
            data-primary-swipe
            inert={overlay !== undefined || undefined}
            onPointerDown={primaryPointerDown}
            onPointerUp={primaryPointerUp}
            onWheel={primaryWheel}
          >
            <div data-primary-surface="home" hidden={destination !== "home"}>
              <HomeSurface
                discover={homeDiscover}
                nearby={<DemoNearbySurface onOpenDetail={openDemoDetail} />}
                onOpenSettings={() =>
                  openSettings(
                    document.querySelector("[data-settings-trigger]"),
                  )
                }
                topics={<DemoTopicsSurface onOpenTopic={openTopic} />}
              />
            </div>
            <div
              data-primary-surface="inscriptions"
              hidden={destination !== "inscriptions"}
            >
              <DemoInscriptionSurface
                onOpenDetail={openDemoDetail}
                onOpenSettings={() => openSettings()}
              />
            </div>
            <div
              data-primary-surface="calligraphy"
              hidden={destination !== "calligraphy"}
            >
              <DemoCalligraphySurface
                onOpenDetail={openDemoDetail}
                onOpenSettings={() => openSettings()}
              />
            </div>
          </div>

          <nav
            aria-label="主导航"
            className={`yoyi-mobile-bottom-navigation yoyi-functional-glass ${styles.bottomNavigation} ${navigationMinimized ? "is-minimized" : ""}`}
            data-minimized={navigationMinimized || undefined}
            hidden={overlay !== undefined}
            onPointerDown={navPointerDown}
            onPointerUp={navPointerUp}
            ref={navRef}
          >
            <span aria-hidden="true" className="yoyi-nav-bubble" />
            {destinations.map((item) => (
              <button
                aria-current={destination === item ? "page" : undefined}
                aria-label={destinationLabels[item]}
                className={`yoyi-navigation-entry ${destination === item ? "is-active" : ""}`}
                key={item}
                onClick={() => navigate(item)}
                ref={(node) => {
                  if (node) navEntries.current.set(item, node);
                  else navEntries.current.delete(item);
                }}
                type="button"
              >
                <span aria-hidden="true" className={styles.navigationIconWrap}>
                  {icon(destinationIcons[item])}
                </span>
                <span
                  aria-hidden="true"
                  className="yoyi-fixed-label"
                  data-label={destinationMarks[item]}
                />
              </button>
            ))}
          </nav>

          {overlay?.kind === "settings" ? (
            <section
              aria-label="设置"
              aria-modal="true"
              className={styles.settings}
              onKeyDown={containSettingsFocus}
              role="dialog"
            >
              <header className={styles.settingsTopBar}>
                <button
                  aria-label="返回"
                  className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md"
                  onClick={closeOverlay}
                  ref={settingsBackRef}
                  type="button"
                >
                  {icon("back")}
                </button>
                <h1>设置</h1>
                <span aria-hidden="true" />
              </header>
              <main className={styles.settingsContent}>
                <div className={styles.settingToggles}>
                  <button
                    aria-label={`切换主题：当前${themeLabels[theme]}`}
                    className={`yoyi-icon-button yoyi-icon-button--quiet ${styles.settingToggle}`}
                    data-theme-mode={theme}
                    onClick={() =>
                      applyTheme(nextValue(themePreferences, theme))
                    }
                    type="button"
                  >
                    {icon(`theme-${theme}`)}
                  </button>
                  <button
                    aria-label={`切换布局：当前${layoutLabels[layout]}`}
                    className={`yoyi-icon-button yoyi-icon-button--quiet ${styles.settingToggle} ${styles.layoutToggle}`}
                    data-layout-mode={layout}
                    onClick={() =>
                      applyLayout(
                        nextValue(contentWallLayoutPreferences, layout),
                      )
                    }
                    type="button"
                  >
                    {icon(`layout-${layout}`)}
                  </button>
                </div>
              </main>
            </section>
          ) : null}
          {overlay?.kind === "detail" ? (
            <CatalogDetailSurface
              onBack={closeOverlay}
              target={overlay.target}
            />
          ) : null}
          {overlay?.kind === "topic" ? (
            <TopicDetailSurface id={overlay.id} onBack={closeOverlay} />
          ) : null}
        </div>
      </div>
    </ProductShellActionsProvider>
  );
}
