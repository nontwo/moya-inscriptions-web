import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const e2eRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(e2eRoot, "../..");
const webBaseUrl = "http://127.0.0.1:3100";
const publicApiBaseUrl = "http://127.0.0.1:3101";

export default defineConfig({
  ...(process.env.CI ? { workers: 1 } : {}),
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: resolve(tmpdir(), "moya-t02p01-playwright-results"),
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], browserName: "chromium" },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 15"], browserName: "webkit" },
    },
    {
      name: "tablet-webkit",
      use: { ...devices["iPad Pro 11"], browserName: "webkit" },
    },
  ],
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 1 : 0,
  testDir: e2eRoot,
  testIgnore: ["support/**"],
  testMatch: "*.spec.ts",
  timeout: 30_000,
  use: {
    baseURL: webBaseUrl,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node tests/e2e/support/public-api.ts",
      cwd: repositoryRoot,
      timeout: 30_000,
      url: `${publicApiBaseUrl}/health`,
    },
    {
      command: "node tests/e2e/support/start-formal-web.ts",
      cwd: repositoryRoot,
      env: {
        ...process.env,
        AI_AGENT: "",
        CODEX_CI: "",
        CODEX_SANDBOX: "",
        CODEX_THREAD_ID: "",
        MOYA_PUBLIC_API_BASE_URL: `${publicApiBaseUrl}/`,
      },
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      timeout: 120_000,
      url: webBaseUrl,
    },
  ],
});
