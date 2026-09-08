import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
};
export default withPayload(nextConfig);
