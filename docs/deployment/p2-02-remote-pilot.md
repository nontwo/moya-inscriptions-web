# P2-02 remote HTTPS Pilot

This is a bounded non-production deployment of the existing Web, production
backend composition, PostgreSQL and the frozen twenty COS objects. The Owner's
2026-09-06 remote Pilot instruction supplies this scope. It supersedes the
previous local-only delivery endpoint, not the safeguards around actual cloud
targets, costs, credentials, exact-input approval or publication.
`publicationApproval=false` remains required. `NODE_ENV=production` selects
truthful Formal rendering; it does not authorize a public Production release.

## Scope and behavior

The following matrix transcribes the accepted Pilot requirements. It does not
introduce new visual behavior or authorize another Contract. Research, source
identity creation, media identity allocation, frontend business changes,
CMS/Search/accounts, CDN, queues and unrelated PRs are outside this task.

| Scenario                                    | Development                                                             | Production mode in this restricted Pilot                                               | Must preserve                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Three approved real records                 | Existing local PG remains available for development                     | Actual remote PG → existing backend HTTP API → existing same-origin Web bridge         | SourceIds and approved facts; CatalogIds allocated at approved apply target               |
| Twenty real photographs                     | Existing originals stay outside Git                                     | Private COS → backend resolver → `PublicMedia.src` → current Detail/Viewer             | Frozen MediaIds, keys, 8+8+4, order, representative positions; Shupu order confidence LOW |
| QA and prototype content                    | Existing explicitly separate QA remains available in normal development | No QA records/media, prototype data, or development routes                             | No real identity mixed with synthetic content                                             |
| Missing content, media or failed dependency | Existing truthful missing/error behavior                                | Omit absent optional sections; truthful missing/error state                            | No fallback photographs, invented URLs, fixed JSON or cached success masking failure      |
| Repeated operation / restart                | Test with disposable fixtures only                                      | Same approved operation safely resumes or reports already applied; restart reads PG    | No duplicate identities/relations, conflicting-object overwrite or cleanup                |
| Signed URLs / refresh                       | Test expiry using backend tests                                         | Refresh API obtains currently valid HTTPS links; no retained expired API/page response | Signing and storage configuration stay in backend; DB stores logical keys                 |
| Restricted access                           | Existing local dev entrypoints                                          | HTTPS entry authenticates every Web/API bridge request                                 | Backend and Web listener ports remain loopback; DB has no unrestricted public ingress     |
| Mac offline                                 | Development may stop                                                    | All Web/backend/PG/COS dependencies run remotely                                       | Owner independently checks mobile cellular access after closing Mac                       |

## Templates and target prerequisites

`infra/pilot/` contains two systemd units, an Nginx site template, an empty
backend configuration example and a guarded pg_dump/pg_restore wrapper. They do
not install software, start services, provision resources or grant cloud writes.
Reuse an existing approved Nginx installation and certificate where available.
If the actual CVM has different tooling, record the precise necessary adaptation
and any package/certificate costs before installation. Do not reuse archived
CloudBase candidates as current deployment authority.

Before external changes, retain one server-side target/operation record outside
Git: actual CVM instance and region; private PG instance/version/address and
catalog database; COS bucket/region and twenty-key allowlist; domain/certificate
identity and renewal path; access restriction; existing-resource usage and
incremental budget; specific deployment/migration/import/media/backup/restore
permission. Verify actual resource identities, existing workloads, DB catalog,
permissions and objects. Example names and an environment-variable label are not
identity evidence. Never open an arbitrary DB merely to discover its role.

The archive input and frozen local photo paths belong only to controlled
operator storage. Do not put original content, photographs, private paths,
instance information, secrets or server configuration into this repository.
Original-CSV byte hash can remain `unknown`; a transcribed working manifest has
its own digest and provenance. No IDs are regenerated.

## Reproducible release and process configuration

Use the approved existing CVM and retain one release directory per exact code
SHA under `/srv/moya-pilot/releases/`. Do not edit server business code. Build a
clean checkout of the reviewed exact SHA with the repository's pinned Node 24
and pnpm 11.9.0 toolchain, after verifying the actual server tool versions. Use
`pnpm install --frozen-lockfile`, current `pnpm verify`, and `pnpm build`;
record command outputs, Git SHA/tree, lockfile digest and built artifact digest.
Do not copy Mac node_modules, `.env`, credentials or local databases into the
release. Build with no cloud credentials; production startup configuration is
separate.

The `/srv/moya-pilot/current` symlink selects one retained release. The
templates expect server Node on the systemd PATH; confirm its absolute
resolution and version. Configure two unprivileged OS users,
`moya-pilot-backend` and `moya-pilot-web`, with read access to the release. The
Web user only needs write access to that release's pre-created
`apps/web/.next/cache`; all other business code remains read-only. Preserve
these directories and users after acceptance unless cleanup is separately
authorized.

`moya-pilot-backend.service` starts the existing
`services/backend-production/dist/main.js`, pins production/loopback/3001 in the
command, and receives only its own `/etc/moya-pilot/backend.env`. Keep this file
root-owned mode 0600. The API uses a read-only PG role and the backend
resolver's least-privilege object-read/signing configuration. Upload and
migration credentials are separate operator configuration, unavailable to Web or
API. `infra/pilot/backend.env.example` lists the implemented variables. Scope
and manifest files are private server-side JSON, readable by the backend user;
their parent directory is inaccessible to Web. `MOYA_PILOT_SCOPE_FILE` binds the
expected actual PostgreSQL identity, operation, three existing source
identities, manifest digest, COS bucket/region and HTTPS media origin.
`MOYA_PILOT_MEDIA_FILE` names the exact twenty-row working manifest. It is
configuration, not an alternate public data source: Catalog content and media
relations still come from PostgreSQL. The resolver can sign only these keys.
`COS_SECRET_ID` and `COS_SECRET_KEY` belong to a restricted read-only COS
identity. Temporary credentials additionally require `COS_SECURITY_TOKEN` and
`COS_CREDENTIAL_EXPIRES_AT` (Unix seconds); expiry does not silently fall back
to permanent signing. Credential renewal is an explicit server operation.

Keep operator and API configuration separate. The operator scope names the
approved import role. A separately recorded API scope uses the actual read-only
DB role and otherwise identical identity/manifest/COS data; this does not amend
the stored import approval or authorize writes. Remote PostgreSQL connections
must use `sslmode=verify-full` with the approved CA where necessary. The scope's
actual identity check runs on each checked-out connection, including replay.

### Retained backend operation

The tracked entrypoint is `node services/backend-production/dist/pilot-cli.js`.
Run it from the reviewed release with operator-only environment and a private
evidence directory. Its commands are:

```sh
node services/backend-production/dist/pilot-cli.js prepare "$PILOT_EVIDENCE_DIR" "$PILOT_CSV_BUNDLE"
node services/backend-production/dist/pilot-cli.js apply "$PILOT_EVIDENCE_DIR" "$PILOT_APPROVAL_FILE" "$PILOT_PREPARE_FILE" "$PILOT_CSV_BUNDLE"
node services/backend-production/dist/pilot-cli.js media "$PILOT_EVIDENCE_DIR" "$PILOT_APPROVAL_FILE" "$PILOT_SELECTED_PHOTOS"
```

`prepare` uses the existing v2 parser/dry-run in a read-only transaction. Retain
its canonical input digest, complete findings, dry-run digest, operation ID,
scope digest and manifest digest. `apply` requires a separate explicit approved
document binding all of these to `PERSISTENT_NON_PRODUCTION_PILOT`,
`nonProduction=true`, `publicationApproval=false` and an actual Owner
instruction reference. This tool never creates that approval. Existing v2
approval parsing, fresh dry-run comparison, transactional write and platform
CatalogId allocation remain in the importer core. P5 restrictions are unchanged.

`media` requires the same successfully applied operation and approval. It reads
only manifest-bound local files, verifies their bytes/dimensions, verifies or
uploads each fixed COS key, GETs actual remote bytes for SHA verification, then
records the existing MediaId and relation transactionally. Failed rows retain
progress for retry; already matching objects and relations are reused. Cloud
objects are never deleted or overwritten. Archive each operation evidence file
before rerunning the same command when its earlier attempt is needed for audit.
Do not report upload success as completion until PG/API/Web readback succeeds.

`moya-pilot-web.service` starts the already built Next server on loopback/3000,
with only `MOYA_PUBLIC_API_BASE_URL=http://127.0.0.1:3001`. It has no backend
env file, database credentials, object keys or COS configuration. No Admin
process is needed. The two services can restart independently. Backend readiness
failure remains a real HTTP failure; service ordering is not a substitute for
readiness.

Run migrations separately using the existing catalog-postgres command only after
the approved actual target check. Import and media execution use reviewed
backend entrypoints and the retained exact operation approval; do not place
business logic in deployment shell scripts. Ordinary backend startup only checks
migration readiness. Complete backend-only real HTTP readback before starting
Web so the frontend cannot mask missing backend mechanisms.

After approved installation of the reviewed unit files, validate using
`systemd-analyze verify` and inspect the resolved unit/environment configuration
without printing secrets. Start/enable the two named units explicitly, then
record `systemctl is-active`, `ss -ltnp` listener addresses and loopback
`/health` and `/v1/catalog` results. Use
`systemctl restart moya-pilot-backend.service` or
`systemctl restart moya-pilot-web.service` for bounded restarts; record actual
readback after each. Never stop unrelated services.

## HTTPS and access restriction

Render `infra/pilot/nginx/pilot.conf.template` into a server-controlled file by
substituting only `__PILOT_HOSTNAME__` with the approved DNS name. Do not run a
blanket environment substitution: Nginx `$host` and other variables must remain
literal. Point the template's server-side certificate links at the approved
certificate and private key, and retain renewal evidence. The template does not
request a new domain or certificate and has no port-80 listener.

Create the password file on the server with an existing supported password-hash
tool and a prompted secret; do not put a plaintext password in command history,
URL, Git or the handoff report. Restrict file ownership/permissions to the
administrator and Nginx worker group. Deliver Owner access credentials through a
separate secure channel. Nginx `auth_basic` covers all paths, including Next
assets and `/api/catalog`; authorization headers are removed before forwarding.
The browser uses the existing same-origin bridge. There is no public `/v1`
backend alias, no image proxy, and no new account feature.

Validate the rendered configuration with `nginx -t` before an explicitly scoped
reload. Check current listeners/vhosts first; do not replace unrelated sites or
a default server. Only HTTPS and separately approved restricted administration
ports may be reachable. Security groups and the host firewall must not expose
3000, 3001 or PostgreSQL; verify IPv4 and IPv6. An unauthenticated request to
both `/` and `/api/catalog` must return 401; direct listener access from outside
must fail. Verify the approved DNS/HTTPS chain from outside the server.

The template disables proxy caching and returns private/no-store responses so it
cannot retain pages/API results containing expiring media links. Backend and
existing same-origin fetch behavior must also be verified; proxy configuration
alone is insufficient. Use actual COS response bytes, Content-Type, HTTPS origin
and browser image requests to establish browser usability. Never equate ETag or
caller-supplied SHA metadata with independent content verification.

Access logs contain time/status/duration only; request URLs, Basic credentials
and signed COS queries are omitted. Review error/process logs for sensitive
values, restrict them, retain useful startup/error/restart evidence and apply
existing log rotation. Do not publish logs or output credentials in diagnostics.

## Backup and isolated restore

After actual-target authorization, use server-side PostgreSQL service and
password files outside the release. Both are mode 0600. Keep DB passwords out of
arguments and logs. Match pg_dump/pg_restore to a compatible actual PG version;
do not upgrade the managed database merely to match the local test baseline.

The wrapper `infra/pilot/backup-restore.sh` requires explicit `PGSERVICEFILE`,
`PGPASSFILE`, `MOYA_PILOT_SOURCE_SERVICE` and `MOYA_PILOT_SOURCE_IDENTITY`.
Record actual identity from the approved private server with this read-only
query:

```sql
SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, 'local-socket')
       || '|' || COALESCE(inet_server_port()::text, 'local-socket') || '|' || oid::text
FROM pg_database WHERE datname = current_database();
```

Associate it with the cloud instance ID in the external operation record. The
query fingerprint detects endpoint/database drift; it does not replace cloud
instance verification or grant authorization. Use a restricted 0700 backup
directory outside the release and an unused archive path:

```sh
bash infra/pilot/backup-restore.sh backup "$PILOT_ARCHIVE_PATH"
sha256sum -- "$PILOT_ARCHIVE_PATH"
```

Retain the custom-format archive, SHA-256, source identity, version, operation
ID and time. Interrupted archives remain for diagnosis; do not overwrite them or
report their existence as a successful backup.

For the approved recovery rehearsal, first provision a **separate empty**
database named `moya_pilot_restore_<operation_suffix>` on the approved target.
The wrapper never creates a database or clears one. Use a target-scoped restore
role, and set `MOYA_PILOT_RESTORE_SERVICE`, `MOYA_PILOT_RESTORE_IDENTITY` from
its actual identity, and `MOYA_PILOT_ARCHIVE_SHA256` from retained backup
evidence. Do not infer these values from a service label. Then run:

```sh
bash infra/pilot/backup-restore.sh restore "$PILOT_ARCHIVE_PATH"
```

The wrapper rejects identity drift, a changed archive, the source database as a
restore destination, a non-rehearsal database name, or an existing target with
user objects. It invokes pg_restore with one transaction and exit-on-error,
without `--clean` or `--create`. Keep the target private and reserved throughout
the rehearsal; no concurrent app/migrator may create objects there.

Read back the three records, CatalogIds, twenty media bindings and import
operation state from the restored DB through a separately configured instance of
the same backend on a distinct loopback port. Compare normalized fields and
logical media keys; newly signed URL bytes may differ. This temporary test
process must not replace the active acceptance service. Retain archive and
restored database until Owner acceptance; no automatic drop/cleanup.

Code rollback selects a retained compatible release and restarts its two units;
it does not reverse migrations or restore data. Data recovery requires its own
actual-target check and approved operation. A successful pg_restore exit alone
is not proof that the application was recovered.

## Required evidence before Owner handoff

Record local and remote results separately and identify the exact deployed code
SHA. Current `pnpm verify` and focused backend/PG/media tests remain required;
the historical daily full-browser requirement is not restored. Run this real
remote smoke in addition to daily smoke:

- Backend alone imports approved v2 data, verifies/registers COS objects and
  serves actual HTTP list/detail results from PG.
- Exactly three mapped records and twenty original MediaIds/keys (8+8+4),
  correct representatives/order and content-to-approved-input comparison pass.
- Replaying the approved operation, reusing uploaded objects and restarting
  services creates no duplicates or unexplained changes; partial failure is
  recoverable without deleting objects.
- Authenticated existing Web displays real fields/photos; Detail, Viewer,
  refresh, back, missing/error and signed-URL refresh checks pass.
- Unauthenticated root/API bridge are denied; raw application/DB ports cannot
  bypass the protected entry; no browser bundle/log secrets or QA routes leak.
- Backup restores into the separate target and the same backend reads matching
  data. Record duration, archive digest and retained recovery target.
- An external network can reach valid HTTPS and actual COS images independently
  of the Mac. Owner cellular/Mac-off acceptance remains explicitly pending until
  the Owner performs it.

An independent agent reviews the actual cumulative diff, operation scope and
current evidence. Follow current exact-head PR/merge governance after any
applicable Owner visual gate; do not touch PR #94/#95. A pre-merge Pilot must be
labelled with its candidate SHA, then checked for tree equivalence and rerun
through remote smoke after merge. No stable tag, public launch or Production
authority is implied.

References:
[Nginx Basic authentication](https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html),
[Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html),
[PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html),
[PostgreSQL pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html).
