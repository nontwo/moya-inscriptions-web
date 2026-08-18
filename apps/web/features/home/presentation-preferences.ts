export const themePreferenceKey = "yoyi.theme-preference";
export const homeLayoutPreferenceKey = "yoyi.home-feed-layout";

export const themePreferences = ["light", "dark", "system"] as const;
export const homeLayoutPreferences = ["single", "double"] as const;

export type ThemePreference = (typeof themePreferences)[number];
export type HomeLayoutPreference = (typeof homeLayoutPreferences)[number];

export const presentationPreferenceBootstrap = `(() => {
  const root = document.documentElement;
  try {
    const theme = localStorage.getItem(${JSON.stringify(themePreferenceKey)});
    if (theme === "light" || theme === "dark") root.dataset.theme = theme;
    else root.removeAttribute("data-theme");
    const layout = localStorage.getItem(${JSON.stringify(homeLayoutPreferenceKey)});
    root.dataset.homeLayout = layout === "single" ? "single" : "double";
  } catch {
    root.removeAttribute("data-theme");
    root.dataset.homeLayout = "double";
  }
})();`;
