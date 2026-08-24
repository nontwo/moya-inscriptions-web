export const THEME_PREFERENCE_STORAGE_KEY = "yoyi.theme-preference";
export const FEED_LAYOUT_PREFERENCE_STORAGE_KEY = "yoyi.home-feed-layout";

export type ThemePreference = "light" | "dark" | "system";
export type FeedLayoutPreference = "single" | "double";

export const themePreferences = [
  "light",
  "dark",
  "system",
] as const satisfies readonly ThemePreference[];

export const feedLayoutPreferences = [
  "single",
  "double",
] as const satisfies readonly FeedLayoutPreference[];

export const parseThemePreference = (value: unknown): ThemePreference =>
  themePreferences.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";

export const parseFeedLayoutPreference = (
  value: unknown,
): FeedLayoutPreference =>
  feedLayoutPreferences.includes(value as FeedLayoutPreference)
    ? (value as FeedLayoutPreference)
    : "double";

export interface PreferenceStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export const readStoredThemePreference = (
  storage: PreferenceStorage,
): ThemePreference => {
  try {
    return parseThemePreference(storage.getItem(THEME_PREFERENCE_STORAGE_KEY));
  } catch {
    return "system";
  }
};

export const readStoredFeedLayoutPreference = (
  storage: PreferenceStorage,
): FeedLayoutPreference => {
  try {
    return parseFeedLayoutPreference(
      storage.getItem(FEED_LAYOUT_PREFERENCE_STORAGE_KEY),
    );
  } catch {
    return "double";
  }
};

export const persistPreference = (
  storage: PreferenceStorage,
  key: string,
  value: string,
) => {
  try {
    storage.setItem(key, value);
  } catch {
    // Browser privacy settings may disable storage. Session state still works.
  }
};

export const nextThemePreference = (
  current: ThemePreference,
): ThemePreference => {
  const index = themePreferences.indexOf(current);
  return themePreferences[(index + 1) % themePreferences.length] ?? "system";
};

export const nextFeedLayoutPreference = (
  current: FeedLayoutPreference,
): FeedLayoutPreference => (current === "single" ? "double" : "single");

export const applyThemePreferenceToRoot = (
  root: HTMLElement,
  preference: ThemePreference,
) => {
  root.dataset.themePreference = preference;
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.dataset.theme = preference;
  }
};

export const applyFeedLayoutPreferenceToRoot = (
  root: HTMLElement,
  preference: FeedLayoutPreference,
) => {
  root.dataset.homeLayout = preference;
};
