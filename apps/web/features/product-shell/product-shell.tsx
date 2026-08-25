"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Icon, LoadingScreen } from "@moya/ui";

import styles from "./product-shell.module.css";

import { PRODUCT_LOADING_MINIMUM_MS } from "./product-boot";
import {
  parseProductHistoryState,
  primaryHistoryState,
  primaryLocation,
  settingsHistoryState,
  settingsLocation,
} from "./product-history";
import {
  FEED_LAYOUT_PREFERENCE_STORAGE_KEY,
  THEME_PREFERENCE_STORAGE_KEY,
  applyFeedLayoutPreferenceToRoot,
  applyThemePreferenceToRoot,
  nextFeedLayoutPreference,
  nextThemePreference,
  persistPreference,
  readStoredFeedLayoutPreference,
  readStoredThemePreference,
} from "./preferences";
import { SettingsOverlay } from "../settings/settings-overlay";
import {
  readRuntimeDeviceClass,
  resolvePresentationOrientation,
  resolveRuntimePresentationPlatform,
} from "../shell/device-platform";
import { PrimaryNavigationPager } from "../shell/primary-navigation-pager";
import {
  createPrimaryNavigationScrollState,
  PRIMARY_NAVIGATION_IDLE_EXPAND_MS,
  resolvePrimaryNavigationScrollState,
  resolvePrimaryNavigationViewportInset,
  synchronizePrimaryNavigationViewportInset,
} from "../shell/primary-navigation-motion";

import type { ReactNode } from "react";
import type { FeedLayoutPreference, ThemePreference } from "./preferences";
import type {
  PresentationOrientation,
  PresentationPlatform,
  RuntimeNavigatorLike,
} from "../shell/device-platform";
import type { PrimaryDestination } from "../shell/primary-shell";

type ScrollPositions = Record<PrimaryDestination, number>;

export interface ProductShellContextValue {
  readonly activeDestination: PrimaryDestination;
  readonly feedLayout: FeedLayoutPreference;
  readonly orientation: PresentationOrientation;
  readonly platform: PresentationPlatform;
  readonly theme: ThemePreference;
}

const ProductShellContext = createContext<ProductShellContextValue | null>(
  null,
);

export const useProductShell = (): ProductShellContextValue => {
  const value = useContext(ProductShellContext);
  if (value === null) {
    throw new Error("useProductShell must be used inside ProductShell");
  }
  return value;
};

export interface ProductShellProps {
  readonly calligraphy: ReactNode;
  readonly developmentPlatformOverride?: PresentationPlatform | null;
  readonly home: ReactNode;
  readonly initialPlatform: PresentationPlatform;
  readonly inscriptions: ReactNode;
  readonly showDevelopmentPagerControls?: boolean;
}

type NavigatorWithUserAgentData = Navigator & RuntimeNavigatorLike;

const runtimePlatform = () =>
  resolveRuntimePresentationPlatform(
    navigator as NavigatorWithUserAgentData,
    window.innerWidth,
  );

const runtimeOrientation = () =>
  resolvePresentationOrientation(window.innerWidth, window.innerHeight);

const documentScrollElement = () =>
  document.scrollingElement ?? document.documentElement;

const clampScrollTop = (element: Element, desired: number) => {
  const scrollingElement = element as HTMLElement;
  const maximum = Math.max(
    0,
    scrollingElement.scrollHeight - scrollingElement.clientHeight,
  );
  return Math.min(Math.max(0, desired), maximum);
};

export const ProductShell = ({
  calligraphy,
  developmentPlatformOverride = null,
  home,
  initialPlatform,
  inscriptions,
  showDevelopmentPagerControls = false,
}: ProductShellProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const settingsBackRef = useRef<HTMLButtonElement>(null);
  const settingsOpenerRef = useRef<HTMLElement | null>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const navigationIdleTimerRef = useRef<number | null>(null);
  const navigationMinimizedRef = useRef(false);
  const navigationScrollStateRef = useRef(
    createPrimaryNavigationScrollState(0),
  );
  const scrollRestorePendingRef = useRef(false);
  const activeDestinationRef = useRef<PrimaryDestination>("home");
  const platformRef = useRef<PresentationPlatform>(initialPlatform);
  const settingsOpenRef = useRef(false);
  const scrollPositionsRef = useRef<ScrollPositions>({
    calligraphy: 0,
    home: 0,
    inscriptions: 0,
  });
  const [activeDestination, setActiveDestination] =
    useState<PrimaryDestination>("home");
  const [platform, setPlatform] =
    useState<PresentationPlatform>(initialPlatform);
  const [orientation, setOrientation] =
    useState<PresentationOrientation>("portrait");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [feedLayout, setFeedLayout] = useState<FeedLayoutPreference>("double");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navigationMinimized, setNavigationMinimized] = useState(false);
  const [bootPending, setBootPending] = useState(true);

  const setNavigationMinimizedState = useCallback((minimized: boolean) => {
    navigationMinimizedRef.current = minimized;
    setNavigationMinimized((current) =>
      current === minimized ? current : minimized,
    );
  }, []);

  const expandNavigation = useCallback(() => {
    if (navigationIdleTimerRef.current !== null) {
      window.clearTimeout(navigationIdleTimerRef.current);
      navigationIdleTimerRef.current = null;
    }
    navigationScrollStateRef.current = {
      ...navigationScrollStateRef.current,
      intent: 0,
      minimized: false,
    };
    setNavigationMinimizedState(false);
  }, [setNavigationMinimizedState]);

  const scrollElementFor = useCallback(
    (
      destination: PrimaryDestination,
      presentationPlatform: PresentationPlatform,
    ): Element | null => {
      if (presentationPlatform === "pc") return documentScrollElement();
      return (
        rootRef.current?.querySelector(
          `[data-primary-destination="${destination}"]`,
        ) ?? null
      );
    },
    [],
  );

  const saveScroll = useCallback(
    (
      destination: PrimaryDestination,
      presentationPlatform: PresentationPlatform,
    ) => {
      const element = scrollElementFor(destination, presentationPlatform);
      if (element === null) return;
      scrollPositionsRef.current[destination] =
        presentationPlatform === "pc"
          ? documentScrollElement().scrollTop
          : (element as HTMLElement).scrollTop;
    },
    [scrollElementFor],
  );

  const restoreScroll = useCallback(
    (
      destination: PrimaryDestination,
      presentationPlatform: PresentationPlatform,
    ) => {
      if (restoreFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFrameRef.current);
      }
      restoreFrameRef.current = window.requestAnimationFrame(() => {
        restoreFrameRef.current = window.requestAnimationFrame(() => {
          restoreFrameRef.current = null;
          const element = scrollElementFor(destination, presentationPlatform);
          if (element === null) return;
          const top = clampScrollTop(
            element,
            scrollPositionsRef.current[destination],
          );
          scrollRestorePendingRef.current = true;
          if (presentationPlatform === "pc") {
            window.scrollTo({ behavior: "auto", top });
          } else {
            (element as HTMLElement).scrollTop = top;
          }
          window.requestAnimationFrame(() => {
            scrollRestorePendingRef.current = false;
          });
        });
      });
    },
    [scrollElementFor],
  );

  const commitDestination = useCallback(
    (destination: PrimaryDestination) => {
      const current = activeDestinationRef.current;
      if (destination === current || settingsOpenRef.current) return;

      expandNavigation();
      saveScroll(current, platformRef.current);
      activeDestinationRef.current = destination;
      setActiveDestination(destination);
      window.history.replaceState(
        primaryHistoryState(destination),
        "",
        primaryLocation(window.location),
      );
      restoreScroll(destination, platformRef.current);
    },
    [expandNavigation, restoreScroll, saveScroll],
  );

  const setSettingsVisibility = useCallback((open: boolean) => {
    settingsOpenRef.current = open;
    setSettingsOpen(open);
  }, []);

  const openSettings = useCallback(
    (opener: HTMLElement) => {
      if (settingsOpenRef.current) return;
      const sourceDestination = activeDestinationRef.current;
      saveScroll(sourceDestination, platformRef.current);
      settingsOpenerRef.current = opener;
      window.history.pushState(
        settingsHistoryState(sourceDestination),
        "",
        settingsLocation(window.location),
      );
      setSettingsVisibility(true);
    },
    [saveScroll, setSettingsVisibility],
  );

  const closeSettings = useCallback(() => {
    const state = parseProductHistoryState(window.history.state);
    if (state?.kind === "settings") {
      window.history.back();
      return;
    }

    setSettingsVisibility(false);
    window.history.replaceState(
      primaryHistoryState(activeDestinationRef.current),
      "",
      primaryLocation(window.location),
    );
    restoreScroll(activeDestinationRef.current, platformRef.current);
  }, [restoreScroll, setSettingsVisibility]);

  useEffect(() => {
    const root = document.documentElement;
    const storedTheme = readStoredThemePreference(window.localStorage);
    const storedFeedLayout = readStoredFeedLayoutPreference(
      window.localStorage,
    );
    setTheme(storedTheme);
    setFeedLayout(storedFeedLayout);
    applyThemePreferenceToRoot(root, storedTheme);
    applyFeedLayoutPreferenceToRoot(root, storedFeedLayout);

    const started = Number(root.dataset.yoyiBootStarted);
    const elapsed = Number.isFinite(started)
      ? Math.max(0, performance.now() - started)
      : PRODUCT_LOADING_MINIMUM_MS;
    const remaining = Math.max(0, PRODUCT_LOADING_MINIMUM_MS - elapsed);
    const loadingTimer = window.setTimeout(() => {
      root.dataset.yoyiBoot = "ready";
      setBootPending(false);
    }, remaining);

    return () => window.clearTimeout(loadingTimer);
  }, []);

  useEffect(() => {
    const synchronizeEffectiveTheme = () => {
      const effective =
        theme === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : theme;
      document.documentElement.dataset.effectiveTheme = effective;
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    synchronizeEffectiveTheme();
    media.addEventListener?.("change", synchronizeEffectiveTheme);
    return () =>
      media.removeEventListener?.("change", synchronizeEffectiveTheme);
  }, [theme]);

  useEffect(() => {
    const synchronizeViewportInset = () => {
      const root = document.documentElement;
      const viewport = window.visualViewport;
      if (platformRef.current === "pc" || viewport == null) {
        synchronizePrimaryNavigationViewportInset(root, null);
        return;
      }
      const inset = resolvePrimaryNavigationViewportInset(
        window.innerHeight,
        viewport.height,
        viewport.offsetTop,
      );
      synchronizePrimaryNavigationViewportInset(root, inset);
    };

    const synchronizeRuntime = () => {
      const nextPlatform = developmentPlatformOverride ?? runtimePlatform();
      const nextOrientation = runtimeOrientation();
      const previousPlatform = platformRef.current;

      if (nextPlatform !== previousPlatform) {
        saveScroll(activeDestinationRef.current, previousPlatform);
        platformRef.current = nextPlatform;
        setPlatform(nextPlatform);
        document.documentElement.dataset.platform = nextPlatform;
        restoreScroll(activeDestinationRef.current, nextPlatform);
      }
      setOrientation((current) =>
        current === nextOrientation ? current : nextOrientation,
      );
      document.documentElement.dataset.orientation = nextOrientation;
      document.documentElement.dataset.deviceClass = readRuntimeDeviceClass(
        navigator as NavigatorWithUserAgentData,
      );
      synchronizeViewportInset();
    };

    synchronizeRuntime();
    window.addEventListener("orientationchange", synchronizeRuntime);
    window.addEventListener("resize", synchronizeRuntime);
    window.visualViewport?.addEventListener("resize", synchronizeRuntime);
    window.visualViewport?.addEventListener(
      "scroll",
      synchronizeViewportInset,
      { passive: true },
    );

    return () => {
      window.removeEventListener("orientationchange", synchronizeRuntime);
      window.removeEventListener("resize", synchronizeRuntime);
      window.visualViewport?.removeEventListener("resize", synchronizeRuntime);
      window.visualViewport?.removeEventListener(
        "scroll",
        synchronizeViewportInset,
      );
    };
  }, [developmentPlatformOverride, restoreScroll, saveScroll]);

  useEffect(() => {
    if (settingsOpen) return undefined;
    if (platform === "pc") {
      expandNavigation();
      return undefined;
    }

    const scrollElement = scrollElementFor(activeDestination, platform);
    if (!(scrollElement instanceof HTMLElement)) return undefined;

    navigationScrollStateRef.current = createPrimaryNavigationScrollState(
      scrollElement.scrollTop,
      navigationMinimizedRef.current,
    );

    const clearIdleTimer = () => {
      if (navigationIdleTimerRef.current === null) return;
      window.clearTimeout(navigationIdleTimerRef.current);
      navigationIdleTimerRef.current = null;
    };
    const scheduleIdleExpansion = () => {
      clearIdleTimer();
      if (!navigationScrollStateRef.current.minimized) return;
      navigationIdleTimerRef.current = window.setTimeout(
        expandNavigation,
        PRIMARY_NAVIGATION_IDLE_EXPAND_MS,
      );
    };
    const handleScroll = () => {
      if (scrollRestorePendingRef.current) {
        navigationScrollStateRef.current = createPrimaryNavigationScrollState(
          scrollElement.scrollTop,
          navigationMinimizedRef.current,
        );
        return;
      }

      const nextState = resolvePrimaryNavigationScrollState(
        navigationScrollStateRef.current,
        scrollElement.scrollTop,
      );
      navigationScrollStateRef.current = nextState;
      setNavigationMinimizedState(nextState.minimized);
      scheduleIdleExpansion();
    };

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearIdleTimer();
      scrollElement.removeEventListener("scroll", handleScroll);
    };
  }, [
    activeDestination,
    expandNavigation,
    platform,
    scrollElementFor,
    setNavigationMinimizedState,
    settingsOpen,
  ]);

  useEffect(() => {
    const initialState = parseProductHistoryState(window.history.state);
    const directSettings = window.location.hash === "#settings";
    let destination: PrimaryDestination = "home";

    if (initialState?.kind === "primary") {
      destination = initialState.destination;
    } else if (initialState?.kind === "settings") {
      destination = initialState.sourceDestination;
    }

    activeDestinationRef.current = destination;
    setActiveDestination(destination);

    if (initialState?.kind === "settings") {
      setSettingsVisibility(true);
    } else if (directSettings) {
      window.history.replaceState(
        primaryHistoryState(destination),
        "",
        primaryLocation(window.location),
      );
      window.history.pushState(
        settingsHistoryState(destination),
        "",
        settingsLocation(window.location),
      );
      setSettingsVisibility(true);
    } else {
      window.history.replaceState(
        primaryHistoryState(destination),
        "",
        primaryLocation(window.location),
      );
      setSettingsVisibility(false);
    }

    const handlePopState = (event: PopStateEvent) => {
      const state = parseProductHistoryState(event.state);
      const wasSettingsOpen = settingsOpenRef.current;
      saveScroll(activeDestinationRef.current, platformRef.current);

      if (state?.kind === "settings") {
        activeDestinationRef.current = state.sourceDestination;
        setActiveDestination(state.sourceDestination);
        setSettingsVisibility(true);
        return;
      }

      const nextDestination =
        state?.kind === "primary" ? state.destination : "home";
      if (
        !wasSettingsOpen &&
        nextDestination !== activeDestinationRef.current
      ) {
        expandNavigation();
      }
      activeDestinationRef.current = nextDestination;
      setActiveDestination(nextDestination);
      setSettingsVisibility(false);
      restoreScroll(nextDestination, platformRef.current);

      if (wasSettingsOpen) {
        window.requestAnimationFrame(() => settingsOpenerRef.current?.focus());
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [expandNavigation, restoreScroll, saveScroll, setSettingsVisibility]);

  useLayoutEffect(() => {
    if (settingsOpen) {
      settingsBackRef.current?.focus();
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
    return undefined;
  }, [settingsOpen]);

  useEffect(
    () => () => {
      if (restoreFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFrameRef.current);
      }
      if (navigationIdleTimerRef.current !== null) {
        window.clearTimeout(navigationIdleTimerRef.current);
      }
      synchronizePrimaryNavigationViewportInset(document.documentElement, null);
    },
    [],
  );

  const cycleTheme = () => {
    const next = nextThemePreference(theme);
    setTheme(next);
    applyThemePreferenceToRoot(document.documentElement, next);
    persistPreference(window.localStorage, THEME_PREFERENCE_STORAGE_KEY, next);
  };

  const cycleFeedLayout = () => {
    const next = nextFeedLayoutPreference(feedLayout);
    setFeedLayout(next);
    applyFeedLayoutPreferenceToRoot(document.documentElement, next);
    persistPreference(
      window.localStorage,
      FEED_LAYOUT_PREFERENCE_STORAGE_KEY,
      next,
    );
  };

  const contextValue: ProductShellContextValue = {
    activeDestination,
    feedLayout,
    orientation,
    platform,
    theme,
  };

  return (
    <ProductShellContext.Provider value={contextValue}>
      <div
        ref={rootRef}
        className={styles.productShell}
        data-active-destination={activeDestination}
        data-feed-layout={feedLayout}
        data-orientation={orientation}
        data-primary-navigation-minimized={
          navigationMinimized ? "true" : "false"
        }
        data-platform={platform}
        data-product-shell=""
        data-settings-open={settingsOpen ? "true" : "false"}
        data-theme-preference={theme}
      >
        <div
          aria-hidden={settingsOpen || undefined}
          className={styles.primaryLayer}
          data-product-primary-layer=""
          inert={settingsOpen || undefined}
        >
          <PrimaryNavigationPager
            activeDestination={activeDestination}
            calligraphy={calligraphy}
            home={home}
            inscriptions={inscriptions}
            navigationHidden={settingsOpen}
            navigationMinimized={navigationMinimized}
            onNavigationExpand={expandNavigation}
            onDestinationChange={commitDestination}
            platform={platform}
            showDevelopmentPagerControls={showDevelopmentPagerControls}
          />
          <button
            type="button"
            aria-label="打开设置"
            className={`${styles.settingsButton} yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md yoyi-functional-glass`}
            data-open-settings=""
            onClick={(event) => openSettings(event.currentTarget)}
          >
            <Icon name="settings" />
          </button>
        </div>

        {settingsOpen ? (
          <SettingsOverlay
            backButtonRef={settingsBackRef}
            feedLayout={feedLayout}
            onClose={closeSettings}
            onCycleFeedLayout={cycleFeedLayout}
            onCycleTheme={cycleTheme}
            platform={platform}
            theme={theme}
          />
        ) : null}

        <LoadingScreen
          active={bootPending}
          className={styles.loading}
          data-product-boot=""
          delay={0}
        />
      </div>
    </ProductShellContext.Provider>
  );
};
