"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  homeLayoutPreferenceKey,
  homeLayoutPreferences,
  themePreferenceKey,
  themePreferences,
  type HomeLayoutPreference,
  type ThemePreference,
} from "./presentation-preferences";
import styles from "./home-screen.module.css";

const themeLabels: Record<ThemePreference, string> = {
  light: "浅色模式",
  dark: "深色模式",
  system: "跟随系统",
};

const layoutLabels: Record<HomeLayoutPreference, string> = {
  single: "单列",
  double: "双列",
};

const nextValue = <T extends string>(values: readonly T[], value: T): T =>
  values[(values.indexOf(value) + 1) % values.length] ?? values[0]!;

const storedPreference = <T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
): T => {
  try {
    const value = window.localStorage.getItem(key);
    return value !== null && values.includes(value as T)
      ? (value as T)
      : fallback;
  } catch {
    return fallback;
  }
};

const persistPreference = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // T02 preserves session behavior when browser storage is unavailable.
  }
};

const icon = (name: string) => (
  <span aria-hidden="true" className="yoyi-icon" data-icon={name} />
);

export function HomeShell({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [layout, setLayout] = useState<HomeLayoutPreference>("double");
  const [navigationMinimized, setNavigationMinimized] = useState(false);
  const [bubblePending, setBubblePending] = useState(false);
  const navigationMinimizedRef = useRef(false);
  const scrollRef = useRef<HTMLElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const activeNavigationRef = useRef<HTMLButtonElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsBackRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTheme(storedPreference(themePreferenceKey, themePreferences, "system"));
    setLayout(
      storedPreference(
        homeLayoutPreferenceKey,
        homeLayoutPreferences,
        "double",
      ),
    );
  }, []);

  useEffect(() => {
    navigationMinimizedRef.current = navigationMinimized;
  }, [navigationMinimized]);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    settingsBackRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [settingsOpen]);

  useEffect(() => {
    let eventTarget: HTMLElement | Window;
    let lastScrollTop = 0;
    let scrollIntent = 0;
    let idleTimer = 0;

    const clearIdleTimer = () => {
      if (!idleTimer) return;
      window.clearTimeout(idleTimer);
      idleTimer = 0;
    };

    const updateMinimized = (value: boolean) => {
      navigationMinimizedRef.current = value;
      setNavigationMinimized(value);
    };

    const scrollTop = () =>
      eventTarget instanceof HTMLElement
        ? eventTarget.scrollTop
        : Math.max(window.scrollY, document.documentElement.scrollTop);

    const scheduleIdleRestore = () => {
      clearIdleTimer();
      idleTimer = window.setTimeout(() => {
        idleTimer = 0;
        updateMinimized(false);
      }, 400);
    };

    const onScroll = () => {
      const current = scrollTop();
      const delta = current - lastScrollTop;
      lastScrollTop = current;
      if (current <= 8) {
        scrollIntent = 0;
        clearIdleTimer();
        updateMinimized(false);
        return;
      }
      if (delta === 0) return;
      scrollIntent += delta;
      if (scrollIntent >= 12) {
        updateMinimized(true);
        scrollIntent = 0;
      } else if (scrollIntent <= -24) {
        updateMinimized(false);
        scrollIntent = 0;
        clearIdleTimer();
        return;
      }
      if (navigationMinimizedRef.current) scheduleIdleRestore();
    };

    const bindScrollTarget = () => {
      eventTarget?.removeEventListener("scroll", onScroll);
      eventTarget = window.matchMedia("(min-width: 56rem)").matches
        ? window
        : scrollRef.current!;
      lastScrollTop = scrollTop();
      scrollIntent = 0;
      eventTarget.addEventListener("scroll", onScroll, { passive: true });
    };

    const media = window.matchMedia("(min-width: 56rem)");
    bindScrollTarget();
    media.addEventListener("change", bindScrollTarget);
    return () => {
      clearIdleTimer();
      eventTarget.removeEventListener("scroll", onScroll);
      media.removeEventListener("change", bindScrollTarget);
    };
  }, []);

  useEffect(() => {
    const navigation = navigationRef.current;
    const active = activeNavigationRef.current;
    if (!navigation || !active || navigationMinimized || bubblePending) return;
    const positionBubble = () => {
      const navigationRect = navigation.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      navigation.style.setProperty(
        "--home-nav-bubble-width",
        `${activeRect.width}px`,
      );
      navigation.style.setProperty(
        "--home-nav-bubble-height",
        `${activeRect.height}px`,
      );
      navigation.style.setProperty(
        "--home-nav-bubble-x",
        `${activeRect.left - navigationRect.left}px`,
      );
      navigation.style.setProperty(
        "--home-nav-bubble-y",
        `${activeRect.top - navigationRect.top}px`,
      );
    };
    const observer = new ResizeObserver(positionBubble);
    observer.observe(navigation);
    positionBubble();
    return () => observer.disconnect();
  }, [bubblePending, navigationMinimized]);

  const restoreNavigation = () => {
    navigationMinimizedRef.current = false;
    setNavigationMinimized(false);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;
    setBubblePending(true);
    window.setTimeout(() => setBubblePending(false), 560);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    window.requestAnimationFrame(() => settingsTriggerRef.current?.focus());
  };

  const containSettingsFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSettings();
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

  const applyLayout = (value: HomeLayoutPreference) => {
    setLayout(value);
    document.documentElement.dataset.homeLayout = value;
    persistPreference(homeLayoutPreferenceKey, value);
  };

  const nextTheme = nextValue(themePreferences, theme);
  const nextLayout = nextValue(homeLayoutPreferences, layout);

  return (
    <div className={styles.stage}>
      <div className={`${styles.app} yoyi-paper yoyi-paper--visible`}>
        <div
          className={styles.primaryShell}
          aria-hidden={settingsOpen || undefined}
        >
          <header className={styles.topBar}>
            <div
              aria-label="首页内容范围"
              className={styles.tabs}
              role="tablist"
            >
              <button
                aria-label="发现"
                aria-selected="true"
                className={styles.selectedTab}
                role="tab"
                type="button"
              >
                <span>发现</span>
              </button>
              <button
                aria-disabled="true"
                aria-label="附近"
                aria-selected="false"
                disabled
                role="tab"
                type="button"
              >
                <span>附近</span>
              </button>
              <button
                aria-disabled="true"
                aria-label="专题"
                aria-selected="false"
                disabled
                role="tab"
                type="button"
              >
                <span>专题</span>
              </button>
            </div>
            <button
              aria-label="打开设置"
              className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md"
              onClick={() => setSettingsOpen(true)}
              ref={settingsTriggerRef}
              type="button"
            >
              {icon("settings")}
            </button>
          </header>
          <main className={styles.scroll} data-home-scroll ref={scrollRef}>
            {children}
          </main>
        </div>

        <nav
          aria-label="主导航"
          className={`yoyi-mobile-bottom-navigation yoyi-functional-glass ${styles.bottomNavigation} ${navigationMinimized ? "is-minimized" : ""}`}
          data-bubble-pending={bubblePending || undefined}
          data-minimized={navigationMinimized || undefined}
          hidden={settingsOpen}
          ref={navigationRef}
        >
          <span aria-hidden="true" className="yoyi-nav-bubble" />
          <button
            aria-current="page"
            aria-label="首页"
            className="yoyi-navigation-entry is-active"
            onClick={() => {
              if (navigationMinimized) restoreNavigation();
            }}
            ref={activeNavigationRef}
            type="button"
          >
            <span aria-hidden="true" className={styles.navigationIconWrap}>
              {icon("home")}
            </span>
            <span
              aria-hidden="true"
              className="yoyi-fixed-label"
              data-label="nav-home"
            />
          </button>
          <button
            aria-disabled="true"
            aria-label="碑刻"
            className="yoyi-navigation-entry"
            disabled
            type="button"
          >
            <span aria-hidden="true" className={styles.navigationIconWrap}>
              {icon("inscriptions")}
            </span>
            <span
              aria-hidden="true"
              className="yoyi-fixed-label"
              data-label="nav-inscriptions"
            />
          </button>
          <button
            aria-disabled="true"
            aria-label="书帖"
            className="yoyi-navigation-entry"
            disabled
            type="button"
          >
            <span aria-hidden="true" className={styles.navigationIconWrap}>
              {icon("calligraphy")}
            </span>
            <span
              aria-hidden="true"
              className="yoyi-fixed-label"
              data-label="nav-calligraphy"
            />
          </button>
        </nav>

        {settingsOpen ? (
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
                onClick={closeSettings}
                ref={settingsBackRef}
                type="button"
              >
                {icon("back")}
              </button>
              <h1>设置</h1>
              <span aria-hidden="true" className={styles.topBarSpacer} />
            </header>
            <main className={styles.settingsContent}>
              <form className={styles.settingsForm}>
                <fieldset className={styles.settingGroup}>
                  <legend className="yoyi-visually-hidden">显示</legend>
                  <div className={styles.settingToggles}>
                    <button
                      aria-label={`切换主题：当前${themeLabels[theme]}`}
                      className={`yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md ${styles.settingToggle}`}
                      data-theme-mode={theme}
                      onClick={() => applyTheme(nextTheme)}
                      title={themeLabels[theme]}
                      type="button"
                    >
                      {icon(`theme-${theme}`)}
                    </button>
                    <button
                      aria-label={`切换布局：当前${layoutLabels[layout]}`}
                      className={`yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md ${styles.settingToggle} ${styles.layoutToggle}`}
                      data-layout-mode={layout}
                      onClick={() => applyLayout(nextLayout)}
                      title={layoutLabels[layout]}
                      type="button"
                    >
                      {icon(`layout-${layout}`)}
                    </button>
                  </div>
                </fieldset>
              </form>
            </main>
          </section>
        ) : null}
      </div>
    </div>
  );
}
