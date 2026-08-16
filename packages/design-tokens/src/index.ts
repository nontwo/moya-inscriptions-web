export * from "./colors.js";
export * from "./layout.js";
export * from "./materials.js";
export * from "./motion.js";
export * from "./typography.js";

export const themePreferences = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof themePreferences)[number];
export const themeAttribute = "data-theme" as const;
