import type { NextConfig } from "next";

const allowedDevOrigins =
  process.env.NODE_ENV === "development"
    ? (process.env.MOYA_ALLOWED_DEV_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
    : [];

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  outputFileTracingIncludes: {
    "/": [
      "../../docs/prototypes/mobile-preview/**/*",
      "../../docs/design-system/assets/**/*",
      "../../packages/design-tokens/src/theme.css",
      "../../packages/ui/src/styles.css",
      "../../packages/ui/src/assets/**/*",
    ],
    "/docs/prototypes/mobile-preview/*": [
      "../../docs/prototypes/mobile-preview/**/*",
    ],
    "/docs/design-system/assets/**": ["../../docs/design-system/assets/**/*"],
    "/packages/design-tokens/src/theme.css": [
      "../../packages/design-tokens/src/theme.css",
    ],
    "/packages/ui/src/styles.css": ["../../packages/ui/src/styles.css"],
    "/packages/ui/src/assets/**": ["../../packages/ui/src/assets/**/*"],
  },
};

export default nextConfig;
