import { defineConfig } from "vitest/config";

// Admin uses Next's preserved JSX in production. Component regressions need
// the automatic React transform when imported into this test workspace.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
});
