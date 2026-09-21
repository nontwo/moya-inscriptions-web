-- Agent Connections V1 (Issue #141) — the client family stops being a brand
-- allowlist and becomes a bounded slug.
--
-- WHY. ArtVenn is a model-agnostic, client-independent tool service: any
-- authorized client implementing the documented transport and authentication
-- profile should be able to connect. `client_family IN ('claude','codex',
-- 'cursor')` made that a schema change per vendor, and it put a DESCRIPTIVE
-- label in the way of registration.
--
-- WHAT THIS DOES NOT CHANGE, and the reason this is safe: the family has never
-- been an authorization input. `admitGrant` does not read it,
-- `agent_connection_grants` has no column for it, and `findForClient` matches
-- on `oauth_client_id`. Authority is the exact registered OAuth client, the
-- human account, the resource, the frozen consent scopes and the generation —
-- every one of them untouched here. An UNREGISTERED client is still refused,
-- by the registry and by the provider, exactly as before.
--
-- THE BOUND IS REAL, not decorative. The family is templated into
-- `principal_label` as `agent-<family>-<12 hex>`, and that column's own CHECK
-- is `^agent-[a-z0-9-]{2,57}$`. A 32-character slug plus the fixed 19
-- characters is 51, so every value this CHECK admits still produces a label
-- the other CHECK accepts. Lower-case, digits and hyphens only, and never a
-- leading hyphen, so nothing here can shift the shape of that label.
--
-- The three preset names keep working untouched; they are now onboarding
-- shortcuts in the Admin rather than a vocabulary the database enforces.

ALTER TABLE community.agent_connections
  DROP CONSTRAINT agent_connections_client_family_check;

ALTER TABLE community.agent_connections
  ADD CONSTRAINT agent_connections_client_family_slug
  CHECK (client_family ~ '^[a-z0-9][a-z0-9-]{0,31}$');

COMMENT ON COLUMN community.agent_connections.client_family IS
  'Descriptive client slug for the Admin. NEVER an authorization input: authority is oauth_client_id, human_account_id, the frozen grant and the generation. Bounded so it stays safe inside principal_label.';
