import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@moya/contracts", "@moya/data-access"],
};

export default nextConfig;
