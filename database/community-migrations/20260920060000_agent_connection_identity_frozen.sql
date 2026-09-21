-- agent-connections-v1 (Issue #141 r15): freeze the four identity columns the
-- consent role now has to be able to write. Forward-only; no data change.
--
-- WHY THIS EXISTS, and it is a consequence of a fix rather than a new idea.
--
-- Closing the provider's forged-consent path meant giving both roles COLUMN
-- LISTS instead of table-level INSERT. The consent role's UPDATE list then had
-- to grow from eight columns to thirteen, because `compareAndSet` round-trips
-- the whole consented shape in one conditional UPDATE and a narrower grant
-- fails every lifecycle transition with 42501.
--
-- Four of those five new columns had no backstop at all: only
-- `principal_label` was frozen, by the r15 migration this one extends. An
-- independent review found the consequence, and it is worse than it looks:
--
--   `human_account_id` is the ONLY key the Owner's disconnect is scoped by
--   (`endpoints.ts` refuses a disconnect for a connection that is not the
--   caller's, and `listForHuman` filters on the same column). Rewriting it
--   does NOT break authentication -- identity is read from the frozen grant,
--   by design -- so the result is a live, authenticating connection that has
--   vanished from its owner's page and from their disconnect scope. A token
--   the human who consented can no longer revoke.
--
--   `environment` is the one mutable column still feeding an admission
--   decision, and the control plane could move it.
--
-- The fix follows the precedent already in this table rather than inventing
-- one: freeze them, exactly as `principal_label` is frozen. It costs nothing,
-- because `lifecycle.ts` only ever moves preset, status, generation,
-- consentedAt and revokedAt -- every legitimate compare-and-set writes these
-- four back unchanged, which is precisely why the existing grant-plus-trigger
-- pairing on `principal_label` already works.
CREATE OR REPLACE FUNCTION community.agent_connections_monotonic()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.generation < OLD.generation THEN
    RAISE EXCEPTION 'agent_connections.generation is monotone'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version < OLD.version THEN
    RAISE EXCEPTION 'agent_connections.version is monotone'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'revoked' AND NEW.status <> 'revoked'
     AND NEW.generation <= OLD.generation THEN
    RAISE EXCEPTION 'a revoked connection is reactivated only at a higher generation'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.principal_label IS DISTINCT FROM OLD.principal_label THEN
    RAISE EXCEPTION 'agent_connections.principal_label is the acting identity and is frozen'
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- The four the column grant had to open. A connection's WHO, WHICH CLIENT
  -- and WHERE are settled when it is opened; changing any of them is a
  -- different connection, which is what opening a new one is for.
  IF NEW.human_account_id IS DISTINCT FROM OLD.human_account_id THEN
    RAISE EXCEPTION 'agent_connections.human_account_id is the consenting human and is frozen'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.oauth_client_id IS DISTINCT FROM OLD.oauth_client_id THEN
    RAISE EXCEPTION 'agent_connections.oauth_client_id is the exact registered client and is frozen'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.client_family IS DISTINCT FROM OLD.client_family THEN
    RAISE EXCEPTION 'agent_connections.client_family is frozen'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.environment IS DISTINCT FROM OLD.environment THEN
    RAISE EXCEPTION 'agent_connections.environment decides admission and is frozen'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN community.agent_connections.human_account_id IS
  'The human who consented. Frozen: it is the only key the Owner disconnect '
  'control is scoped by, so moving it would hide a live, authenticating '
  'connection from the person entitled to revoke it. Authentication reads '
  'identity from the frozen grant, so this column moving would NOT surface as '
  'a failed request -- which is exactly why it needs a trigger and not a '
  'convention.';

COMMENT ON COLUMN community.agent_connections.environment IS
  'Which ArtVenn environment this connection serves. Frozen: it is the one '
  'mutable column that still feeds an admission decision.';
