export const surface = {
  content: "var(--yoyi-surface-content)",
  paper: "var(--yoyi-surface-paper)",
  elevated: "var(--yoyi-surface-elevated)",
} as const;

export const material = {
  glass: {
    subtle: "glass-subtle",
    regular: "glass-regular",
    prominent: "glass-prominent",
  },
} as const;

export const blur = {
  glassSubtle: "12px",
  glassRegular: "20px",
  glassProminent: "28px",
} as const;

export const opacity = {
  glassSubtle: 0.7,
  glassRegular: 0.82,
  glassProminent: 0.92,
} as const;

export const zIndex = {
  content: 0,
  sticky: 20,
  navigation: 30,
  overlay: 100,
} as const;

export type GlassMaterial =
  (typeof material.glass)[keyof typeof material.glass];
