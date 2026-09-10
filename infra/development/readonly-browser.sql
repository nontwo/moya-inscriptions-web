-- Optional LOCAL ONLY role. It can inspect drafts; never use it for Public API.
-- Run explicitly once after dev:migrate; it is not installed by container init.
CREATE ROLE yoyi_dev_browser LOGIN PASSWORD 'synthetic-local-browser-only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT CONNECT ON DATABASE yoyi_dev TO yoyi_dev_browser;
GRANT USAGE ON SCHEMA public TO yoyi_dev_browser;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO yoyi_dev_browser;
ALTER DEFAULT PRIVILEGES FOR ROLE yoyi_dev_payload IN SCHEMA public
  GRANT SELECT ON TABLES TO yoyi_dev_browser;
ALTER ROLE yoyi_dev_browser SET default_transaction_read_only = on;
