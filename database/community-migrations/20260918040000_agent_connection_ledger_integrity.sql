-- agent-connections-v1 (Issue #141 r13): what the re-review of the invariants
-- migration found still open. Forward-only; no data change.
--
-- The previous migration is itself the cautionary tale it warned about: its
-- wrappers freeze declared "rows are immutable except invalidation" while two
-- columns were still writable. Measured on the live schema: `format_version`
-- 1 -> 99 accepted, `issued_at` + 100 years accepted.

-- `format_version` selects the AEAD layout a sealed value is opened with, so
-- it is the one wrapper column an attacker would most want to move; moving
-- `issued_at` backdates an audit record. Neither is invalidation.
CREATE OR REPLACE FUNCTION community.agent_connection_wrappers_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lookup_digest IS DISTINCT FROM OLD.lookup_digest
     OR NEW.sealed_jti IS DISTINCT FROM OLD.sealed_jti
     OR NEW.format_version IS DISTINCT FROM OLD.format_version
     OR NEW.grant_id IS DISTINCT FROM OLD.grant_id
     OR NEW.connection_id IS DISTINCT FROM OLD.connection_id
     OR NEW.generation IS DISTINCT FROM OLD.generation
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'agent_connection_wrappers rows are immutable except invalidation'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The destruction ledger was forgeable and non-monotone, and the App role
-- holds UPDATE on exactly these two columns. Measured: 'done' -> 'not-requested'
-- with `destroyed_at` erased was accepted, and 'not-requested' carrying a
-- `destroyed_at` was accepted, because the old CHECK only constrained one
-- direction. Provider-side grant destruction is the acknowledged other half of
-- the r12 defence, so a role that can forge 'done' lets an operator believe
-- cleanup succeeded while the refresh token still redeems at the provider.
ALTER TABLE community.agent_connection_grants
  DROP CONSTRAINT agent_connection_grants_destruction_recorded;
ALTER TABLE community.agent_connection_grants
  ADD CONSTRAINT agent_connection_grants_destruction_recorded CHECK (
    CASE destroy_status
      WHEN 'done' THEN destroyed_at IS NOT NULL
      WHEN 'not-requested' THEN destroyed_at IS NULL
      ELSE TRUE
    END
  );

-- Destruction is terminal. A failed or pending attempt may still progress; a
-- completed one may not be walked back into looking un-attempted.
CREATE OR REPLACE FUNCTION community.agent_connection_grants_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.grant_id IS DISTINCT FROM OLD.grant_id
     OR NEW.connection_id IS DISTINCT FROM OLD.connection_id
     OR NEW.generation_at_consent IS DISTINCT FROM OLD.generation_at_consent
     OR NEW.oauth_client_id IS DISTINCT FROM OLD.oauth_client_id
     OR NEW.human_subject IS DISTINCT FROM OLD.human_subject
     OR NEW.issuer IS DISTINCT FROM OLD.issuer
     OR NEW.resource IS DISTINCT FROM OLD.resource
     OR NEW.capability_scopes IS DISTINCT FROM OLD.capability_scopes
     OR NEW.protocol_scopes IS DISTINCT FROM OLD.protocol_scopes
     OR NEW.preset_at_consent IS DISTINCT FROM OLD.preset_at_consent
     OR NEW.consented_at IS DISTINCT FROM OLD.consented_at THEN
    RAISE EXCEPTION 'agent_connection_grants is an immutable consent snapshot'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.destroy_status = 'done' AND NEW.destroy_status <> 'done' THEN
    RAISE EXCEPTION 'grant destruction is terminal'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Two things a future reader of these tables has to be told, because the
-- schema alone does not say them and the code that would say them is not
-- written yet.

COMMENT ON TABLE community.agent_connection_grants IS
  'Immutable consent snapshot, one row per provider grant. AUTHORIZATION MUST '
  'READ IDENTITY FROM THIS ROW, NEVER FROM agent_connections: a connection''s '
  'oauth_client_id and human_account_id remain writable by design, while '
  'everything here is frozen at consent. Taking the client or the subject from '
  'the connection would reintroduce exactly the mutable-identity hole the '
  'frozen generation exists to close.';

COMMENT ON TABLE community.agent_connection_wrappers IS
  'External token -> sealed provider jti. The foreign key to the grant tuple '
  'makes these tables a cycle with agent_connections.current_grant_id, so '
  'deletion has one order: wrappers, then NULL current_grant_id, then grants, '
  'then connections. Any other order raises 23503.';
