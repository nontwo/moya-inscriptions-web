import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@moya/contracts",
    "@moya/design-tokens",
    "@moya/logger",
    "@moya/ui",
  ],
};

export default nextConfig;
