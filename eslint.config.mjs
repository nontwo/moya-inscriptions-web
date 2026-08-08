import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "pnpm-lock.yaml",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    files: ["packages/contracts/src/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "@moya/data-access",
            "@moya/public-api",
            "hono",
            "node-pg-migrate",
            "pg",
          ],
          patterns: [
            {
              group: [
                "@moya/data-access/*",
                "@moya/public-api/*",
                "**/apps/**",
                "**/database/**",
                "**/services/**",
              ],
              message:
                "Contracts cannot depend on applications, services, database, routers, or infrastructure.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/data-access/src/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "Request", message: "Repository ports do not know HTTP." },
        { name: "Response", message: "Repository ports do not know HTTP." },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: ["@moya/public-api", "hono", "node-pg-migrate", "pg"],
          patterns: [
            {
              group: [
                "@moya/public-api/*",
                "**/apps/**",
                "**/data/catalog/**",
                "**/database/**",
                "**/services/**",
              ],
              message:
                "Repository ports cannot depend on HTTP, applications, raw data, or infrastructure.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/ui/src/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "@moya/contracts",
            "@moya/data-access",
            "@moya/public-api",
            "node-pg-migrate",
            "pg",
          ],
          patterns: [
            {
              group: [
                "@moya/contracts/*",
                "@moya/data-access/*",
                "@moya/public-api/*",
                "**/data/catalog/**",
                "**/database/**",
                "**/infra/**",
                "**/services/**",
              ],
              message:
                "@moya/ui is a domain-agnostic design-system package and cannot depend on domain or server layers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["services/public-api/src/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["@moya/data-access", "node-pg-migrate", "pg"],
          patterns: [
            {
              group: [
                "@moya/data-access/*",
                "**/data/catalog/**",
                "**/database/**",
              ],
              message:
                "The public-api contract layer cannot depend on persistence or raw data.",
            },
          ],
        },
      ],
    },
  },
);
