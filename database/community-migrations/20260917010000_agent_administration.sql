-- data-admin-hardening-v1 Phase B (Issue #141 r3): Agent Administration V1.
-- Machine principals, bounded persisted delegations and durable prepared
-- operations. A principal is an operator label with the agent- prefix: it is
-- recorded on every moderation event, content operator event and receipt the
-- existing services write, exactly like the Owner's label. Nothing here
-- references a Payload row or a PublicUserId. Forward-only; no data change.

CREATE TABLE community.agent_principals (
  label TEXT PRIMARY KEY CHECK (label ~ '^agent-[a-z0-9-]{2,57}$'),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  scopes TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ
);

-- While active, a principal's prepared operation of this kind with at most
-- max_targets targets is approved without an Owner click. It never covers
-- future comments: every operation still names a fixed, frozen selection.
CREATE TABLE community.agent_delegations (
  id UUID PRIMARY KEY,
  principal_label TEXT NOT NULL REFERENCES community.agent_principals (label),
  kind TEXT NOT NULL CHECK (kind IN ('comments.moderate', 'featured.set')),
  max_targets INTEGER NOT NULL CHECK (max_targets BETWEEN 1 AND 500),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by ~ '^[a-z][a-z0-9-]{0,63}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT CHECK (revoked_by IS NULL OR revoked_by ~ '^[a-z][a-z0-9-]{0,63}$'),
  CONSTRAINT agent_delegations_revocation_recorded CHECK (
    (revoked_at IS NULL) = (revoked_by IS NULL)
  )
);
CREATE INDEX agent_delegations_active_idx
  ON community.agent_delegations (principal_label, kind, expires_at)
  WHERE revoked_at IS NULL;

-- A prepared operation is immutable in its targets: only its lifecycle
-- columns change. (principal_label, request_id) is the replay key of the
-- preparing command; execution, approval, cancellation and undo preparation
-- are idempotent by state. results holds one entry per processed target.
CREATE TABLE community.agent_operations (
  id UUID PRIMARY KEY,
  principal_label TEXT NOT NULL REFERENCES community.agent_principals (label),
  request_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('comments.moderate', 'featured.set')),
  action TEXT CHECK (action IS NULL OR action IN ('approve', 'reject', 'hide', 'unhide')),
  state TEXT NOT NULL CHECK (
    state IN ('prepared', 'approved', 'executing', 'completed', 'cancelled', 'failed')
  ),
  targets JSONB NOT NULL,
  target_count INTEGER NOT NULL CHECK (target_count BETWEEN 1 AND 500),
  fingerprint TEXT NOT NULL,
  approval JSONB,
  undo_of UUID REFERENCES community.agent_operations (id),
  next_index INTEGER NOT NULL DEFAULT 0 CHECK (next_index >= 0),
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  CONSTRAINT agent_operations_request_unique UNIQUE (principal_label, request_id),
  CONSTRAINT agent_operations_comment_action CHECK (
    (kind = 'comments.moderate') = (action IS NOT NULL)
  ),
  CONSTRAINT agent_operations_lease_recorded CHECK (
    (lease_owner IS NULL) = (lease_expires_at IS NULL)
  )
);
CREATE INDEX agent_operations_state_idx
  ON community.agent_operations (state, created_at DESC, id DESC);
CREATE INDEX agent_operations_principal_idx
  ON community.agent_operations (principal_label, created_at DESC, id DESC);
