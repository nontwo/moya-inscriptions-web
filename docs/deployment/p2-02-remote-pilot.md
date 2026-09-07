# P2-02 remote HTTPS Pilot

This is a bounded non-production deployment of the existing Web, production
backend composition, PostgreSQL and the frozen twenty COS objects. The Owner's
2026-09-06 remote Pilot instruction supplies this scope. It supersedes the
previous local-only delivery endpoint, not the safeguards around actual cloud
targets, costs, credentials, exact-input approval or publication.
`publicationApproval=false` remains required. `NODE_ENV=production` selects
truthful Formal rendering; it does not authorize a public Production release.

The Owner's 2026-09-07 continuation accepts the existing three real records and
twenty verified COS photographs. Continue only with the restricted IP HTTPS
entry and final phone acceptance. Do not run import or upload again, change
SourceIds/MediaIds/keys, add backend business, buy a domain or introduce another
access platform. The port checklist is a proposal until the Owner explicitly
authorizes it; deployment authorization does not imply port authorization.

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
| Trusted IP certificate                      | Existing development HTTP is unchanged                                  | Publicly trusted IP SAN certificate with automated renewal and verified reload         | No self-signed bypass; no domain purchase                                                 |
| Certificate validation                      | Not applicable                                                          | Only HTTP-01 token files are public on the separately approved validation port         | Validation never exposes the Web application                                              |
| Owner test entry                            | Existing local access is unchanged                                      | One Owner credential protects every permitted HTTPS page, asset and API                | No anonymous application access, frontend authentication feature or public release        |
| Expiry and test deadline                    | Not applicable                                                          | Renewal/check timers report failures; the agreed deadline stops the entrance           | SSH, private services, data and existing media remain intact                              |

## Templates and target prerequisites

`infra/pilot/` contains application and certificate systemd units, a restricted
Nginx template and ingress verifier, certificate supervision, an empty backend
configuration example and a guarded pg_dump/pg_restore wrapper. Merely checking
these files out does not install software, start services or grant cloud writes.
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

Use the actual approved IPv4 address as the certificate identity. Let's Encrypt
supports publicly trusted IP certificates using its `shortlived` profile: their
lifetime is 160 hours. IP issuance supports HTTP-01 or TLS-ALPN-01, not DNS-01.
This deployment uses Certbot 5.8.0 `certonly --webroot --ip-address` and
`--required-profile shortlived`; it does not rely on the Nginx certificate
installer. Install Certbot in a separate versioned Python environment. Resolve
and retain exact wheel versions, verify wheel bytes against official PyPI
SHA-256 metadata and install from the resulting complete hash lock. Do not
upgrade existing application dependencies or system Python merely to obtain it.

Before changing the security group, give the Owner one target-specific list: TCP
80 from all IPv4 addresses for HTTP-01 only; TCP 443 from all IPv4 addresses for
cellular access protected by the separate Owner credential; the existing
restricted SSH source remains unchanged. Public validation servers have no
published fixed source range. A changing cellular address also cannot be
represented by the Mac's fixed SSH source. These are two narrowly defined TCP
rules, not an all-ports rule. Keep IPv6, PostgreSQL, Web, backend and every
other internal port closed. Record the approved end time and earlier
cancellation condition outside Git. Until that explicit approval arrives, keep
the public Nginx service stopped and use loopback-only preflight checks.

Render `infra/pilot/nginx/pilot.conf.template` by replacing only its five named
placeholders: `__PILOT_IPV4__`, `__PILOT_TLS_DIR__`, `__PILOT_AUTH_FILE__`,
`__PILOT_ACME_ROOT__`, and `__PILOT_STATUS_ROOT__`. Nginx variables must remain
literal. Use a dedicated IPv4 server and remove the new package's unused default
site only after confirming there are no unrelated sites. The HTTP server serves
only GET/HEAD token files below `.well-known/acme-challenge/`; every other HTTP
path returns 404, with no redirect or application upstream. Explicitly make all
webroot/token parent directories traversable by Nginx. First validate issuance
against the staging CA without installing or serving its untrusted certificate,
then obtain the production IP certificate. Validate `nginx -t` before
activation.

Create one strong random Owner password outside Git, in an exclusive mode-0600
local file. Deliver it to the server only over the verified SSH connection and
produce a password hash readable by root and the Nginx worker group. Do not put
the password in argv, command history, URLs, logs or chat. The Owner reads the
local file privately and transfers it through their password manager. This is a
separate identity from COS API/operator credentials. Nginx Basic authentication
protects every permitted HTTPS page, static asset, status page and same-origin
API. Strip `Authorization` and `Proxy-Authorization` before forwarding. The
existing Web and backend listeners remain on loopback.

The deployment allowlist admits the formal root, Catalog routes, built Next
static assets and the specific package styles/assets used by that application.
It denies prototype HTML, `/docs`, `/dev`, QA/fixture routes, source documents,
Next image/data proxy paths, backend aliases and ambiguous encoded paths. Test
both GET and HEAD, normal and encoded/traversal spellings, with and without
credentials. An anonymous COS 403 is separate storage evidence and cannot prove
that the application is protected. Anonymous or wrong-credential requests to
legitimate root/API/static/status routes must receive 401; correct credentials
must reach the actual remote application.

The boundary hides upstream cache headers and sends
`Cache-Control: private, no-store` on all HTTPS responses. Confirm it on the
actual same-origin list and all detail API responses, including errors; confirm
backend/bridge fetch behavior separately. Disable caching, referrers and
indexing. Access logs contain time/status/duration only. The site error log is
disabled because Nginx can include request URLs or credentials in error
messages; controlled service and certificate status retain safe operational
failures instead.

Install `https/certificate.py` as
`/usr/local/libexec/moya-pilot-certificate.py`, with root-owned mode-0600
`/etc/moya-pilot/https.json`. The strict configuration contains only `ipv4`,
`deadlineUTC`, `cert_name`, `webroot`, `lineage`, and `status_root`. Install the
certificate renewal, independent check and entrance-stop units. Install
`systemd/moya-pilot-nginx-deadline.conf` as
`/etc/systemd/system/nginx.service.d/moya-pilot-deadline.conf`; its additional
`ExecStartPre` runs the side-effect-free `start-guard` without replacing the
distribution syntax check. Missing/invalid configuration or an elapsed deadline
rejects startup, including a boot after the deadline while the stop timer is
still catching up. The renewal timer runs every six hours with jitter and
persistence. Do not force renewal: Certbot decides when the short-lived
certificate is due. After renewal, check Nginx syntax, reload it and verify the
served certificate through a trusted TLS connection using the IP identity; its
fingerprint must match the live disk certificate. Certbot exit success alone is
insufficient evidence of reload.

The hourly check detects certificate/served-chain problems, disabled renewal,
stale renewal attempts and less than 48 hours remaining. It writes a safe
Owner-authenticated `/_pilot/status` page and a login MOTD indication; it does
not send mail or push notifications. Let's Encrypt no longer sends expiry
emails. Run a real `renew --dry-run` and verify the production certificate
remains in service. At the approved deadline, the dedicated stop timer closes
Nginx and stops certificate timers while leaving SSH and private application
services running. The corresponding cloud security-group entries still require
removal by the authorized administrator; host closure is not evidence of rule
deletion.

Run `nginx/verify-ingress.py --ipv4 <approved-IP> --auth-file <private-JSON>`
from outside the server using system CA trust. Its optional loopback HTTP
preflight mode is explicitly not certificate or external-reachability evidence.
Check trusted IP SAN/chain/expiry, authenticated and rejected requests, real
Home/Detail/Viewer photographs and their original SHA-256, then restart services
and verify recovery. Never retain full signed media URLs in evidence, and never
substitute ETag or caller-provided SHA metadata for downloaded-byte validation.

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
SHA. For the initial cumulative implementation, retain `pnpm verify` and focused
backend/PG/media results. For this HTTPS-only continuation, run lint, typecheck,
certificate supervision tests and actual ingress/media checks; carry forward
unchanged import/upload/restore evidence instead of repeating those operations
or unrelated tests. Required current PR checks still apply. The historical daily
full-browser requirement is not restored. Initial Pilot evidence includes:

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
[Let's Encrypt IP certificates](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability.html),
[Certbot IP issuance](https://letsencrypt.org/2026/03/11/shorter-certs-certbot.html),
[HTTP-01 challenge](https://letsencrypt.org/docs/challenge-types/),
[Validation firewall requirements](https://letsencrypt.org/docs/integration-guide/#firewall-configuration),
[End of expiry emails](https://letsencrypt.org/2025/01/22/ending-expiration-emails),
[Nginx Basic authentication](https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html),
[Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html),
[PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html),
[PostgreSQL pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html).
