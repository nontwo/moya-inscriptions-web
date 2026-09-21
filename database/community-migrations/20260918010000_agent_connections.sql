-- agent-connections-v1 (Issue #141 r13): canonical connection authority.
--
-- Three tables, in the community schema where the Backend can enforce write
-- admission. Forward-only; no data change.
--
-- The shape that matters: grants are ROWS, not a column on the connection. A
-- connection accumulates a provider grant per consent -- reconnect and
-- re-consent each create one -- and every old grant must keep resolving to the
-- generation that was current when its human consented. A single mutable
-- generation on the connection would let a token refreshed from an old grant
-- resolve to the CURRENT generation and be admitted, which is exactly the
-- vulnerability the r12 review measured.
--
-- No column here holds a credential. The wrapper's provider token identifier
-- is stored only as authenticated ciphertext, and the wrapper value itself is
-- stored only as a lookup digest.

CREATE TABLE community.agent_connections (
  id TEXT PRIMARY KEY CHECK (id ~ '^conn-[0-9a-f]{32}$'),
  human_account_id TEXT NOT NULL CHECK (char_length(human_account_id) BETWEEN 1 AND 128),
  -- Descriptive vendor family for the Admin. Never identity.
  client_family TEXT NOT NULL CHECK (client_family IN ('claude', 'codex', 'cursor')),
  -- The exact registered client. This IS identity; two clients of one family
  -- are two authorizations.
  oauth_client_id TEXT NOT NULL CHECK (char_length(oauth_client_id) BETWEEN 1 AND 1024),
  environment TEXT NOT NULL CHECK (char_length(environment) BETWEEN 1 AND 64),
  principal_label TEXT NOT NULL CHECK (principal_label ~ '^agent-[a-z0-9-]{2,57}$'),
  preset TEXT NOT NULL CHECK (preset IN ('read-only', 'management')),
  status TEXT NOT NULL CHECK (status IN ('awaiting-consent', 'authorized', 'revoked')),
  generation BIGINT NOT NULL DEFAULT 0 CHECK (generation >= 0),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- A POINTER to the live consent grant, never the only grant. Deliberately
  -- retained after revocation so provider cleanup stays attributable.
  current_grant_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consented_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  provider_cleanup_status TEXT NOT NULL DEFAULT 'not-required'
    CHECK (provider_cleanup_status IN ('not-required', 'pending', 'done', 'failed')),
  -- A bare code. Never a message that could carry data with it.
  provider_cleanup_error TEXT CHECK (provider_cleanup_error ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  CONSTRAINT agent_connections_revocation_recorded
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CONSTRAINT agent_connections_consent_recorded
    CHECK ((status = 'awaiting-consent') = (consented_at IS NULL))
);

-- One immutable consent snapshot per provider grant. Nothing here is rewritten
-- except the destruction columns: `generation_at_consent` in particular is
-- frozen, and a reconnect adds a row rather than editing one.
CREATE TABLE community.agent_connection_grants (
  grant_id TEXT PRIMARY KEY CHECK (char_length(grant_id) BETWEEN 1 AND 256),
  connection_id TEXT NOT NULL REFERENCES community.agent_connections (id),
  generation_at_consent BIGINT NOT NULL CHECK (generation_at_consent >= 0),
  oauth_client_id TEXT NOT NULL CHECK (char_length(oauth_client_id) BETWEEN 1 AND 1024),
  human_subject TEXT NOT NULL CHECK (char_length(human_subject) BETWEEN 1 AND 128),
  -- Provenance of the issuing provider instance, NOT an assertion. The runtime
  -- defence against a foreign issuer is structural: a token minted by another
  -- provider instance does not resolve through this one's adapter at all.
  issuer TEXT NOT NULL CHECK (char_length(issuer) BETWEEN 1 AND 512),
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 512),
  capability_scopes TEXT[] NOT NULL DEFAULT '{}',
  protocol_scopes TEXT[] NOT NULL DEFAULT '{}',
  preset_at_consent TEXT NOT NULL CHECK (preset_at_consent IN ('read-only', 'management')),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  destroyed_at TIMESTAMPTZ,
  destroy_status TEXT NOT NULL DEFAULT 'not-requested'
    CHECK (destroy_status IN ('not-requested', 'pending', 'done', 'failed')),
  CONSTRAINT agent_connection_grants_destruction_recorded
    CHECK ((destroy_status = 'done') = (destroyed_at IS NOT NULL)),
  -- The tuple the wrapper's composite foreign key points at, so the DATABASE
  -- guarantees a wrapper cannot disagree with its grant.
  CONSTRAINT agent_connection_grants_identity_unique
    UNIQUE (grant_id, connection_id, generation_at_consent)
);

CREATE INDEX agent_connection_grants_connection_idx
  ON community.agent_connection_grants (connection_id, consented_at DESC, grant_id DESC);

CREATE INDEX agent_connection_grants_pending_destroy_idx
  ON community.agent_connection_grants (destroy_status, consented_at)
  WHERE destroy_status IN ('pending', 'failed');

-- One row per external prefixed access token. The token itself is never
-- stored: only a lookup digest of it, and the provider's own token identifier
-- sealed under authenticated encryption.
CREATE TABLE community.agent_connection_wrappers (
  lookup_digest TEXT PRIMARY KEY CHECK (lookup_digest ~ '^[0-9a-f]{64}$'),
  sealed_jti BYTEA NOT NULL CHECK (octet_length(sealed_jti) BETWEEN 29 AND 4096),
  format_version INTEGER NOT NULL DEFAULT 1 CHECK (format_version >= 1),
  grant_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  generation BIGINT NOT NULL CHECK (generation >= 0),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  invalidated_at TIMESTAMPTZ,
  -- The invariant enforced by the database rather than by application code: a
  -- wrapper row whose connection or generation disagrees with its grant cannot
  -- be inserted at all.
  CONSTRAINT agent_connection_wrappers_grant_identity
    FOREIGN KEY (grant_id, connection_id, generation)
    REFERENCES community.agent_connection_grants
      (grant_id, connection_id, generation_at_consent)
);

CREATE INDEX agent_connection_wrappers_grant_idx
  ON community.agent_connection_wrappers (grant_id);

-- Reaping expired rows without scanning anything sensitive.
CREATE INDEX agent_connection_wrappers_expiry_idx
  ON community.agent_connection_wrappers (expires_at)
  WHERE invalidated_at IS NULL;
