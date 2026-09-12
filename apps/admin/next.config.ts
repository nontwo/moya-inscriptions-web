import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
// Development only: the same LAN/loopback hosts Web allows for device QA.
// Without 127.0.0.1 here, Next refuses its own dev chunks for that host and
// the Admin renders blank.
const allowedDevOrigins =
  process.env.NODE_ENV === "development"
    ? [
        "127.0.0.1",
        "localhost",
        ...(process.env.MOYA_ALLOWED_DEV_ORIGINS ?? "")
          .split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      ]
    : [];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  // One ingress hostname keeps host-only preview cookies; assets need a distinct prefix.
  assetPrefix: process.env.NODE_ENV === "production" ? "/admin-assets" : "",
  output: "standalone",
  serverExternalPackages: ["opencc"],
  // OpenCC resolves its optional platform package dynamically at runtime.
  outputFileTracingIncludes: {
    "/*": [
      "../../node_modules/.pnpm/opencc@*/node_modules/@opencc/opencc-*/index.js",
      "../../node_modules/.pnpm/opencc@*/node_modules/@opencc/opencc-*/package.json",
      "../../node_modules/.pnpm/opencc@*/node_modules/@opencc/opencc-*/prebuilds/**/*.node",
    ],
  },
};
export default withPayload(nextConfig);
