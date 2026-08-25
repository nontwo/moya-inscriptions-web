export const PRIMARY_NAVIGATION_SCROLL_COLLAPSE_PX = 12;
export const PRIMARY_NAVIGATION_SCROLL_EXPAND_PX = 24;
export const PRIMARY_NAVIGATION_SCROLL_TOP_PX = 8;
export const PRIMARY_NAVIGATION_IDLE_EXPAND_MS = 400;

export interface PrimaryNavigationScrollState {
  readonly intent: number;
  readonly lastScrollTop: number;
  readonly minimized: boolean;
}

export const createPrimaryNavigationScrollState = (
  scrollTop: number,
  minimized = false,
): PrimaryNavigationScrollState => ({
  intent: 0,
  lastScrollTop: Math.max(0, scrollTop),
  minimized,
});

export const resolvePrimaryNavigationScrollState = (
  state: PrimaryNavigationScrollState,
  nextScrollTop: number,
): PrimaryNavigationScrollState => {
  const scrollTop = Math.max(0, nextScrollTop);
  const delta = scrollTop - state.lastScrollTop;

  if (scrollTop <= PRIMARY_NAVIGATION_SCROLL_TOP_PX) {
    return createPrimaryNavigationScrollState(scrollTop);
  }
  if (delta === 0) return state;

  const intent =
    Math.sign(delta) === Math.sign(state.intent) ? state.intent + delta : delta;
  const minimized =
    intent >= PRIMARY_NAVIGATION_SCROLL_COLLAPSE_PX
      ? true
      : intent <= -PRIMARY_NAVIGATION_SCROLL_EXPAND_PX
        ? false
        : state.minimized;

  return {
    intent: minimized === state.minimized ? intent : 0,
    lastScrollTop: scrollTop,
    minimized,
  };
};

export const resolvePrimaryNavigationViewportInset = (
  innerHeight: number,
  viewportHeight: number,
  viewportOffsetTop: number,
) => Math.max(0, innerHeight - viewportHeight - viewportOffsetTop);

export const synchronizePrimaryNavigationViewportInset = (
  root: HTMLElement,
  inset: number | null,
) => {
  const property = "--yoyi-bottom-nav-viewport-inset";
  if (inset === null) {
    if (root.style.getPropertyValue(property) !== "") {
      root.style.removeProperty(property);
      return true;
    }
    return false;
  }

  const value = `${inset}px`;
  if (root.style.getPropertyValue(property) === value) return false;
  root.style.setProperty(property, value);
  return true;
};
