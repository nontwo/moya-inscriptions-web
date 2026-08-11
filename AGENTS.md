# Project Instructions

## Project goal

Build a mobile-first digital archive for Chinese cliff inscriptions and stone
inscriptions.

## Required commands

- Install: pnpm install
- Development: pnpm dev
- Build: pnpm build
- Lint: pnpm lint
- Type check: pnpm typecheck
- Test: pnpm test

## Architecture rules

1. UI components must not query PostgreSQL directly.
2. Shared data types may only be defined in packages/contracts.
3. Shared colors, spacing and typography may only be defined in
   packages/design-tokens.
4. Public Web, Admin, SSR and Server Components must obtain business data
   through the HTTP API. They may type-import Public DTOs from
   packages/contracts, but must not import query ports, API/service runtime
   implementations or backend application modules directly.
5. Object keys and storage details are backend-only. Frontend code receives
   resolved public or signed runtime URLs through future Public Media DTOs and
   must not compose CDN URLs from object keys.
6. Do not hard-code production domains, API keys or CDN addresses.
7. All public interfaces must be mobile-first.
8. Do not modify files outside the paths assigned in the task prompt.
9. Do not upgrade dependencies unless explicitly requested.
10. Database changes must use migrations.
11. Never commit secrets, tokens or real environment credentials.
12. Do not redefine contracts locally inside feature modules.
13. Runtime workspaces must not read raw source datasets unless a backend
    importer has both explicit architecture allowlist approval and the
    controlled-importer manifest capability. Frontend workspaces can never be
    granted this capability.

## Completion requirements

Every task must:

- run lint
- run typecheck
- run relevant tests
- run build where applicable
- list modified files
- report any deviation from the assigned scope
