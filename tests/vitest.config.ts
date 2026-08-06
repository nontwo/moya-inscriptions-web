import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["unit/**/*.test.ts"],
    setupFiles: ["./fixtures/vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "../packages/data-access/src/**/*.ts",
        "../packages/search/src/**/*.ts",
        "../packages/logger/src/**/*.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@moya/contracts": "../packages/contracts/src/index.ts",
      "@moya/data-access": "../packages/data-access/src/index.ts",
      "@moya/search": "../packages/search/src/index.ts",
      "@moya/logger": "../packages/logger/src/index.ts",
    },
  },
});
