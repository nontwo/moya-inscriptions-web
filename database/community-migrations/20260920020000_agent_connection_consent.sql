-- agent-connections-v1 (Issue #141 r15): the browser consent transaction.
-- Forward-only; no data change.
--
-- The provider hands a browser an interaction uid. That uid travels in a URL,
-- so it is a NAME and never an authorization: it proves nothing about who is
-- holding it. This table is where it becomes a decision an authenticated human
-- made, and its column grants are the design rather than an afterthought.
--
-- THE SPLIT. Two halves of the authorization path write this row, and neither
-- can do the other's job:
--
--   the PROVIDER inserts what it will ENFORCE -- the exact client, resource,
--   scopes and deadline of a live interaction. It never authenticates a human,
--   so it cannot write who consented, and it has no privilege on the decision.
--
--   the CONTROL PLANE (the Admin) writes who -- the authenticated Owner, the
--   connection, the single-use ticket digest -- and then the decision. It
--   cannot invent an interaction, cannot alter what the provider will enforce,
--   and cannot mint the grant that follows.
--
-- So a compromised provider cannot manufacture consent, and a compromised
-- control plane cannot manufacture an authorization request or a grant. That
-- is the whole reason this is a shared row and not an HTTP call with a shared
-- secret: there is no secret to distribute, and no party asserts the other's
-- facts.
CREATE TABLE community.agent_connection_consents (
  -- The provider's interaction. One decision per interaction, forever: the
  -- primary key IS the replay defence.
  interaction_uid TEXT PRIMARY KEY CHECK (char_length(interaction_uid) BETWEEN 1 AND 256),

  -- ---- written by the PROVIDER at interaction time, then frozen ----------
  -- The exact client and resource the human will be SHOWN and the provider
  -- will enforce. Frozen, so a request cannot change underneath a review page
  -- and be approved by a form the human read before the change.
  oauth_client_id TEXT NOT NULL CHECK (char_length(oauth_client_id) BETWEEN 1 AND 1024),
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 512),
  capability_scopes TEXT[] NOT NULL DEFAULT '{}',
  protocol_scopes TEXT[] NOT NULL DEFAULT '{}',
  preset TEXT NOT NULL CHECK (preset IN ('read-only', 'management')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Short-lived. An abandoned tab is not a standing permission.
  expires_at TIMESTAMPTZ NOT NULL,

  -- ---- written by the CONTROL PLANE when it renders the review ----------
  -- The CSRF/transaction secret is never stored, only a digest of it. It is
  -- minted on the review page, after the Owner session is authenticated, and
  -- returned in the form; a POST that cannot produce it did not come from a
  -- page this server rendered to this human. NULL until then, because the
  -- provider must not know it -- a client can reach the provider.
  ticket_digest TEXT UNIQUE CHECK (ticket_digest ~ '^[0-9a-f]{64}$'),
  -- The human the review page authenticated. The provider cannot write this
  -- column at all, which is the structural reason it cannot consent for
  -- anybody.
  human_account_id TEXT CHECK (char_length(human_account_id) BETWEEN 1 AND 128),
  connection_id TEXT REFERENCES community.agent_connections (id),

  -- ---- the decision, written by the CONTROL PLANE, exactly once ----------
  decided_at TIMESTAMPTZ,
  decision TEXT CHECK (decision IN ('approved', 'denied')),
  -- The generation the control plane committed when it approved. The provider
  -- freezes THIS into the grant snapshot; it never reads the connection's
  -- current generation at resume, which is the r12 defect.
  granted_generation BIGINT CHECK (granted_generation >= 0),

  -- ---- the resume, written by the PROVIDER, exactly once ----------------
  resumed_at TIMESTAMPTZ,
  grant_id TEXT,

  CONSTRAINT agent_connection_consents_decision_recorded
    CHECK ((decision IS NULL) = (decided_at IS NULL)),
  -- A decision is only meaningful once the review page has said WHO and
  -- WHICH, and proved the browser held the ticket. All three, or no decision.
  CONSTRAINT agent_connection_consents_decision_is_attributed
    CHECK (decision IS NULL OR (ticket_digest IS NOT NULL
                                AND human_account_id IS NOT NULL
                                AND connection_id IS NOT NULL)),
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

-- What may still change, and when.
--
-- Column grants already stop each role reaching the other's columns. This
-- trigger is the layer under that: it holds even for the table owner, and it
-- is what makes "once" mean once rather than "once, unless two requests
-- arrive together".
CREATE OR REPLACE FUNCTION community.agent_connection_consents_freeze()
RETURNS TRIGGER AS $$
BEGIN
  -- What the provider will enforce, and what the human is shown, never moves.
  IF NEW.interaction_uid IS DISTINCT FROM OLD.interaction_uid
     OR NEW.oauth_client_id IS DISTINCT FROM OLD.oauth_client_id
     OR NEW.resource IS DISTINCT FROM OLD.resource
     OR NEW.capability_scopes IS DISTINCT FROM OLD.capability_scopes
     OR NEW.protocol_scopes IS DISTINCT FROM OLD.protocol_scopes
     OR NEW.preset IS DISTINCT FROM OLD.preset
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'a consent is decided from what the provider will enforce'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- The review page may re-arm an UNDECIDED interaction -- reloading it mints
  -- a fresh ticket and kills the old one, which is what single-use means for
  -- a page somebody opened twice. After a decision, nothing here moves.
  IF OLD.decided_at IS NOT NULL
     AND (NEW.ticket_digest IS DISTINCT FROM OLD.ticket_digest
          OR NEW.human_account_id IS DISTINCT FROM OLD.human_account_id
          OR NEW.connection_id IS DISTINCT FROM OLD.connection_id) THEN
    RAISE EXCEPTION 'a decided consent keeps the identity it was decided under'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- One decision, then never another. This is what makes the ticket
  -- single-use even if two approvals arrive concurrently: the second finds a
  -- decided row and is refused by the database, not by a race this code won.
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
