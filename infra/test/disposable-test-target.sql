-- Marks the CURRENT database as a disposable test target by setting the
-- database comment that scripts/disposable-test-target.mjs requires before
-- test preparation (verify.mjs test, db:migrate under it, test:cms) may run
-- destructive DDL/DML. compose.postgres.yml mounts this file as an initdb
-- script, so a freshly created test container is marked on first start; CI
-- runs it against its service container. It refuses the live Development
-- database by name and any name without a whole "test" or "synthetic" segment,
-- so a misdirected psql session cannot mark yoyi_dev or a real database.
DO $$
BEGIN
  IF lower(current_database()) IN ('yoyi_dev') THEN
    RAISE EXCEPTION 'yoyi_dev is the live local Development database and is never a disposable test target';
  END IF;
  IF current_database() !~* '(^|_)(test|synthetic)(_|$)' THEN
    RAISE EXCEPTION 'database % carries no whole "test" or "synthetic" name segment; refusing to mark it disposable', current_database();
  END IF;
  EXECUTE format('COMMENT ON DATABASE %I IS %L', current_database(), 'yoyi-disposable-test-target');
END $$;
