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
                "Contracts cannot depend on applications, services, databases, routers, or infrastructure.",
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
          paths: [
            "@moya/contracts/json-schema",
            "@moya/contracts/schemas",
            "@moya/public-api",
            "hono",
            "node-pg-migrate",
            "pg",
          ],
          patterns: [
            {
              group: [
                "@moya/public-api/*",
                "**/apps/**",
                "**/data/**",
                "**/database/**",
                "**/services/**",
              ],
              message:
                "Repository ports cannot depend on HTTP, applications, data files, or infrastructure.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/web/**/*.{ts,tsx,mts,cts}",
      "apps/admin/**/*.{ts,tsx,mts,cts}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "@moya/contracts/json-schema",
            "@moya/contracts/schemas",
            "@moya/data-access",
            "@moya/public-api",
            "node-pg-migrate",
            "pg",
          ],
          patterns: [
            {
              group: [
                "@moya/data-access/*",
                "@moya/public-api/*",
                "**/data/**",
                "**/database/**",
                "**/infra/**",
                "**/services/**",
                "**/*.csv",
                "**/*.json",
                "**/*.pdf",
                "**/*.tsv",
                "**/*.xls",
                "**/*.xlsx",
              ],
              message:
                "Frontend code cannot access Repository, runtime contracts, data files, or server infrastructure.",
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
                "**/data/**",
                "**/database/**",
                "**/infra/**",
                "**/services/**",
              ],
              message:
                "The shared UI package cannot depend on domain or server layers.",
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
              group: ["@moya/data-access/*", "**/data/**", "**/database/**"],
              message:
                "The public API contract package cannot depend on persistence or data files.",
            },
          ],
        },
      ],
    },
  },
);
