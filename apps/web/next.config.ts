import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
