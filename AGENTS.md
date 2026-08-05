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
4. Public pages must use the repository abstraction in packages/data-access.
5. Images must be represented by object keys and derived URLs.
6. Do not hard-code production domains, API keys or CDN addresses.
7. All public interfaces must be mobile-first.
8. Do not modify files outside the paths assigned in the task prompt.
9. Do not upgrade dependencies unless explicitly requested.
10. Database changes must use migrations.
11. Never commit secrets, tokens or real environment credentials.
12. Do not redefine contracts locally inside feature modules.

## Completion requirements

Every task must:

- run lint
- run typecheck
- run relevant tests
- run build where applicable
- list modified files
- report any deviation from the assigned scope
