-- agent-connections-v1 (Issue #141 r13): oidc-provider protocol artifacts.
--
-- Deliberately separate from the canonical connection authority. The
-- connection tables are what the Backend enforces write admission with; these
-- are the OAuth protocol's own bookkeeping, owned by the provider path. No
-- cross-database atomicity is claimed anywhere between them: a canonical
-- revoke commits first, and provider cleanup is a separate idempotent step
-- whose failure never un-revokes.
--
-- One table, because the provider's six models share one shape: an id, a
-- payload, an expiry, and for two of them a secondary lookup key. The model
-- name is constrained to the empirically observed allowlist rather than left
-- open, so enabling a new provider feature is a deliberate migration and not a
-- silent new row type.
--
-- The id a provider model is keyed by IS the credential for five of the six --
-- the interaction cookie, the authorization code, the session cookie, the
-- access token and the refresh token are each exactly their own row key. So
-- the key is stored as a keyed digest and the payload as authenticated
-- ciphertext: a dump of this table yields neither a presentable credential nor
-- the claims behind one.

CREATE TABLE community.agent_connection_provider_artifacts (
  -- HMAC of (model, id) under a server-held key. Never the id itself.
  lookup_digest TEXT PRIMARY KEY CHECK (lookup_digest ~ '^[0-9a-f]{64}$'),
  model TEXT NOT NULL CHECK (model IN (
    'Session',
    'Interaction',
    'AuthorizationCode',
    'AccessToken',
    'RefreshToken',
    'Grant'
  )),
  -- AEAD ciphertext of the provider payload. The payload carries accountId,
  -- clientId, scopes and, for Interaction, the whole authorization request.
  sealed_payload BYTEA NOT NULL CHECK (octet_length(sealed_payload) BETWEEN 29 AND 1048576),
  format_version INTEGER NOT NULL DEFAULT 1 CHECK (format_version >= 1),
  -- Revocation anchor. Plain, because it is not a credential and
  -- revokeByGrantId must find every artifact of a grant without opening any.
  grant_id TEXT CHECK (char_length(grant_id) BETWEEN 1 AND 256),
  -- Session.uid, the separate identifier findByUid looks up. Digested for the
  -- same reason as the primary key.
  uid_digest TEXT CHECK (uid_digest ~ '^[0-9a-f]{64}$'),
  -- `consume` records a timestamp the provider reads back; a consumed
  -- authorization code that is presented again is a replay, not a miss.
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT agent_connection_provider_artifacts_uid_only_for_sessions
    CHECK (uid_digest IS NULL OR model = 'Session')
);

-- findByUid, Session only.
CREATE UNIQUE INDEX agent_connection_provider_artifacts_uid_idx
  ON community.agent_connection_provider_artifacts (uid_digest)
  WHERE uid_digest IS NOT NULL;

-- revokeByGrantId sweeps every artifact of one grant.
CREATE INDEX agent_connection_provider_artifacts_grant_idx
  ON community.agent_connection_provider_artifacts (grant_id)
  WHERE grant_id IS NOT NULL;

-- Bounded expiry cleanup that opens nothing.
CREATE INDEX agent_connection_provider_artifacts_expiry_idx
  ON community.agent_connection_provider_artifacts (expires_at);
