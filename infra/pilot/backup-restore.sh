#!/usr/bin/env bash
# Calls PostgreSQL tools only. No migrations, content rewriting, --clean or --create.
set -euo pipefail
umask 077

fail() { printf '%s\n' "$1" >&2; exit 1; }
service_name() { [[ "$1" =~ ^[A-Za-z0-9_.-]+$ ]] || fail 'Invalid PostgreSQL service name'; }
identity_sql="SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, 'local-socket') || '|' || COALESCE(inet_server_port()::text, 'local-socket') || '|' || oid::text FROM pg_database WHERE datname = current_database()"
identity() { psql --no-psqlrc --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="service=$1" --command="$identity_sql"; }

[[ $# == 2 && ( "$1" == backup || "$1" == restore ) ]] || fail 'Usage: backup-restore.sh backup|restore ARCHIVE'
[[ -n "${PGSERVICEFILE:-}" && -f "$PGSERVICEFILE" ]] || fail 'Explicit server-side PGSERVICEFILE required'
[[ -n "${PGPASSFILE:-}" && -f "$PGPASSFILE" ]] || fail 'Explicit server-side PGPASSFILE required'
[[ -n "${MOYA_PILOT_SOURCE_SERVICE:-}" && -n "${MOYA_PILOT_SOURCE_IDENTITY:-}" ]] || fail 'Verified source service and actual identity required'
service_name "$MOYA_PILOT_SOURCE_SERVICE"
source_identity=$(identity "$MOYA_PILOT_SOURCE_SERVICE")
[[ "$source_identity" == "$MOYA_PILOT_SOURCE_IDENTITY" ]] || fail 'Actual source identity differs from approved target record'
archive=$2

if [[ "$1" == backup ]]; then
    [[ ! -e "$archive" && ! -L "$archive" ]] || fail 'Refusing to replace an existing backup'
    # noclobber protects an existing path; interrupted archives remain for diagnosis.
    ( set -o noclobber
      pg_dump --no-password --format=custom --no-owner --no-privileges --dbname="service=$MOYA_PILOT_SOURCE_SERVICE" > "$archive"
    )
    pg_restore --list "$archive" >/dev/null
    printf '%s\n' 'Backup created; retain archive, digest and target evidence outside Git.'
    exit 0
fi

[[ -f "$archive" && ! -L "$archive" ]] || fail 'Restore requires an existing regular, non-symlink archive'
[[ -n "${MOYA_PILOT_RESTORE_SERVICE:-}" && -n "${MOYA_PILOT_RESTORE_IDENTITY:-}" ]] || fail 'Verified isolated restore service and actual identity required'
service_name "$MOYA_PILOT_RESTORE_SERVICE"
[[ "${MOYA_PILOT_ARCHIVE_SHA256:-}" =~ ^[a-f0-9]{64}$ ]] || fail 'Expected retained archive SHA-256 required'
archive_digest=$(sha256sum -- "$archive")
[[ "${archive_digest%% *}" == "$MOYA_PILOT_ARCHIVE_SHA256" ]] || fail 'Archive SHA-256 differs from retained backup evidence'
restore_identity=$(identity "$MOYA_PILOT_RESTORE_SERVICE")
[[ "$restore_identity" == "$MOYA_PILOT_RESTORE_IDENTITY" ]] || fail 'Actual restore identity differs from approved target record'
[[ "$restore_identity" != "$source_identity" ]] || fail 'Refusing to restore into the active Pilot database'
restore_database=${restore_identity%%|*}
[[ "$restore_database" =~ ^moya_pilot_restore_[a-z0-9_]+$ ]] || fail 'Restore target must be an explicitly isolated moya_pilot_restore_* database'
user_objects=$(psql --no-psqlrc --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="service=$MOYA_PILOT_RESTORE_SERVICE" --command="SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema')")
[[ "$user_objects" == 0 ]] || fail 'Restore target contains user objects; no clearing or overwrite is allowed'
pg_restore --no-password --single-transaction --exit-on-error --no-owner --no-privileges --dbname="service=$MOYA_PILOT_RESTORE_SERVICE" "$archive"
printf '%s\n' 'Isolated restore completed; verify identities and API readback before declaring recovery successful.'
