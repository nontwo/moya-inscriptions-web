-- Run only after local community migrations. The App role is DML-only on the
-- community namespace: no DDL, no Catalog or CMS relation, no default privilege.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yoyi_dev_app') THEN
    -- Existing local volumes predate this role; init-roles.sql covers new ones.
    CREATE ROLE yoyi_dev_app LOGIN PASSWORD 'synthetic-local-app-only'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;
GRANT CONNECT ON DATABASE yoyi_dev TO yoyi_dev_app;
GRANT USAGE ON SCHEMA community TO yoyi_dev_app;
GRANT SELECT ON TABLE
  community.public_users,
  community.development_accounts
TO yoyi_dev_app;
GRANT SELECT, INSERT, UPDATE ON TABLE community.sessions TO yoyi_dev_app;
-- Startup readiness verifies the community ledger read-only.
GRANT SELECT ON TABLE community.schema_migrations TO yoyi_dev_app;
