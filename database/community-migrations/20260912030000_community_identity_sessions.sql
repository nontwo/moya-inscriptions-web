-- Community V1 / Mission 2A: public-user identity and Backend-owned sessions.
-- The runner has already created the community schema and its ledger with
-- migration-privileged credentials; the App runtime role receives DML grants
-- separately and never runs this file.

CREATE TABLE community.public_users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT public_users_id_opaque CHECK (id ~ '^user-[0-9a-f]{32}$'),
  CONSTRAINT public_users_handle_unique UNIQUE (handle),
  CONSTRAINT public_users_handle_normalized CHECK (
    handle ~ '^[a-z][a-z0-9-]{2,31}$'
  ),
  -- Duplicate display names are allowed; only bounds and trimming are enforced.
  CONSTRAINT public_users_display_name_bounded CHECK (
    char_length(display_name) BETWEEN 1 AND 40
    AND display_name = btrim(display_name)
  ),
  CONSTRAINT public_users_status_valid CHECK (
    status IN ('active', 'suspended')
  )
);

-- Only rows listed here may sign in through the Development entry; the table
-- is empty outside Development and the entry is never composed in Production.
CREATE TABLE community.development_accounts (
  user_id TEXT PRIMARY KEY REFERENCES community.public_users (id),
  label TEXT NOT NULL,
  CONSTRAINT development_accounts_label_bounded CHECK (
    char_length(label) BETWEEN 1 AND 80
  )
);

-- Opaque server-side session records. Only the SHA-256 digest of the bearer
-- token is stored; expiry is absolute and revocation is recorded, never deleted.
CREATE TABLE community.sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES community.public_users (id),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT sessions_id_opaque CHECK (id ~ '^session-[0-9a-f]{32}$'),
  CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT sessions_token_hash_sha256 CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sessions_expiry_after_issue CHECK (expires_at > issued_at),
  CONSTRAINT sessions_revocation_after_issue CHECK (
    revoked_at IS NULL OR revoked_at >= issued_at
  )
);

CREATE INDEX sessions_user_id_idx ON community.sessions (user_id);
