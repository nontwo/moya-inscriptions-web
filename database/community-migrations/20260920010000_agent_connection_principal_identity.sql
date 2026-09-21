-- agent-connections-v1 (Issue #141 r14 §4): the acting identity, frozen.
-- Forward-only; no data change.
--
-- r14 moved the token's SUBJECT and CLIENT off the mutable connection row and
-- onto the frozen consent grant, because those columns are writable by design
-- and no trigger held them. The r14 review found the hole that move did not
-- close, and it is the more powerful one.
--
-- `agent_connections.principal_label` is the identity the request ACTS as: it
-- becomes `req.user.agentPrincipal`, and the Backend derives scopes,
-- delegations and fencing from it. It is not on the grant -- there is no
-- column for it there -- and `agent_connections_monotonic` guarded only
-- generation, version and un-revocation. So rewriting one column re-pointed
-- an existing, unexpired token at a different and possibly more privileged
-- Backend principal, with no generation bump and no new consent. That is
-- strictly more than the client-id hole r14 had just closed.
--
-- The fix is to freeze it rather than to snapshot it. A principal label is
-- assigned when a connection is opened and is part of what that connection IS;
-- there is no legitimate transition that moves one. Renaming a principal means
-- opening a different connection, which is a new consent and a new generation.
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN community.agent_connections.principal_label IS
  'The restricted Backend principal this connection ACTS AS. Frozen at open: '
  'it is not carried on the consent grant, so freezing here is the only place '
  'it can be held. Moving it would re-point an existing unexpired token at a '
  'different principal with no new consent and no generation bump.';
