# Local development

P2-R2A prepares the existing Public Web, sole Backend composition and Payload
Admin for ordinary PostgreSQL. This setup uses synthetic local content. It does
not purchase cloud resources, deploy, migrate real data, switch the production
content source, retire XLSX or implement public users/community/filtering.

## First run

Use Node 24, pnpm 11.9.0 and Docker Compose. From the repository root:

```sh
pnpm install
cp infra/env/local.env.example .env.local
pnpm dev:db:up
pnpm dev:migrate
pnpm dev:all
```

`compose.dev.yml` creates PostgreSQL **18.4**, database `yoyi_dev`, port
`127.0.0.1:54330` and the separate `yoyi-development_yoyi_dev_data` volume. It
does not reuse `compose.postgres.yml`, `TEST_DATABASE_URL`, any Stage A database
or existing content. The checked-in local credentials are explicitly synthetic
and only for this loopback container. Real values and local `.env.local` stay
outside Git; use independently provisioned credentials for any shared
environment.

`dev:migrate` first builds the existing shared packages. Its `--development`
preflight requires Payload, the same loopback `yoyi_dev` database and different
CMS/public roles. It then runs only Payload migrations and grants the local
public role `SELECT` on the six published views and published search table.
Legacy migrations never run here. It then applies the separate Community V1
family (`scripts/migrate-community.mjs --development`, using the local
`APP_MIGRATION_DATABASE_URL` owner role), grants the DML-only `yoyi_dev_app`
role on the `community` schema and seeds the three Development test accounts
(`infra/development/community-development-accounts.sql`). The grant commands
address only this Compose container; do not edit local URLs to target another
server. Database and Admin startup run no DDL. Run migrations explicitly when
the code changes them.

`dev:all` runs the existing Turbo watch mode and the standard `tsx` development
runner; Turbo rebuilds shared dependencies and restarts affected tasks. It
starts:

| Process       | Address                       | Database use                                                                      |
| ------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| Public Web    | `http://127.0.0.1:3000`       | Public HTTP API only                                                              |
| Backend       | `http://127.0.0.1:3001`       | `yoyi_dev_public` published reads; `yoyi_dev_app` community identity and sessions |
| Payload Admin | `http://127.0.0.1:3002/admin` | `yoyi_dev_payload`, CMS runtime                                                   |

Web and Admin retain their existing development hostname behavior for device QA.
The Backend and PostgreSQL listen on loopback. The root `.env.local` is loaded
by Node's native env-file support before Turbo; task-specific environment
forwarding keeps database/COS settings out of the Web task. The existing
`pnpm dev:web` and `pnpm dev:admin` standalone commands still support their
existing app-local Next.js environment files. Use `dev:all` for the shared root
template.

Payload owner/automation accounts are administrative identities, not public
users. The local template uses `CMS_ENVIRONMENT=synthetic` for the existing HTTP
local authentication behavior. `CMS_STORAGE_MODE=local` requires no COS/Tencent
credentials. Admin resolves `CMS_MEDIA_DIR=../../.local/media` from its
workspace directory to the gitignored root `.local/media`. The Backend maps
published opaque keys to `PUBLIC_MEDIA_BASE_URL=http://127.0.0.1:3002` and
Payload’s existing `/api/media/file/<filename>` route. Only published local
uploads are anonymously readable when development, synthetic and local-storage
guards all pass. Media metadata, drafts and Admin preview retain authentication;
filesystem paths never enter Public DTOs. Use the same `127.0.0.1` hostname for
all three processes. Create it locally if needed with `mkdir -p .local/media`.
Do not commit media, secrets or synthetic database dumps.

## Daily commands

- `pnpm dev:db:up`: start only the dedicated development database and wait for
  health.
- `pnpm dev:db:down`: stop it while retaining the named volume and data.
- `pnpm dev:migrate`: explicit Payload migrations, local published-read grants,
  community migrations, the local App-role grants and the Development test
  accounts.
- `pnpm db:migrate:community`: the community migration family alone, with
  `APP_MIGRATION_DATABASE_URL` (add `--development` for the local preflight).
- `pnpm dev:backend`: run the Backend and rebuild changed shared dependencies.
- `pnpm dev:all`: run Web, Backend and Admin together; Ctrl-C stops these
  processes.

No custom watchdog, session controller or new process platform is added. `tsx`
4.22.4 is the sole direct dev-runner addition, reusing the already locked
version. The ordinary `pnpm verify` and production `pnpm build` commands remain
in place.

## Community V1 Development sign-in

Community V1 (Owner amendment 2026-09-11, Mission 2A) adds Backend-owned public
users and sessions. The local `yoyi_dev` database holds three real Development
test accounts — handles `dev-user-01`, `dev-user-02`, `dev-user-03` with Chinese
display names — seeded by `dev:migrate`; they are not QA fixtures and exist in
no other environment. Open `http://127.0.0.1:3000/dev/community` (or the same
path on the LAN address used for device QA) to sign in as one of them, see the
identity the Backend returns from `GET /api/community/me`, and sign out. The
Backend issues, validates, expires (seven days, absolute) and revokes the
session; Web only holds the opaque credential in the HttpOnly `yoyi-session`
cookie and relays it as a bearer credential. The sign-in and sign-out routes and
the page answer 404 unless `NODE_ENV=development`, and the Backend composes
`/v1/development/*` only under `NODE_ENV=development`; Production has no sign-in
path.

## Community V1 comments and moderation

Mission 2B adds Catalog comments with one level of replies, the Owner-controlled
publication setting and the Owner's moderation surface. Signed in through the
Development entry above, a public user can post a comment on any published
Catalog record and reply once under a root comment. Reads are anonymous:

- `GET /api/catalog/{catalogId}/comments?page&pageSize` — visible comments,
  newest first, each with its first three visible replies (oldest first).
- `GET /api/catalog/{catalogId}/comments/{commentId}/replies?page&pageSize` —
  bounded load-more for one thread.
- `POST` on either path requires the session cookie. `201` means the submission
  is visible; `202` means it entered moderation and awaits Owner approval.

The Owner moderates in Payload Admin at
`http://127.0.0.1:3002/admin/community-moderation`: switch the publication
setting between 先审后发 (`PRE_MODERATION`, the default)
and 直接发布 (`DIRECT_PUBLICATION`), approve, hide or unhide a comment or reply,
and suspend or reinstate an author. Switching the setting affects new
submissions only; nothing is bulk-published or bulk-hidden, and nothing is ever
deleted. Admin never touches community tables: it calls the Backend's
loopback-only `/internal/community/*` boundary with the shared
`COMMUNITY_OPERATOR_TOKEN` from `.env.local`, and the Backend stays the sole
writer. Leave that variable unset and the boundary rejects every request, so the
moderation view reports that it is not configured rather than opening.

## Optional local read-only browser role

After `dev:migrate`, an operator can explicitly create a local inspection role:

```sh
docker compose -f compose.dev.yml exec -T postgres psql -v ON_ERROR_STOP=1 -U yoyi_dev_owner -d yoyi_dev -f /opt/yoyi/readonly-browser.sql
```

Use `yoyi_dev_browser` with the synthetic password shown in
`infra/development/readonly-browser.sql` and `127.0.0.1:54330/yoyi_dev` in an
existing database client. This optional role can read drafts and CMS metadata,
has no write grants, and defaults to read-only transactions. It is never used by
the Backend. No database browser UI or pgAdmin container enters the product.

## Templates, tests and future work

| Purpose           | Tracked source                                                   | Private runtime file                           |
| ----------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| Local development | `infra/env/local.env.example`                                    | root `.env.local`                              |
| Synthetic tests   | `infra/env/test.env.example`                                     | `.env.test.local` or isolated test process env |
| Staging           | `infra/env/staging.env.example` plus the three service templates | three isolated staging EnvironmentFiles        |
| Production        | `infra/production/env/*.env.example`                             | three controlled service EnvironmentFiles      |

The test template deliberately separates `TEST_DATABASE_URL` (legacy test
schema) from `CMS_TEST_DATABASE_URL` (Payload synthetic schema). Existing
`pnpm test:postgres` and `pnpm test:cms` must use new disposable synthetic
databases; do not point either at `yoyi_dev`, Stage A or real content. The CMS
verification runner generates an isolated synthetic secret and local media
workspace. Templates never load automatically into CI.

`DATABASE_POOL_MAX` defaults to 5, `DATABASE_IDLE_TIMEOUT_MS` defaults to 10000,
and Payload keeps `max=5`. Local loopback PostgreSQL does not need TLS; remote
TLS must validate CA, optionally through `DATABASE_SSL_CA_FILE` or
`CMS_DATABASE_SSL_CA_FILE`. See the single
[production guide](../infra/production/README.md) for roles, CA and deployment
boundaries; staging shares that topology with independent resources.

Community V1 development runs on this local PostgreSQL: `APP_DATABASE_URL`
(`yoyi_dev_app`, DML-only on the `community` schema) is read only by the Backend
composition root and `APP_MIGRATION_DATABASE_URL` only by the community
migration command. Mission 2A introduces the public-user and session tables;
comment tables arrive with Mission 2B. Profiles, posts, likes, favorites, UGC
media and production filtering are not introduced. The PostgreSQL integration
suite exercises the community family on `TEST_DATABASE_URL`, never on
`yoyi_dev`.
