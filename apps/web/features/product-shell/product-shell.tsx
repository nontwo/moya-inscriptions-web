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
  detailHistoryState,
  detailLocation,
  directCatalogIdFromLocation,
  directMediaIdFromLocation,
  mergeProductHistoryState,
  parseProductHistoryState,
  primaryHistoryState,
  primaryLocation,
  settingsHistoryState,
  settingsLocation,
  topicHistoryState,
  topicLocation,
  viewerHistoryState,
  viewerLocation,
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

import type { ReactNode, RefObject } from "react";
import type { ProductHistoryState } from "./product-history";
import type { FeedLayoutPreference, ThemePreference } from "./preferences";
import type {
  PresentationOrientation,
  PresentationPlatform,
  RuntimeNavigatorLike,
} from "../shell/device-platform";
import type { PrimaryDestination } from "../shell/primary-shell";

type ScrollPositions = Record<PrimaryDestination, number>;

const currentProductHistoryState = (state: ProductHistoryState) =>
  mergeProductHistoryState(window.history.state, state);

export interface ProductShellContextValue {
  readonly activeCatalogId: string | null;
  readonly activeDestination: PrimaryDestination;
  readonly activeTopicId: string | null;
  readonly activeViewerMediaId: string | null;
  readonly closeTopic: () => void;
  readonly closeViewer: () => void;
  readonly changeViewerMedia: (mediaId: string) => void;
  readonly feedLayout: FeedLayoutPreference;
  readonly openCatalog: (catalogId: string, opener: HTMLElement) => void;
  readonly openViewer: (mediaId: string) => void;
  readonly openTopic: (
    topicId: string,
    opener: HTMLElement,
    sourceScrollTop: number,
  ) => void;
  readonly orientation: PresentationOrientation;
  readonly platform: PresentationPlatform;
  readonly readActiveScrollTop: () => number;
  readonly registerActiveHomeScrollElement: (
    element: HTMLElement,
  ) => () => void;
  readonly registerTopicOpener: (
    topicId: string,
    opener: HTMLButtonElement,
  ) => void;
  readonly requestSettings: (opener?: HTMLElement) => void;
  readonly restoreActiveScrollTop: (top: number) => void;
  readonly settingsOpen: boolean;
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
  readonly primaryUtility?: ReactNode;
  readonly renderDetailOverlay?: (
    properties: ProductShellDetailOverlayRenderProps,
  ) => ReactNode;
  readonly renderTopicOverlay?: (
    properties: ProductShellTopicOverlayRenderProps,
  ) => ReactNode;
  readonly showSettingsEntry?: boolean;
  readonly showDevelopmentPagerControls?: boolean;
}

export interface ProductShellDetailOverlayRenderProps {
  readonly backButtonRef: RefObject<HTMLButtonElement | null>;
  readonly catalogId: string;
  readonly initialScrollTop: number;
  readonly onClose: () => void;
  readonly onScrollTopChange: (top: number) => void;
}

export interface ProductShellTopicOverlayRenderProps {
  readonly backButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
  readonly topicId: string;
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
  primaryUtility,
  renderDetailOverlay,
  renderTopicOverlay,
  showSettingsEntry = true,
  showDevelopmentPagerControls = false,
}: ProductShellProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const settingsBackRef = useRef<HTMLButtonElement>(null);
  const detailBackRef = useRef<HTMLButtonElement>(null);
  const topicBackRef = useRef<HTMLButtonElement>(null);
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  const detailOpenerIdRef = useRef<string | null>(null);
  const detailHistoryFrameRef = useRef<number | null>(null);
  const detailScrollTopRef = useRef(0);
  const detailSourceDestinationRef = useRef<PrimaryDestination>("home");
  const detailSourceScrollTopRef = useRef(0);
  const topicOpenerRef = useRef<HTMLElement | null>(null);
  const topicOpenerIdRef = useRef<string | null>(null);
  const topicSourceScrollTopRef = useRef(0);
  const settingsOpenerRef = useRef<HTMLElement | null>(null);
  const activeHomeScrollElementRef = useRef<HTMLElement | null>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const topicFocusFrameRef = useRef<number | null>(null);
  const navigationIdleTimerRef = useRef<number | null>(null);
  const navigationMinimizedRef = useRef(false);
  const navigationScrollStateRef = useRef(
    createPrimaryNavigationScrollState(0),
  );
  const scrollRestorePendingRef = useRef(false);
  const activeDestinationRef = useRef<PrimaryDestination>("home");
  const platformRef = useRef<PresentationPlatform>(initialPlatform);
  const settingsOpenRef = useRef(false);
  const catalogIdRef = useRef<string | null>(null);
  const viewerMediaIdRef = useRef<string | null>(null);
  const topicIdRef = useRef<string | null>(null);
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
  const [activeCatalogId, setActiveCatalogId] = useState<string | null>(null);
  const [activeViewerMediaId, setActiveViewerMediaId] = useState<string | null>(
    null,
  );
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [navigationMinimized, setNavigationMinimized] = useState(false);
  const [activeHomeScrollElement, setActiveHomeScrollElement] =
    useState<HTMLElement | null>(null);
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

  const registerActiveHomeScrollElement = useCallback(
    (element: HTMLElement) => {
      activeHomeScrollElementRef.current = element;
      setActiveHomeScrollElement((current) =>
        current === element ? current : element,
      );
      return () => {
        if (activeHomeScrollElementRef.current !== element) return;
        activeHomeScrollElementRef.current = null;
        setActiveHomeScrollElement((current) =>
          current === element ? null : current,
        );
      };
    },
    [],
  );

  const scrollElementFor = useCallback(
    (
      destination: PrimaryDestination,
      presentationPlatform: PresentationPlatform,
    ): Element | null => {
      if (presentationPlatform === "pc") return documentScrollElement();
      if (
        destination === "home" &&
        activeHomeScrollElementRef.current !== null
      ) {
        return activeHomeScrollElementRef.current;
      }
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

  const readActiveScrollTop = useCallback(() => {
    const element = scrollElementFor(
      activeDestinationRef.current,
      platformRef.current,
    );
    if (element === null) return 0;
    return platformRef.current === "pc"
      ? documentScrollElement().scrollTop
      : (element as HTMLElement).scrollTop;
  }, [scrollElementFor]);

  const restoreActiveScrollTop = useCallback(
    (top: number) => {
      const destination = activeDestinationRef.current;
      scrollPositionsRef.current[destination] = Number.isFinite(top)
        ? Math.max(0, top)
        : 0;
      restoreScroll(destination, platformRef.current);
    },
    [restoreScroll],
  );

  const restoreTopicFocus = useCallback((topicId: string) => {
    if (topicFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(topicFocusFrameRef.current);
    }
    topicFocusFrameRef.current = window.requestAnimationFrame(() => {
      topicFocusFrameRef.current = window.requestAnimationFrame(() => {
        topicFocusFrameRef.current = null;
        const registered = topicOpenerRef.current;
        const opener =
          registered !== null && topicOpenerIdRef.current === topicId
            ? registered
            : Array.from(
                rootRef.current?.querySelectorAll<HTMLButtonElement>(
                  "[data-topic-id]",
                ) ?? [],
              ).find((button) => button.dataset.topicId === topicId);
        if (opener !== undefined && opener !== null) {
          topicOpenerRef.current = opener;
          topicOpenerIdRef.current = topicId;
          opener.focus({ preventScroll: true });
          return;
        }
        rootRef.current
          ?.querySelector<HTMLElement>("[data-home-surface]")
          ?.focus({ preventScroll: true });
      });
    });
  }, []);

  const restoreCatalogFocus = useCallback((catalogId: string) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const registered = detailOpenerRef.current;
        const registeredCatalogId =
          registered?.closest<HTMLElement>("[data-catalog-id]")?.dataset
            .catalogId;
        const opener =
          registered !== null &&
          detailOpenerIdRef.current === catalogId &&
          registeredCatalogId === catalogId
            ? registered
            : Array.from(
                rootRef.current?.querySelectorAll<HTMLButtonElement>(
                  "[data-open-catalog]",
                ) ?? [],
              ).find(
                (button) =>
                  button.closest<HTMLElement>("[data-catalog-id]")?.dataset
                    .catalogId === catalogId,
              );
        if (opener !== undefined && opener !== null) {
          detailOpenerRef.current = opener;
          detailOpenerIdRef.current = catalogId;
          opener.focus({ preventScroll: true });
        }
      });
    });
  }, []);

  const commitDestination = useCallback(
    (destination: PrimaryDestination) => {
      const current = activeDestinationRef.current;
      if (
        destination === current ||
        settingsOpenRef.current ||
        catalogIdRef.current !== null ||
        topicIdRef.current !== null
      ) {
        return;
      }

      expandNavigation();
      saveScroll(current, platformRef.current);
      activeDestinationRef.current = destination;
      setActiveDestination(destination);
      window.history.replaceState(
        currentProductHistoryState(primaryHistoryState(destination)),
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

  const setDetailVisibility = useCallback((catalogId: string | null) => {
    catalogIdRef.current = catalogId;
    setActiveCatalogId(catalogId);
  }, []);

  const setViewerVisibility = useCallback((mediaId: string | null) => {
    viewerMediaIdRef.current = mediaId;
    setActiveViewerMediaId(mediaId);
  }, []);

  const setTopicVisibility = useCallback((topicId: string | null) => {
    topicIdRef.current = topicId;
    setActiveTopicId(topicId);
  }, []);

  const registerTopicOpener = useCallback(
    (topicId: string, opener: HTMLButtonElement) => {
      if (topicIdRef.current === topicId) {
        topicOpenerRef.current = opener;
        topicOpenerIdRef.current = topicId;
      }
    },
    [],
  );

  const openSettings = useCallback(
    (opener: HTMLElement) => {
      if (
        settingsOpenRef.current ||
        catalogIdRef.current !== null ||
        topicIdRef.current !== null
      ) {
        return;
      }
      const sourceDestination = activeDestinationRef.current;
      saveScroll(sourceDestination, platformRef.current);
      settingsOpenerRef.current = opener;
      window.history.pushState(
        currentProductHistoryState(settingsHistoryState(sourceDestination)),
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
      currentProductHistoryState(
        primaryHistoryState(activeDestinationRef.current),
      ),
      "",
      primaryLocation(window.location),
    );
    restoreScroll(activeDestinationRef.current, platformRef.current);
  }, [restoreScroll, setSettingsVisibility]);

  const requestSettings = useCallback(
    (requestedOpener?: HTMLElement) => {
      const opener =
        requestedOpener ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : rootRef.current);
      if (opener !== null) openSettings(opener);
    },
    [openSettings],
  );

  const openTopic = useCallback(
    (topicId: string, opener: HTMLElement, sourceScrollTop: number) => {
      if (
        topicId.length === 0 ||
        activeDestinationRef.current !== "home" ||
        settingsOpenRef.current ||
        catalogIdRef.current !== null ||
        topicIdRef.current !== null
      ) {
        return;
      }
      saveScroll("home", platformRef.current);
      const boundedScrollTop = Number.isFinite(sourceScrollTop)
        ? Math.max(0, sourceScrollTop)
        : readActiveScrollTop();
      topicSourceScrollTopRef.current = boundedScrollTop;
      scrollPositionsRef.current.home = boundedScrollTop;
      topicOpenerRef.current = opener;
      topicOpenerIdRef.current = topicId;
      window.history.replaceState(
        currentProductHistoryState(
          primaryHistoryState("home", boundedScrollTop, topicId),
        ),
        "",
        primaryLocation(window.location),
      );
      window.history.pushState(
        currentProductHistoryState(
          topicHistoryState(topicId, boundedScrollTop),
        ),
        "",
        topicLocation(window.location, topicId),
      );
      setTopicVisibility(topicId);
    },
    [readActiveScrollTop, saveScroll, setTopicVisibility],
  );

  const closeTopic = useCallback(() => {
    const state = parseProductHistoryState(window.history.state);
    if (state?.kind === "topic") {
      window.history.back();
      return;
    }
    setTopicVisibility(null);
    window.history.replaceState(
      currentProductHistoryState(primaryHistoryState("home")),
      "",
      primaryLocation(window.location),
    );
    restoreScroll("home", platformRef.current);
  }, [restoreScroll, setTopicVisibility]);

  const updateDetailScrollTop = useCallback((top: number) => {
    detailScrollTopRef.current = Number.isFinite(top) ? Math.max(0, top) : 0;
    if (detailHistoryFrameRef.current !== null) return;
    detailHistoryFrameRef.current = window.requestAnimationFrame(() => {
      detailHistoryFrameRef.current = null;
      const state = parseProductHistoryState(window.history.state);
      if (state?.kind === "detail") {
        window.history.replaceState(
          currentProductHistoryState(
            detailHistoryState(
              state.catalogId,
              state.sourceDestination,
              state.sourceScrollTop,
              detailScrollTopRef.current,
            ),
          ),
          "",
          detailLocation(window.location, state.catalogId),
        );
      } else if (state?.kind === "viewer") {
        window.history.replaceState(
          currentProductHistoryState(
            viewerHistoryState(
              state.catalogId,
              state.mediaId,
              state.sourceDestination,
              state.sourceScrollTop,
              detailScrollTopRef.current,
            ),
          ),
          "",
          viewerLocation(window.location, state.catalogId, state.mediaId),
        );
      }
    });
  }, []);

  const openCatalog = useCallback(
    (catalogId: string, opener: HTMLElement) => {
      if (
        catalogId.length === 0 ||
        catalogId.length > 128 ||
        /\s/u.test(catalogId) ||
        settingsOpenRef.current ||
        topicIdRef.current !== null ||
        catalogIdRef.current !== null
      ) {
        return;
      }
      const sourceDestination = activeDestinationRef.current;
      saveScroll(sourceDestination, platformRef.current);
      const sourceScrollTop = readActiveScrollTop();
      scrollPositionsRef.current[sourceDestination] = sourceScrollTop;
      detailOpenerRef.current = opener;
      detailOpenerIdRef.current = catalogId;
      detailSourceDestinationRef.current = sourceDestination;
      detailSourceScrollTopRef.current = sourceScrollTop;
      detailScrollTopRef.current = 0;
      window.history.replaceState(
        currentProductHistoryState(
          primaryHistoryState(
            sourceDestination,
            sourceScrollTop,
            undefined,
            catalogId,
          ),
        ),
        "",
        primaryLocation(window.location),
      );
      window.history.pushState(
        currentProductHistoryState(
          detailHistoryState(catalogId, sourceDestination, sourceScrollTop),
        ),
        "",
        detailLocation(window.location, catalogId),
      );
      setDetailVisibility(catalogId);
    },
    [readActiveScrollTop, saveScroll, setDetailVisibility],
  );

  const openViewer = useCallback(
    (mediaId: string) => {
      const catalogId = catalogIdRef.current;
      if (
        catalogId === null ||
        viewerMediaIdRef.current !== null ||
        mediaId.length === 0 ||
        mediaId.length > 128 ||
        /\s/u.test(mediaId)
      ) {
        return;
      }
      const current = parseProductHistoryState(window.history.state);
      const sourceDestination =
        current?.kind === "detail"
          ? current.sourceDestination
          : detailSourceDestinationRef.current;
      const sourceScrollTop =
        current?.kind === "detail"
          ? current.sourceScrollTop
          : detailSourceScrollTopRef.current;
      window.history.replaceState(
        currentProductHistoryState(
          detailHistoryState(
            catalogId,
            sourceDestination,
            sourceScrollTop,
            detailScrollTopRef.current,
          ),
        ),
        "",
        detailLocation(window.location, catalogId),
      );
      window.history.pushState(
        currentProductHistoryState(
          viewerHistoryState(
            catalogId,
            mediaId,
            sourceDestination,
            sourceScrollTop,
            detailScrollTopRef.current,
          ),
        ),
        "",
        viewerLocation(window.location, catalogId, mediaId),
      );
      setViewerVisibility(mediaId);
    },
    [setViewerVisibility],
  );

  const changeViewerMedia = useCallback(
    (mediaId: string) => {
      if (mediaId.length === 0 || mediaId.length > 128 || /\s/u.test(mediaId)) {
        return;
      }
      const state = parseProductHistoryState(window.history.state);
      if (state?.kind !== "viewer" || state.mediaId === mediaId) return;
      window.history.replaceState(
        currentProductHistoryState(
          viewerHistoryState(
            state.catalogId,
            mediaId,
            state.sourceDestination,
            state.sourceScrollTop,
            detailScrollTopRef.current,
          ),
        ),
        "",
        viewerLocation(window.location, state.catalogId, mediaId),
      );
      setViewerVisibility(mediaId);
    },
    [setViewerVisibility],
  );

  const closeViewer = useCallback(() => {
    const state = parseProductHistoryState(window.history.state);
    if (state?.kind === "viewer") {
      window.history.back();
      return;
    }
    const catalogId = catalogIdRef.current;
    setViewerVisibility(null);
    if (catalogId === null) return;
    window.history.replaceState(
      currentProductHistoryState(
        detailHistoryState(
          catalogId,
          detailSourceDestinationRef.current,
          detailSourceScrollTopRef.current,
          detailScrollTopRef.current,
        ),
      ),
      "",
      detailLocation(window.location, catalogId),
    );
  }, [setViewerVisibility]);

  const closeDetail = useCallback(() => {
    if (viewerMediaIdRef.current !== null) {
      closeViewer();
      return;
    }
    if (detailHistoryFrameRef.current !== null) {
      window.cancelAnimationFrame(detailHistoryFrameRef.current);
      detailHistoryFrameRef.current = null;
    }
    const state = parseProductHistoryState(window.history.state);
    if (state?.kind === "detail") {
      window.history.replaceState(
        currentProductHistoryState(
          detailHistoryState(
            state.catalogId,
            state.sourceDestination,
            state.sourceScrollTop,
            detailScrollTopRef.current,
          ),
        ),
        "",
        detailLocation(window.location, state.catalogId),
      );
      window.history.back();
      return;
    }
    const sourceDestination = detailSourceDestinationRef.current;
    setViewerVisibility(null);
    setDetailVisibility(null);
    window.history.replaceState(
      currentProductHistoryState(
        primaryHistoryState(
          sourceDestination,
          detailSourceScrollTopRef.current,
          undefined,
          detailOpenerIdRef.current ?? undefined,
        ),
      ),
      "",
      primaryLocation(window.location),
    );
    scrollPositionsRef.current[sourceDestination] =
      detailSourceScrollTopRef.current;
    restoreScroll(sourceDestination, platformRef.current);
    if (detailOpenerIdRef.current !== null) {
      restoreCatalogFocus(detailOpenerIdRef.current);
    }
  }, [
    closeViewer,
    restoreCatalogFocus,
    restoreScroll,
    setDetailVisibility,
    setViewerVisibility,
  ]);

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
    if (settingsOpen || activeCatalogId !== null || activeTopicId !== null) {
      return undefined;
    }
    if (platform === "pc") {
      expandNavigation();
      return undefined;
    }

    const scrollElement =
      activeDestination === "home" && activeHomeScrollElement !== null
        ? activeHomeScrollElement
        : scrollElementFor(activeDestination, platform);
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
    activeHomeScrollElement,
    activeCatalogId,
    activeTopicId,
    expandNavigation,
    platform,
    scrollElementFor,
    setNavigationMinimizedState,
    settingsOpen,
  ]);

  useEffect(() => {
    const initialState = parseProductHistoryState(window.history.state);
    const directCatalogId = directCatalogIdFromLocation(window.location);
    const directMediaId = directMediaIdFromLocation(window.location);
    const directSettings = window.location.hash === "#settings";
    let destination: PrimaryDestination = "home";

    if (initialState?.kind === "primary") {
      destination = initialState.destination;
    } else if (
      initialState?.kind === "settings" ||
      initialState?.kind === "detail" ||
      initialState?.kind === "viewer"
    ) {
      destination = initialState.sourceDestination;
    }

    activeDestinationRef.current = destination;
    setActiveDestination(destination);
    if (
      initialState?.kind === "primary" &&
      initialState.scrollTop !== undefined
    ) {
      scrollPositionsRef.current[destination] = initialState.scrollTop;
    }

    if (initialState?.kind === "detail" || initialState?.kind === "viewer") {
      detailSourceDestinationRef.current = initialState.sourceDestination;
      detailSourceScrollTopRef.current = initialState.sourceScrollTop;
      detailScrollTopRef.current = initialState.detailScrollTop;
      detailOpenerIdRef.current = initialState.catalogId;
      scrollPositionsRef.current[initialState.sourceDestination] =
        initialState.sourceScrollTop;
      setSettingsVisibility(false);
      setTopicVisibility(null);
      setDetailVisibility(initialState.catalogId);
      setViewerVisibility(
        initialState.kind === "viewer" ? initialState.mediaId : null,
      );
    } else if (initialState?.kind === "topic") {
      topicSourceScrollTopRef.current = initialState.sourceScrollTop;
      scrollPositionsRef.current.home = initialState.sourceScrollTop;
      setSettingsVisibility(false);
      setDetailVisibility(null);
      setViewerVisibility(null);
      setTopicVisibility(initialState.topicId);
    } else if (initialState?.kind === "settings") {
      setSettingsVisibility(true);
      setDetailVisibility(null);
      setViewerVisibility(null);
      setTopicVisibility(null);
    } else if (directCatalogId !== null) {
      const sourceScrollTop =
        initialState?.kind === "primary" && initialState.scrollTop !== undefined
          ? initialState.scrollTop
          : 0;
      detailSourceDestinationRef.current = destination;
      detailSourceScrollTopRef.current = sourceScrollTop;
      detailScrollTopRef.current = 0;
      detailOpenerIdRef.current = directCatalogId;
      scrollPositionsRef.current[destination] = sourceScrollTop;
      window.history.replaceState(
        currentProductHistoryState(
          primaryHistoryState(
            destination,
            sourceScrollTop,
            undefined,
            directCatalogId,
          ),
        ),
        "",
        primaryLocation(window.location),
      );
      window.history.pushState(
        currentProductHistoryState(
          detailHistoryState(directCatalogId, destination, sourceScrollTop),
        ),
        "",
        detailLocation(window.location, directCatalogId),
      );
      if (directMediaId !== null) {
        window.history.pushState(
          currentProductHistoryState(
            viewerHistoryState(
              directCatalogId,
              directMediaId,
              destination,
              sourceScrollTop,
            ),
          ),
          "",
          viewerLocation(window.location, directCatalogId, directMediaId),
        );
      }
      setSettingsVisibility(false);
      setTopicVisibility(null);
      setDetailVisibility(directCatalogId);
      setViewerVisibility(directMediaId);
    } else if (directSettings) {
      window.history.replaceState(
        currentProductHistoryState(primaryHistoryState(destination)),
        "",
        primaryLocation(window.location),
      );
      window.history.pushState(
        currentProductHistoryState(settingsHistoryState(destination)),
        "",
        settingsLocation(window.location),
      );
      setSettingsVisibility(true);
      setDetailVisibility(null);
      setViewerVisibility(null);
      setTopicVisibility(null);
    } else {
      window.history.replaceState(
        currentProductHistoryState(
          primaryHistoryState(
            destination,
            initialState?.kind === "primary"
              ? initialState.scrollTop
              : undefined,
            initialState?.kind === "primary"
              ? initialState.focusTopicId
              : undefined,
            initialState?.kind === "primary"
              ? initialState.focusCatalogId
              : undefined,
          ),
        ),
        "",
        primaryLocation(window.location),
      );
      setSettingsVisibility(false);
      setDetailVisibility(null);
      setViewerVisibility(null);
      setTopicVisibility(null);
      if (
        initialState?.kind === "primary" &&
        initialState.scrollTop !== undefined
      ) {
        restoreScroll(destination, platformRef.current);
      }
      if (
        initialState?.kind === "primary" &&
        initialState.focusTopicId !== undefined
      ) {
        restoreTopicFocus(initialState.focusTopicId);
      } else if (
        initialState?.kind === "primary" &&
        initialState.focusCatalogId !== undefined
      ) {
        restoreCatalogFocus(initialState.focusCatalogId);
      }
    }

    const handlePopState = (event: PopStateEvent) => {
      const state = parseProductHistoryState(event.state);
      const wasDetailOpen = catalogIdRef.current !== null;
      const wasSettingsOpen = settingsOpenRef.current;
      const wasTopicOpen = topicIdRef.current !== null;
      if (!wasDetailOpen && !wasTopicOpen) {
        saveScroll(activeDestinationRef.current, platformRef.current);
      }

      if (state?.kind === "detail" || state?.kind === "viewer") {
        activeDestinationRef.current = state.sourceDestination;
        setActiveDestination(state.sourceDestination);
        detailSourceDestinationRef.current = state.sourceDestination;
        detailSourceScrollTopRef.current = state.sourceScrollTop;
        detailScrollTopRef.current = state.detailScrollTop;
        detailOpenerIdRef.current = state.catalogId;
        scrollPositionsRef.current[state.sourceDestination] =
          state.sourceScrollTop;
        setSettingsVisibility(false);
        setTopicVisibility(null);
        setDetailVisibility(state.catalogId);
        setViewerVisibility(state.kind === "viewer" ? state.mediaId : null);
        return;
      }

      if (state?.kind === "settings") {
        activeDestinationRef.current = state.sourceDestination;
        setActiveDestination(state.sourceDestination);
        setDetailVisibility(null);
        setViewerVisibility(null);
        setTopicVisibility(null);
        setSettingsVisibility(true);
        return;
      }

      if (state?.kind === "topic") {
        activeDestinationRef.current = "home";
        setActiveDestination("home");
        topicSourceScrollTopRef.current = state.sourceScrollTop;
        scrollPositionsRef.current.home = state.sourceScrollTop;
        setSettingsVisibility(false);
        setDetailVisibility(null);
        setViewerVisibility(null);
        setTopicVisibility(state.topicId);
        return;
      }

      const nextDestination =
        state?.kind === "primary" ? state.destination : "home";
      if (
        !wasSettingsOpen &&
        !wasDetailOpen &&
        nextDestination !== activeDestinationRef.current
      ) {
        expandNavigation();
      }
      activeDestinationRef.current = nextDestination;
      setActiveDestination(nextDestination);
      setDetailVisibility(null);
      setViewerVisibility(null);
      setTopicVisibility(null);
      setSettingsVisibility(false);
      if (state?.kind === "primary" && state.scrollTop !== undefined) {
        scrollPositionsRef.current[nextDestination] = state.scrollTop;
      } else if (wasDetailOpen) {
        scrollPositionsRef.current[detailSourceDestinationRef.current] =
          detailSourceScrollTopRef.current;
      } else if (wasTopicOpen) {
        scrollPositionsRef.current.home = topicSourceScrollTopRef.current;
      }
      restoreScroll(nextDestination, platformRef.current);

      if (wasDetailOpen && state?.kind === "primary") {
        const focusCatalogId =
          state.focusCatalogId ?? detailOpenerIdRef.current;
        if (focusCatalogId !== null && focusCatalogId !== undefined) {
          restoreCatalogFocus(focusCatalogId);
        }
      } else if (wasSettingsOpen) {
        window.requestAnimationFrame(() => settingsOpenerRef.current?.focus());
      } else if (
        wasTopicOpen &&
        state?.kind === "primary" &&
        state.focusTopicId !== undefined
      ) {
        restoreTopicFocus(state.focusTopicId);
      } else if (wasTopicOpen) {
        window.requestAnimationFrame(() => topicOpenerRef.current?.focus());
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [
    expandNavigation,
    restoreCatalogFocus,
    restoreScroll,
    restoreTopicFocus,
    saveScroll,
    setDetailVisibility,
    setSettingsVisibility,
    setTopicVisibility,
    setViewerVisibility,
  ]);

  useLayoutEffect(() => {
    if (!settingsOpen && activeCatalogId === null && activeTopicId === null) {
      return undefined;
    }
    if (settingsOpen) settingsBackRef.current?.focus();
    else if (activeCatalogId !== null) detailBackRef.current?.focus();
    else topicBackRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeCatalogId, activeTopicId, settingsOpen]);

  useEffect(
    () => () => {
      if (restoreFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFrameRef.current);
      }
      if (topicFocusFrameRef.current !== null) {
        window.cancelAnimationFrame(topicFocusFrameRef.current);
      }
      if (detailHistoryFrameRef.current !== null) {
        window.cancelAnimationFrame(detailHistoryFrameRef.current);
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
    activeCatalogId,
    activeDestination,
    activeTopicId,
    activeViewerMediaId,
    changeViewerMedia,
    closeViewer,
    closeTopic,
    feedLayout,
    openCatalog,
    openViewer,
    openTopic,
    orientation,
    platform,
    readActiveScrollTop,
    registerActiveHomeScrollElement,
    registerTopicOpener,
    requestSettings,
    restoreActiveScrollTop,
    settingsOpen,
    theme,
  };
  const ownedOverlayOpen =
    settingsOpen || activeCatalogId !== null || activeTopicId !== null;

  return (
    <ProductShellContext.Provider value={contextValue}>
      <div
        ref={rootRef}
        className={styles.productShell}
        data-active-destination={activeDestination}
        data-feed-layout={feedLayout}
        data-detail-open={activeCatalogId === null ? "false" : "true"}
        data-orientation={orientation}
        data-primary-navigation-minimized={
          navigationMinimized ? "true" : "false"
        }
        data-platform={platform}
        data-product-shell=""
        data-settings-open={settingsOpen ? "true" : "false"}
        data-topic-open={activeTopicId === null ? "false" : "true"}
        data-viewer-open={activeViewerMediaId === null ? "false" : "true"}
        data-theme-preference={theme}
      >
        <div
          aria-hidden={ownedOverlayOpen || undefined}
          className={styles.primaryLayer}
          data-product-primary-layer=""
          inert={ownedOverlayOpen || undefined}
        >
          <PrimaryNavigationPager
            activeDestination={activeDestination}
            calligraphy={calligraphy}
            home={home}
            inscriptions={inscriptions}
            navigationHidden={ownedOverlayOpen}
            navigationMinimized={navigationMinimized}
            onNavigationExpand={expandNavigation}
            onDestinationChange={commitDestination}
            platform={platform}
            showDevelopmentPagerControls={showDevelopmentPagerControls}
          />
          {primaryUtility}
          {showSettingsEntry ? (
            <button
              type="button"
              aria-label="打开设置"
              className={`${styles.settingsButton} yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md yoyi-functional-glass`}
              data-open-settings=""
              onClick={(event) => openSettings(event.currentTarget)}
            >
              <Icon name="settings" />
            </button>
          ) : null}
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

        {activeTopicId === null || renderTopicOverlay === undefined
          ? null
          : renderTopicOverlay({
              backButtonRef: topicBackRef,
              onClose: closeTopic,
              topicId: activeTopicId,
            })}

        {activeCatalogId === null || renderDetailOverlay === undefined
          ? null
          : renderDetailOverlay({
              backButtonRef: detailBackRef,
              catalogId: activeCatalogId,
              initialScrollTop: detailScrollTopRef.current,
              onClose: closeDetail,
              onScrollTopChange: updateDetailScrollTop,
            })}

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
