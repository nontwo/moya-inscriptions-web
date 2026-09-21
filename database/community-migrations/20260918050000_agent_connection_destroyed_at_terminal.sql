-- agent-connections-v1 (Issue #141 r13): the last gap in the destruction
-- ledger. Forward-only; no data change.
--
-- The previous migration made the FACT of destruction terminal but left its
-- TIMESTAMP malleable. Measured on the live schema: with `destroy_status`
-- still 'done', `destroyed_at` was backdated ten years and accepted. The App
-- role holds UPDATE on that column, so the one field an auditor would use to
-- say WHEN provider-side cleanup happened was the one field the resource
-- server could quietly rewrite.
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
  IF OLD.destroy_status = 'done'
     AND (NEW.destroy_status <> 'done'
          OR NEW.destroyed_at IS DISTINCT FROM OLD.destroyed_at) THEN
    RAISE EXCEPTION 'grant destruction is terminal, and so is when it happened'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The wrappers comment attributed the foreign-key cycle to the wrapper's own
-- key. It does not create one: wrappers is a leaf that merely has to go first.
-- The cycle is agent_connections.current_grant_id against
-- agent_connection_grants.connection_id. The stated deletion order was right;
-- the reason was not, and a reason that is wrong is worse than none.
COMMENT ON TABLE community.agent_connection_wrappers IS
  'External token -> sealed provider jti. A leaf: nothing references it, but it '
  'references the grant tuple, so it is deleted first. The CYCLE is between '
  'agent_connections.current_grant_id and agent_connection_grants.connection_id, '
  'which is why deletion has one order -- wrappers, then NULL current_grant_id, '
  'then grants, then connections. Any other order raises 23503.';
