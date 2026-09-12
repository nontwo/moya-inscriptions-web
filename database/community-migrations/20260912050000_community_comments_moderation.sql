-- Community V1 / Mission 2B: Catalog comments, one level of replies, the
-- Owner-controlled publication setting and an append-only moderation audit.
-- The runner has already created the community schema and its ledger with
-- migration-privileged credentials; the App runtime role receives DML grants
-- separately and never runs this file.

-- No cross-family foreign key: catalog_id is validated by the Backend against
-- the published Catalog read side before every write (amendment section 2).
CREATE TABLE community.catalog_comments (
  id TEXT PRIMARY KEY,
  catalog_id TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES community.public_users (id),
  text TEXT NOT NULL,
  moderation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  moderated_at TIMESTAMPTZ,
  moderated_by TEXT,
  CONSTRAINT catalog_comments_id_opaque CHECK (id ~ '^comment-[0-9a-f]{32}$'),
  CONSTRAINT catalog_comments_catalog_id_bounded CHECK (
    catalog_id ~ '^\S{1,128}$'
  ),
  CONSTRAINT catalog_comments_text_bounded CHECK (
    char_length(text) BETWEEN 1 AND 1000 AND text = btrim(text)
  ),
  CONSTRAINT catalog_comments_moderation_valid CHECK (
    moderation IN ('pending', 'visible', 'hidden')
  ),
  CONSTRAINT catalog_comments_moderation_recorded CHECK (
    (moderated_at IS NULL) = (moderated_by IS NULL)
    AND (moderated_by IS NULL OR moderated_by ~ '^[a-z][a-z0-9-]{0,63}$')
  )
);

-- Reply depth is structurally one: replies live in their own table and can
-- never own children. The composite foreign key below additionally forces a
-- reply-to-reply pointer to stay inside the same root thread.
CREATE TABLE community.catalog_comment_replies (
  id TEXT PRIMARY KEY,
  root_comment_id TEXT NOT NULL REFERENCES community.catalog_comments (id),
  author_id TEXT NOT NULL REFERENCES community.public_users (id),
  text TEXT NOT NULL,
  moderation TEXT NOT NULL,
  reply_to_reply_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  moderated_at TIMESTAMPTZ,
  moderated_by TEXT,
  CONSTRAINT catalog_comment_replies_id_opaque CHECK (
    id ~ '^comment-[0-9a-f]{32}$'
  ),
  CONSTRAINT catalog_comment_replies_text_bounded CHECK (
    char_length(text) BETWEEN 1 AND 1000 AND text = btrim(text)
  ),
  CONSTRAINT catalog_comment_replies_moderation_valid CHECK (
    moderation IN ('pending', 'visible', 'hidden')
  ),
  CONSTRAINT catalog_comment_replies_moderation_recorded CHECK (
    (moderated_at IS NULL) = (moderated_by IS NULL)
    AND (moderated_by IS NULL OR moderated_by ~ '^[a-z][a-z0-9-]{0,63}$')
  ),
  CONSTRAINT catalog_comment_replies_not_self CHECK (reply_to_reply_id <> id),
  CONSTRAINT catalog_comment_replies_thread_unique UNIQUE (id, root_comment_id),
  CONSTRAINT catalog_comment_replies_pointer_same_thread FOREIGN KEY
    (reply_to_reply_id, root_comment_id)
    REFERENCES community.catalog_comment_replies (id, root_comment_id)
);

CREATE INDEX catalog_comments_page_idx
  ON community.catalog_comments (catalog_id, moderation, created_at DESC, id DESC);
CREATE INDEX catalog_comments_moderation_idx
  ON community.catalog_comments (moderation, created_at DESC, id DESC);
CREATE INDEX catalog_comments_author_idx
  ON community.catalog_comments (author_id);
CREATE INDEX catalog_comment_replies_page_idx
  ON community.catalog_comment_replies (root_comment_id, moderation, created_at ASC, id ASC);
CREATE INDEX catalog_comment_replies_moderation_idx
  ON community.catalog_comment_replies (moderation, created_at DESC, id DESC);
CREATE INDEX catalog_comment_replies_author_idx
  ON community.catalog_comment_replies (author_id);

-- Exactly one row: the Owner-controlled global publication setting. Switching
-- it affects new submissions only; the Backend never rewrites existing rows.
CREATE TABLE community.publication_setting (
  id TEXT PRIMARY KEY,
  policy TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL,
  CONSTRAINT publication_setting_single_row CHECK (id = 'publication'),
  CONSTRAINT publication_setting_policy_valid CHECK (
    policy IN ('PRE_MODERATION', 'DIRECT_PUBLICATION')
  ),
  CONSTRAINT publication_setting_operator_bounded CHECK (
    updated_by ~ '^[a-z][a-z0-9-]{0,63}$'
  )
);

-- PRE_MODERATION is the default the amendment preserves from ADR 0006 §6.
INSERT INTO community.publication_setting (id, policy, updated_by)
VALUES ('publication', 'PRE_MODERATION', 'platform');

-- Append-only: every moderation action records who and when. The operator
-- label is never a PublicUserId and never a Payload row id.
CREATE TABLE community.moderation_events (
  id TEXT PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  operator_label TEXT NOT NULL,
  action TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  detail TEXT,
  CONSTRAINT moderation_events_id_opaque CHECK (
    id ~ '^moderation-[0-9a-f]{32}$'
  ),
  CONSTRAINT moderation_events_operator_bounded CHECK (
    operator_label ~ '^[a-z][a-z0-9-]{0,63}$'
  ),
  CONSTRAINT moderation_events_action_valid CHECK (
    action IN (
      'approve', 'hide', 'unhide', 'suspend', 'reinstate',
      'set_publication_policy'
    )
  ),
  CONSTRAINT moderation_events_subject_valid CHECK (
    subject_kind IN ('comment', 'reply', 'user', 'setting')
  ),
  CONSTRAINT moderation_events_detail_bounded CHECK (
    detail IS NULL OR char_length(detail) BETWEEN 1 AND 200
  )
);

CREATE INDEX moderation_events_occurred_idx
  ON community.moderation_events (occurred_at DESC, id DESC);
