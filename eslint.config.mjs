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
            "@moya/api",
            "@moya/backend-runtime",
            "@moya/data-access",
            "@moya/public-api",
            "hono",
            "node-pg-migrate",
            "pg",
          ],
          patterns: [
            {
              group: [
                "@moya/backend-runtime/*",
                "@moya/data-access/*",
                "@moya/api/*",
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
        { name: "Request", message: "Reader ports do not know HTTP." },
        { name: "Response", message: "Reader ports do not know HTTP." },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "@moya/api",
            "@moya/backend-runtime",
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
                "@moya/backend-runtime/*",
                "@moya/public-api/*",
                "@moya/api/*",
                "**/apps/**",
                "**/data/**",
                "**/database/**",
                "**/services/**",
              ],
              message:
                "Reader ports cannot depend on HTTP, applications, data files, or infrastructure.",
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
            "@moya/api",
            "@moya/backend-runtime",
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
                "@moya/backend-runtime/*",
                "@moya/data-access/*",
                "@moya/api/*",
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
                "Frontend code cannot access Reader ports, runtime contracts, data files, or server infrastructure.",
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
            "@moya/api",
            "@moya/backend-runtime",
            "@moya/contracts",
            "@moya/data-access",
            "@moya/public-api",
            "node-pg-migrate",
            "pg",
          ],
          patterns: [
            {
              group: [
                "@moya/backend-runtime/*",
                "@moya/contracts/*",
                "@moya/api/*",
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
          paths: [
            "@moya/api",
            "@moya/backend-runtime",
            "@moya/data-access",
            "node-pg-migrate",
            "pg",
          ],
          patterns: [
            {
              group: [
                "@moya/api/*",
                "@moya/backend-runtime/*",
                "@moya/data-access/*",
                "**/data/**",
                "**/database/**",
              ],
              message:
                "The public API contract package cannot depend on persistence or data files.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["services/backend-runtime/src/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "@moya/contracts/json-schema",
            "@moya/data-access",
            "hono",
            "node-pg-migrate",
            "pg",
          ],
          patterns: [
            {
              group: [
                "@moya/api/*",
                "@moya/data-access/*",
                "**/apps/**",
                "**/data/**",
                "**/database/**",
                "**/infra/**",
              ],
              message:
                "The HTTP runtime may use only application package roots and runtime contracts, not deep application modules, frontend, data, persistence, or infrastructure implementations.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["services/api/src/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "Request",
          message: "Catalog application has no HTTP runtime.",
        },
        {
          name: "Response",
          message: "Catalog application has no HTTP runtime.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "@moya/backend-runtime",
            "@moya/data-access",
            "@moya/public-api",
            "hono",
            "node-pg-migrate",
            "pg",
          ],
          patterns: [
            {
              group: [
                "@moya/backend-runtime/*",
                "@moya/data-access/*",
                "@moya/public-api/*",
                "**/apps/**",
                "**/data/**",
                "**/database/**",
                "**/infra/**",
              ],
              message:
                "Catalog application cannot depend on frontend, transport services, data files, persistence, or infrastructure.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["services/api/src/modules/**/application/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "@moya/backend-runtime",
            "@moya/data-access",
            "@moya/public-api",
            "hono",
            "node-pg-migrate",
            "pg",
          ],
          patterns: [
            {
              group: [
                "@moya/backend-runtime/*",
                "@moya/data-access/*",
                "@moya/public-api/*",
                "**/apps/**",
                "**/data/**",
                "**/database/**",
                "**/infra/**",
                "**/transport/**",
              ],
              message:
                "Application code cannot depend on transport, frontend, data files, persistence, or infrastructure.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["services/api/src/modules/**/application/**/*.{ts,tsx,mts,cts}"],
    ignores: [
      "services/api/src/modules/**/application/mappers/**/*.{ts,tsx,mts,cts}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "@moya/backend-runtime",
            "@moya/data-access",
            "@moya/public-api",
            "@moya/contracts/json-schema",
            "@moya/contracts/schemas",
            "hono",
            "node-pg-migrate",
            "pg",
          ],
          patterns: [
            {
              group: [
                "@moya/backend-runtime/*",
                "@moya/data-access/*",
                "@moya/public-api/*",
                "**/apps/**",
                "**/data/**",
                "**/database/**",
                "**/infra/**",
                "**/transport/**",
              ],
              message:
                "Application code cannot depend on runtime transport contracts, transport modules, data files, persistence, or infrastructure.",
            },
          ],
        },
      ],
    },
  },
);
