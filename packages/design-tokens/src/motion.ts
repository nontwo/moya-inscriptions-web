export const motion = {
  duration: {
    instant: "80ms",
    fast: "140ms",
    normal: "200ms",
    slow: "280ms",
    loadingLogo: "720ms",
  },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    emphasized: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
  },
} as const;
