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
Legacy migrations never run here. The grant command addresses only this Compose
container; do not edit local URLs to target another server. Database and Admin
startup run no DDL. Run migrations explicitly when the code changes them.

`dev:all` runs the existing Turbo watch mode and the standard `tsx` development
runner; Turbo rebuilds shared dependencies and restarts affected tasks. It
starts:

| Process       | Address                       | Database use                       |
| ------------- | ----------------------------- | ---------------------------------- |
| Public Web    | `http://127.0.0.1:3000`       | Public HTTP API only               |
| Backend       | `http://127.0.0.1:3001`       | `yoyi_dev_public`, published reads |
| Payload Admin | `http://127.0.0.1:3002/admin` | `yoyi_dev_payload`, CMS runtime    |

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
- `pnpm dev:migrate`: explicit Payload migrations and local published-read
  grants.
- `pnpm dev:backend`: run the Backend and rebuild changed shared dependencies.
- `pnpm dev:all`: run Web, Backend and Admin together; Ctrl-C stops these
  processes.

No custom watchdog, session controller or new process platform is added. `tsx`
4.22.4 is the sole direct dev-runner addition, reusing the already locked
version. The ordinary `pnpm verify` and production `pnpm build` commands remain
in place.

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

After this readiness work, public identity/community development can begin on
local PostgreSQL under a separate task. `APP_DATABASE_URL`, its independent
runtime role and a separate UGC storage boundary are only future Phase 3 design
notes. No public-user/session/profile/post/comment/like/favorite/UGC table or
production filtering is introduced here.
