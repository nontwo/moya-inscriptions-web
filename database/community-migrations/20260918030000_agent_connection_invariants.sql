-- agent-connections-v1 (Issue #141 r13): the invariants the r13 review found
-- were documented but not enforced. Forward-only; no data change.
--
-- The previous migration's comments said `generation_at_consent` is frozen. It
-- was not: the composite foreign key only restricts once a WRAPPER references
-- the tuple, and a grant exists from the moment of consent while the first
-- wrapper only exists once a token is minted. In that window the column could
-- be rewritten -- measured, 1 -> 99 -- which reintroduces the exact
-- vulnerability the design exists to prevent. Comments are not constraints.

-- An immutable consent snapshot, enforced rather than asserted. The
-- destruction columns are the only ones that may ever move.
CREATE FUNCTION community.agent_connection_grants_freeze()
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_connection_grants_freeze_trigger
  BEFORE UPDATE ON community.agent_connection_grants
  FOR EACH ROW EXECUTE FUNCTION community.agent_connection_grants_freeze();

-- A wrapper is equally immutable: the composite foreign key validates only the
-- NEW tuple, so without this a wrapper could be relocated from an old grant
-- onto the current one and carry the current generation after all.
CREATE FUNCTION community.agent_connection_wrappers_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lookup_digest IS DISTINCT FROM OLD.lookup_digest
     OR NEW.sealed_jti IS DISTINCT FROM OLD.sealed_jti
     OR NEW.grant_id IS DISTINCT FROM OLD.grant_id
     OR NEW.connection_id IS DISTINCT FROM OLD.connection_id
     OR NEW.generation IS DISTINCT FROM OLD.generation
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'agent_connection_wrappers rows are immutable except invalidation'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_connection_wrappers_freeze_trigger
  BEFORE UPDATE ON community.agent_connection_wrappers
  FOR EACH ROW EXECUTE FUNCTION community.agent_connection_wrappers_freeze();

-- Generation is monotone. The column CHECK only bounded the floor at zero, so
-- 7 -> 1 was accepted, which would let a revocation be undone by a plain
-- UPDATE. Un-revoking is refused for the same reason: a revoked connection
-- becomes usable again only through a reconnect, which raises the generation.
CREATE FUNCTION community.agent_connections_monotonic()
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_connections_monotonic_trigger
  BEFORE UPDATE ON community.agent_connections
  FOR EACH ROW EXECUTE FUNCTION community.agent_connections_monotonic();

-- The consent CHECK forbade a legitimate state: because it tied
-- `consented_at IS NULL` to `awaiting-consent` alone, a connection that was
-- opened and never consented to could not be revoked at all. Revoking an
-- abandoned consent is exactly what an operator needs to do.
ALTER TABLE community.agent_connections
  DROP CONSTRAINT agent_connections_consent_recorded;
ALTER TABLE community.agent_connections
  ADD CONSTRAINT agent_connections_consent_recorded CHECK (
    CASE status
      WHEN 'awaiting-consent' THEN consented_at IS NULL
      WHEN 'authorized' THEN consented_at IS NOT NULL
      ELSE TRUE
    END
  );

-- `current_grant_id` pointed anywhere, including at another connection's grant
-- or at nothing. Provider cleanup reads it to decide what to destroy, so a
-- wrong pointer destroys someone else's grant or silently skips the real one.
-- MATCH SIMPLE skips the check while the column is NULL, so the
-- create-connection-then-create-grant order still works.
ALTER TABLE community.agent_connection_grants
  ADD CONSTRAINT agent_connection_grants_connection_grant_unique
  UNIQUE (connection_id, grant_id);

ALTER TABLE community.agent_connections
  ADD CONSTRAINT agent_connections_current_grant_fk
  FOREIGN KEY (id, current_grant_id)
  REFERENCES community.agent_connection_grants (connection_id, grant_id);

-- A failed destruction attempt should be able to say when it was attempted.
ALTER TABLE community.agent_connection_grants
  DROP CONSTRAINT agent_connection_grants_destruction_recorded;
ALTER TABLE community.agent_connection_grants
  ADD CONSTRAINT agent_connection_grants_destruction_recorded CHECK (
    destroy_status <> 'done' OR destroyed_at IS NOT NULL
  );

-- Provider artifacts: `consumed_at` carries replay state in PLAINTEXT, outside
-- the authenticated payload. Clearing it defeats reuse detection and the
-- grant-wide revocation it triggers, without touching the ciphertext. Consume
-- is one-way.
CREATE FUNCTION community.agent_connection_provider_artifacts_consume_once()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN
    RAISE EXCEPTION 'consumed_at is one-way'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_connection_provider_artifacts_consume_once_trigger
  BEFORE UPDATE ON community.agent_connection_provider_artifacts
  FOR EACH ROW EXECUTE FUNCTION community.agent_connection_provider_artifacts_consume_once();
