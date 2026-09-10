import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
