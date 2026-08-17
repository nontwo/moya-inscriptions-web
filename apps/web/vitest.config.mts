import { defineConfig } from "vitest/config";

const contractSchemasPath = decodeURIComponent(
  new URL("../../packages/contracts/src/schemas.ts", import.meta.url).pathname,
);
const serverOnlyShimPath = decodeURIComponent(
  new URL("./test/server-only.ts", import.meta.url).pathname,
);

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  resolve: {
    alias: {
      "@moya/contracts/schemas": contractSchemasPath,
      "server-only": serverOnlyShimPath,
    },
  },
  test: {
    environment: "node",
  },
});
