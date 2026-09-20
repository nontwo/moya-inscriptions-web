-- agent-connections-v1 (Issue #141 r15): the browser consent transaction.
-- Forward-only; no data change.
--
-- The provider hands a browser an interaction uid and nothing else. That uid
-- is a name, not an authorization: it arrives in a URL, it is guessable in
-- principle, and it carries no proof that a human saw anything. This table is
-- where an interaction stops being a URL and becomes a decision made by an
-- authenticated human in the Admin.
--
-- The split of authority is deliberate and is the reason this is a table
-- rather than a field on the interaction:
--
--   * the CONSENT/CONTROL-PLANE role (the Admin) inserts the row and records
--     the decision. It is the only thing that ever sees an Owner session.
--   * the PROVIDER role resumes the interaction and writes the resulting
--     grant. It never sees an Owner session, and it cannot invent a decision:
--     it may only set `resumed_at`, and only on a row somebody else approved.
--
-- Neither role can do the other's half, so a compromise of the provider
-- cannot manufacture consent and a compromise of the Admin cannot mint a
-- grant.
CREATE TABLE community.agent_connection_consents (
  -- The provider's interaction. One decision per interaction, forever: the
  -- primary key IS the replay defence.
  interaction_uid TEXT PRIMARY KEY CHECK (char_length(interaction_uid) BETWEEN 1 AND 256),
  -- The CSRF/transaction secret is never stored, only a digest of it. It is
  -- minted on the review page and returned in the form; a POST that cannot
  -- produce it did not come from a page this server rendered to this human.
  ticket_digest TEXT NOT NULL UNIQUE CHECK (ticket_digest ~ '^[0-9a-f]{64}$'),
  connection_id TEXT NOT NULL REFERENCES community.agent_connections (id),
  -- The human the review page authenticated. A POST from anybody else is a
  -- foreign session, not a second opinion.
  human_account_id TEXT NOT NULL CHECK (char_length(human_account_id) BETWEEN 1 AND 128),
  -- The exact client and resource that were DISPLAYED. The decision is bound
  -- to what the human was shown, so a request that changes underneath the
  -- review page cannot be approved by a stale form.
  oauth_client_id TEXT NOT NULL CHECK (char_length(oauth_client_id) BETWEEN 1 AND 1024),
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 512),
  capability_scopes TEXT[] NOT NULL DEFAULT '{}',
  protocol_scopes TEXT[] NOT NULL DEFAULT '{}',
  preset TEXT NOT NULL CHECK (preset IN ('read-only', 'management')),
  -- The generation the control plane committed when it approved. The provider
  -- freezes THIS into the grant snapshot; it never reads the connection's
  -- current generation at resume, which is the r12 defect.
  granted_generation BIGINT CHECK (granted_generation >= 0),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Short-lived. An abandoned tab is not a standing permission.
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  decision TEXT CHECK (decision IN ('approved', 'denied')),
  resumed_at TIMESTAMPTZ,
  grant_id TEXT,
  CONSTRAINT agent_connection_consents_decision_recorded
    CHECK ((decision IS NULL) = (decided_at IS NULL)),
  -- A grant may only exist behind an approval that was actually resumed.
  CONSTRAINT agent_connection_consents_resume_follows_decision
    CHECK (resumed_at IS NULL OR decision = 'approved'),
  CONSTRAINT agent_connection_consents_grant_follows_resume
    CHECK ((grant_id IS NULL) OR (resumed_at IS NOT NULL)),
  -- An approval must carry the generation it was decided at; a denial must
  -- not, because a denial commits no generation.
  CONSTRAINT agent_connection_consents_generation_follows_approval
    CHECK ((granted_generation IS NOT NULL) = (decision = 'approved')),
  -- r15 milestone gate. Management consent is deliberately unreachable at the
  -- DATABASE until the mutation and revocation boundary for it is built and
  -- tested; relaxing it is a later migration somebody has to write on purpose,
  -- not a preset a UI control or a crafted authorization request can pick.
  CONSTRAINT agent_connection_consents_read_only_milestone
    CHECK (preset = 'read-only'),
  CONSTRAINT agent_connection_consents_expiry_after_issue
    CHECK (expires_at > issued_at)
);

-- Reaping abandoned interactions without touching a decided one.
CREATE INDEX agent_connection_consents_expiry_idx
  ON community.agent_connection_consents (expires_at)
  WHERE decided_at IS NULL;

CREATE INDEX agent_connection_consents_connection_idx
  ON community.agent_connection_consents (connection_id, issued_at DESC);

-- What a decided consent may still change: nothing it was decided from.
--
-- Without this, the control-plane role's UPDATE on the decision columns would
-- also let it re-point a decision at a different client or resource after the
-- human saw the first one, and the provider's UPDATE on `resumed_at` would let
-- it flip a denial into an approval. Both are refused here rather than being
-- left to whichever application code happens to run.
CREATE OR REPLACE FUNCTION community.agent_connection_consents_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.interaction_uid IS DISTINCT FROM OLD.interaction_uid
     OR NEW.ticket_digest IS DISTINCT FROM OLD.ticket_digest
     OR NEW.connection_id IS DISTINCT FROM OLD.connection_id
     OR NEW.human_account_id IS DISTINCT FROM OLD.human_account_id
     OR NEW.oauth_client_id IS DISTINCT FROM OLD.oauth_client_id
     OR NEW.resource IS DISTINCT FROM OLD.resource
     OR NEW.capability_scopes IS DISTINCT FROM OLD.capability_scopes
     OR NEW.protocol_scopes IS DISTINCT FROM OLD.protocol_scopes
     OR NEW.preset IS DISTINCT FROM OLD.preset
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'a consent is decided from what the human was shown'
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- One decision, then never another. This is what makes the ticket
  -- single-use even if two approvals arrive concurrently: the second one
  -- finds a decided row and is refused by the database, not by a race.
  IF OLD.decided_at IS NOT NULL
     AND (NEW.decision IS DISTINCT FROM OLD.decision
          OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
          OR NEW.granted_generation IS DISTINCT FROM OLD.granted_generation) THEN
    RAISE EXCEPTION 'a consent decision is final'
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- One resume, then never another, so an approved interaction cannot be
  -- replayed into a second grant.
  IF OLD.resumed_at IS NOT NULL
     AND (NEW.resumed_at IS DISTINCT FROM OLD.resumed_at
          OR NEW.grant_id IS DISTINCT FROM OLD.grant_id) THEN
    RAISE EXCEPTION 'a resumed interaction is spent'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_connection_consents_freeze
  BEFORE UPDATE ON community.agent_connection_consents
  FOR EACH ROW EXECUTE FUNCTION community.agent_connection_consents_freeze();
