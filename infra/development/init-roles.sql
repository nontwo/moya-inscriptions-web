-- Only the new disposable/local yoyi_dev container uses these synthetic roles.
-- Production credentials and grants are provisioned independently.
REVOKE ALL ON DATABASE yoyi_dev FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE ROLE yoyi_dev_payload LOGIN PASSWORD 'synthetic-local-payload-only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE yoyi_dev_public LOGIN PASSWORD 'synthetic-local-public-only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT CONNECT ON DATABASE yoyi_dev TO yoyi_dev_payload, yoyi_dev_public;
-- Existing Payload identity-backfill migration uses a transaction-local table.
GRANT TEMPORARY ON DATABASE yoyi_dev TO yoyi_dev_payload;
GRANT USAGE, CREATE ON SCHEMA public TO yoyi_dev_payload;
GRANT USAGE ON SCHEMA public TO yoyi_dev_public;
ALTER ROLE yoyi_dev_public SET default_transaction_read_only = on;
-- Extension installation belongs to initialization/migration, never startup.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
