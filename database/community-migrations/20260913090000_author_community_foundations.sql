-- Phase 4: new product domains; no existing identity or migration is rewritten.
ALTER TABLE community.public_users
  ADD COLUMN bio TEXT NOT NULL DEFAULT '' CHECK (char_length(bio) <= 500 AND bio = btrim(bio)),
  ADD COLUMN following_privacy TEXT NOT NULL DEFAULT 'public' CHECK (following_privacy IN ('public','private')),
  ADD COLUMN followers_privacy TEXT NOT NULL DEFAULT 'public' CHECK (followers_privacy IN ('public','private')),
  ADD COLUMN favorites_privacy TEXT NOT NULL DEFAULT 'private' CHECK (favorites_privacy IN ('public','private')),
  ADD COLUMN likes_privacy TEXT NOT NULL DEFAULT 'private' CHECK (likes_privacy IN ('public','private')),
  ADD COLUMN avatar_media_id TEXT,
  ADD COLUMN avatar_changed_on DATE;

CREATE TABLE community.user_media (
  id TEXT PRIMARY KEY CHECK (id ~ '^user-media-[0-9a-f]{32}$'),
  owner_id TEXT NOT NULL REFERENCES community.public_users(id),
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/png'),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 8192),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 8192),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  bytes BYTEA NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 4194304),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id, owner_id)
);
ALTER TABLE community.public_users ADD CONSTRAINT avatar_owned
  FOREIGN KEY(avatar_media_id,id) REFERENCES community.user_media(id,owner_id);

CREATE TABLE community.works (
  id TEXT PRIMARY KEY CHECK (id ~ '^work-[0-9a-f]{32}$'),
  author_id TEXT NOT NULL REFERENCES community.public_users(id),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200 AND title = btrim(title)),
  text TEXT NOT NULL CHECK (char_length(text) <= 10000 AND text = btrim(text)),
  media_ids TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(media_ids) <= 12),
  first_published_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  operator_state TEXT NOT NULL DEFAULT 'visible' CHECK (operator_state IN ('visible','hidden','removed')),
  deleted_at TIMESTAMPTZ,
  synthetic_provenance TEXT,
  UNIQUE(id,author_id)
);
CREATE INDEX works_publication_idx ON community.works(first_published_at DESC,id DESC)
  WHERE deleted_at IS NULL AND operator_state = 'visible';
CREATE INDEX works_author_idx ON community.works(author_id,first_published_at DESC,id DESC);

CREATE TABLE community.work_edit_drafts (
  id TEXT PRIMARY KEY CHECK (id ~ '^draft-[0-9a-f]{32}$'),
  work_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  base_work_version INTEGER NOT NULL CHECK (base_work_version >= 0),
  base_draft_version INTEGER NOT NULL CHECK (base_draft_version >= 0),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  text TEXT NOT NULL CHECK (char_length(text) <= 10000),
  media_ids TEXT[] NOT NULL CHECK (cardinality(media_ids) <= 12),
  conflicted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TIMESTAMPTZ,
  discarded_at TIMESTAMPTZ,
  FOREIGN KEY(work_id,author_id) REFERENCES community.works(id,author_id),
  UNIQUE(work_id,version)
);
CREATE INDEX work_drafts_author_idx ON community.work_edit_drafts(author_id,work_id,version DESC);

CREATE TABLE community.follows (
  follower_id TEXT NOT NULL REFERENCES community.public_users(id),
  followed_id TEXT NOT NULL REFERENCES community.public_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(follower_id,followed_id), CHECK (follower_id <> followed_id)
);
CREATE TABLE community.blocks (
  blocker_id TEXT NOT NULL REFERENCES community.public_users(id),
  blocked_id TEXT NOT NULL REFERENCES community.public_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(blocker_id,blocked_id), CHECK (blocker_id <> blocked_id)
);
-- Shared policy for authenticated profile/content access and direct interactions.
-- NULL is anonymous: blocking makes no claim about anonymous public access.
CREATE FUNCTION community.accounts_can_interact(actor TEXT, target TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT actor IS NULL OR target IS NULL OR NOT EXISTS (
    SELECT 1 FROM community.blocks b WHERE
      (b.blocker_id=actor AND b.blocked_id=target) OR
      (b.blocker_id=target AND b.blocked_id=actor)
  )
$$;

CREATE TABLE community.content_relations (
  user_id TEXT NOT NULL REFERENCES community.public_users(id),
  content_type TEXT NOT NULL CHECK (content_type IN ('catalog','work')),
  content_id TEXT NOT NULL CHECK (content_id ~ '^\S{1,128}$'),
  relation TEXT NOT NULL CHECK (relation IN ('favorite','like')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,content_type,content_id,relation)
);
CREATE INDEX content_relations_list_idx ON community.content_relations(user_id,relation,created_at DESC,content_id DESC);
CREATE TABLE community.author_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE community.author_command_receipts (
  actor_id TEXT NOT NULL REFERENCES community.public_users(id),
  request_id UUID NOT NULL,
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(actor_id,request_id)
);
