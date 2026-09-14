-- work-publishing-v1 (Owner instruction 2026-09-13): immutable work
-- revisions, desired visibility, the recycle bin, persistent drafts with
-- snapshots, temporary publishing sessions and the single effective
-- third-party visibility predicate. Work, discussion and relation identities
-- are unchanged; works.title/text become the denormalized public revision
-- content ('' when never public). works.media_ids stays for legacy reads.
-- Forward-only: earlier files and their ledger rows stay untouched.

ALTER TABLE community.works
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
    CONSTRAINT works_visibility_valid CHECK (visibility IN ('public', 'self')),
  ADD COLUMN public_revision_id TEXT,
  ADD COLUMN author_revision_id TEXT,
  ADD COLUMN edited_at TIMESTAMPTZ,
  ADD COLUMN trashed_at TIMESTAMPTZ,
  ADD COLUMN trash_purge_after TIMESTAMPTZ,
  ADD COLUMN first_submitted_at TIMESTAMPTZ,
  ADD COLUMN created_via TEXT NOT NULL DEFAULT 'legacy'
    CONSTRAINT works_created_via_valid CHECK (
      created_via IN ('legacy', 'publishing')
    ),
  -- Private-first works receive their first publication time only when they
  -- are first exposed publicly.
  ALTER COLUMN first_published_at DROP NOT NULL;

-- The Phase 4 inline title CHECK (auto-named works_title_check) required a
-- non-empty title. Drop exactly that verified title-only constraint, refusing
-- to guess when the catalog differs, then allow an empty title within the
-- same bound.
DO $$
DECLARE
  matched INTEGER;
BEGIN
  SELECT count(*) INTO matched
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid AND a.attname = 'title'
  WHERE c.conrelid = 'community.works'::regclass
    AND c.contype = 'c'
    AND c.conname = 'works_title_check'
    AND c.conkey = ARRAY[a.attnum];
  IF matched <> 1 THEN
    RAISE EXCEPTION 'community.works title constraint differs from the verified Phase 4 definition';
  END IF;
  ALTER TABLE community.works DROP CONSTRAINT works_title_check;
END $$;

ALTER TABLE community.works
  ADD CONSTRAINT works_title_publishing_check CHECK (
    char_length(title) <= 200 AND title = btrim(title)
  ),
  -- A public revision is only ever set together with the first public
  -- exposure time, and a trashed work always has its purge time.
  ADD CONSTRAINT works_public_revision_published CHECK (
    public_revision_id IS NULL OR first_published_at IS NOT NULL
  ),
  ADD CONSTRAINT works_trash_purge_scheduled CHECK (
    trashed_at IS NULL OR trash_purge_after IS NOT NULL
  );

-- One immutable explicit submission (or the legacy baseline) of a work.
CREATE TABLE community.work_revisions (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  origin TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  authorship_kind TEXT NOT NULL,
  reference_title TEXT,
  original_author TEXT,
  source_note TEXT,
  requested_visibility TEXT NOT NULL,
  cover_item_id TEXT REFERENCES community.media_items (id),
  cover_crop JSONB,
  content_sha256 TEXT NOT NULL,
  disposition TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  request_id UUID,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT work_revisions_id_opaque CHECK (
    id ~ '^work-revision-[0-9a-f]{32}$'
  ),
  CONSTRAINT work_revisions_work_authored FOREIGN KEY (work_id, author_id)
    REFERENCES community.works (id, author_id),
  CONSTRAINT work_revisions_work_sequence_unique UNIQUE (work_id, sequence),
  CONSTRAINT work_revisions_id_work_unique UNIQUE (id, work_id),
  CONSTRAINT work_revisions_sequence_positive CHECK (sequence >= 1),
  CONSTRAINT work_revisions_origin_valid CHECK (
    origin IN ('submission', 'legacy')
  ),
  CONSTRAINT work_revisions_title_bounded CHECK (
    char_length(title) <= 200 AND title = btrim(title)
  ),
  CONSTRAINT work_revisions_body_bounded CHECK (
    char_length(body) <= 10000 AND body = btrim(body)
  ),
  CONSTRAINT work_revisions_authorship_kind_valid CHECK (
    authorship_kind IN ('original', 'copy_practice', 'material_sharing')
  ),
  CONSTRAINT work_revisions_reference_title_bounded CHECK (
    reference_title IS NULL
    OR (
      char_length(reference_title) <= 200
      AND reference_title = btrim(reference_title)
    )
  ),
  CONSTRAINT work_revisions_original_author_bounded CHECK (
    original_author IS NULL
    OR (
      char_length(original_author) <= 100
      AND original_author = btrim(original_author)
    )
  ),
  CONSTRAINT work_revisions_source_note_bounded CHECK (
    source_note IS NULL
    OR (char_length(source_note) <= 500 AND source_note = btrim(source_note))
  ),
  -- Submissions store the normalized form: no CR anywhere and single-line
  -- titles. Legacy baselines keep Phase 4 text exactly as it was stored.
  CONSTRAINT work_revisions_submission_text_normalized CHECK (
    origin = 'legacy'
    OR (
      title !~ '[\r\n]'
      AND body !~ '\r'
      AND COALESCE(reference_title, '') !~ '[\r\n]'
      AND COALESCE(original_author, '') !~ '[\r\n]'
      AND COALESCE(source_note, '') !~ '\r'
    )
  ),
  CONSTRAINT work_revisions_requested_visibility_valid CHECK (
    requested_visibility IN ('public', 'self')
  ),
  CONSTRAINT work_revisions_cover_crop_object CHECK (
    cover_crop IS NULL OR jsonb_typeof(cover_crop) = 'object'
  ),
  CONSTRAINT work_revisions_content_sha256_valid CHECK (
    content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT work_revisions_disposition_valid CHECK (
    disposition IN (
      'pending', 'approved', 'rejected', 'superseded', 'withdrawn',
      'not_required'
    )
  ),
  CONSTRAINT work_revisions_decided_by_bounded CHECK (
    decided_by IS NULL OR decided_by ~ '^[a-z][a-z0-9-]{0,63}$'
  ),
  CONSTRAINT work_revisions_version_positive CHECK (version > 0)
);

CREATE INDEX work_revisions_pending_idx
  ON community.work_revisions (submitted_at, id)
  WHERE disposition = 'pending';

-- Ordered album of one revision.
CREATE TABLE community.work_revision_items (
  revision_id TEXT NOT NULL REFERENCES community.work_revisions (id),
  position INTEGER NOT NULL,
  item_id TEXT NOT NULL REFERENCES community.media_items (id),
  edit JSONB NOT NULL,
  PRIMARY KEY (revision_id, position),
  CONSTRAINT work_revision_items_item_unique UNIQUE (revision_id, item_id),
  CONSTRAINT work_revision_items_position_bounded CHECK (
    position BETWEEN 1 AND 500
  ),
  CONSTRAINT work_revision_items_edit_object CHECK (
    jsonb_typeof(edit) = 'object'
  )
);

CREATE INDEX work_revision_items_item_idx
  ON community.work_revision_items (item_id);

-- Both revision tables exist now; each pointer must name a revision of the
-- same work.
ALTER TABLE community.works
  ADD CONSTRAINT works_public_revision_of_work
    FOREIGN KEY (public_revision_id, id)
    REFERENCES community.work_revisions (id, work_id),
  ADD CONSTRAINT works_author_revision_of_work
    FOREIGN KEY (author_revision_id, id)
    REFERENCES community.work_revisions (id, work_id);

-- Third-party discovery order over effectively public works.
CREATE INDEX works_public_feed_idx
  ON community.works (first_published_at DESC, id DESC)
  WHERE deleted_at IS NULL
    AND trashed_at IS NULL
    AND operator_state = 'visible'
    AND visibility = 'public'
    AND public_revision_id IS NOT NULL;
-- Recycle bin listing and the retention purge.
CREATE INDEX works_trash_idx
  ON community.works (author_id, trashed_at DESC, id DESC)
  WHERE trashed_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX works_trash_purge_idx
  ON community.works (trash_purge_after)
  WHERE trashed_at IS NOT NULL AND deleted_at IS NULL;

-- The single effective third-party visibility predicate over a work row.
-- Callers add the existing author-active and accounts_can_interact checks;
-- the author's own branch is author_id = viewer AND deleted_at IS NULL.
CREATE FUNCTION community.work_is_public(w community.works)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT w.deleted_at IS NULL
    AND w.trashed_at IS NULL
    AND w.operator_state = 'visible'
    AND w.visibility = 'public'
    AND w.public_revision_id IS NOT NULL
$$;

-- The one definition of a revision's content identity; never recomputed
-- outside PostgreSQL. A submission sets works.edited_at only when this differs
-- from the previous public revision's content_sha256. It covers what third
-- parties see: text, authorship, the ordered items with their edits, the cover
-- and its crop. Visibility, disposition and times are not content. Line breaks
-- are compared as LF, so Phase 4 text resubmitted in normalized form is
-- unchanged. items is the ordered JSON array of {itemId, edit}; other keys are
-- ignored. The hash is over the text of one positional jsonb array.
CREATE FUNCTION community.work_content_sha256(
  title TEXT,
  body TEXT,
  authorship_kind TEXT,
  reference_title TEXT,
  original_author TEXT,
  source_note TEXT,
  items JSONB,
  cover_item_id TEXT,
  cover_crop JSONB
)
RETURNS TEXT LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT encode(
    sha256(
      convert_to(
        jsonb_build_array(
          regexp_replace(title, E'\r\n?', E'\n', 'g'),
          regexp_replace(body, E'\r\n?', E'\n', 'g'),
          authorship_kind,
          regexp_replace(reference_title, E'\r\n?', E'\n', 'g'),
          regexp_replace(original_author, E'\r\n?', E'\n', 'g'),
          regexp_replace(source_note, E'\r\n?', E'\n', 'g'),
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_array(
                  e.item ->> 'itemId',
                  e.item -> 'edit' -> 'rotation',
                  e.item -> 'edit' -> 'crop'
                )
                ORDER BY e.ordinal
              )
              FROM jsonb_array_elements(items) WITH ORDINALITY AS e(item, ordinal)
            ),
            '[]'::jsonb
          ),
          cover_item_id,
          cover_crop
        )::text,
        'UTF8'
      )
    ),
    'hex'
  )
$$;

-- Persistent private drafts for new works and for edits of existing works.
-- Current drafts never expire by age.
CREATE TABLE community.work_drafts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES community.public_users (id),
  work_id TEXT,
  base_revision_id TEXT,
  state TEXT NOT NULL DEFAULT 'active',
  conflict_of TEXT,
  resolved_at TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 1,
  content JSONB NOT NULL,
  content_sha256 TEXT NOT NULL,
  device_class TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT work_drafts_id_opaque CHECK (id ~ '^work-draft-[0-9a-f]{32}$'),
  CONSTRAINT work_drafts_id_owner_unique UNIQUE (id, owner_id),
  CONSTRAINT work_drafts_work_owned FOREIGN KEY (work_id, owner_id)
    REFERENCES community.works (id, author_id),
  CONSTRAINT work_drafts_base_revision_of_work
    FOREIGN KEY (base_revision_id, work_id)
    REFERENCES community.work_revisions (id, work_id),
  CONSTRAINT work_drafts_base_revision_needs_work CHECK (
    base_revision_id IS NULL OR work_id IS NOT NULL
  ),
  CONSTRAINT work_drafts_conflict_of_owned FOREIGN KEY (conflict_of, owner_id)
    REFERENCES community.work_drafts (id, owner_id),
  CONSTRAINT work_drafts_conflict_not_self CHECK (conflict_of <> id),
  CONSTRAINT work_drafts_state_valid CHECK (
    state IN ('active', 'submitted', 'deleted')
  ),
  CONSTRAINT work_drafts_revision_positive CHECK (revision >= 1),
  CONSTRAINT work_drafts_content_bounded CHECK (
    jsonb_typeof(content) = 'object'
    AND octet_length(content::text) <= 1048576
  ),
  CONSTRAINT work_drafts_content_sha256_valid CHECK (
    content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  -- Coarse class only; never a device model or identifier.
  CONSTRAINT work_drafts_device_class_valid CHECK (
    device_class IS NULL OR device_class IN ('phone', 'tablet', 'desktop')
  )
);

-- One active primary edit draft per existing work; conflict copies excluded.
CREATE UNIQUE INDEX work_drafts_active_primary_per_work
  ON community.work_drafts (owner_id, work_id)
  WHERE work_id IS NOT NULL AND state = 'active' AND conflict_of IS NULL;
-- Newest-first picker and the active primary draft count.
CREATE INDEX work_drafts_owner_active_idx
  ON community.work_drafts (owner_id, updated_at DESC, id DESC)
  WHERE state = 'active';
CREATE INDEX work_drafts_conflict_of_idx
  ON community.work_drafts (conflict_of)
  WHERE conflict_of IS NOT NULL;

-- Important draft snapshots. Retention keeps the newest history_limit
-- unpinned rows per lineage (work_id, else draft_id); pinned conflict copies
-- are never evicted by count.
CREATE TABLE community.work_draft_snapshots (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES community.public_users (id),
  draft_id TEXT,
  work_id TEXT,
  kind TEXT NOT NULL,
  content JSONB NOT NULL,
  source_revision INTEGER,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT work_draft_snapshots_id_opaque CHECK (
    id ~ '^work-snapshot-[0-9a-f]{32}$'
  ),
  CONSTRAINT work_draft_snapshots_draft_owned FOREIGN KEY (draft_id, owner_id)
    REFERENCES community.work_drafts (id, owner_id),
  CONSTRAINT work_draft_snapshots_work_owned FOREIGN KEY (work_id, owner_id)
    REFERENCES community.works (id, author_id),
  CONSTRAINT work_draft_snapshots_lineage_present CHECK (
    draft_id IS NOT NULL OR work_id IS NOT NULL
  ),
  CONSTRAINT work_draft_snapshots_kind_valid CHECK (
    kind IN (
      'saved', 'submitted', 'published', 'conflict', 'restored', 'legacy_draft'
    )
  ),
  CONSTRAINT work_draft_snapshots_content_bounded CHECK (
    jsonb_typeof(content) = 'object'
    AND octet_length(content::text) <= 1048576
  ),
  CONSTRAINT work_draft_snapshots_source_revision_positive CHECK (
    source_revision IS NULL OR source_revision >= 1
  )
);

CREATE INDEX work_draft_snapshots_lineage_idx
  ON community.work_draft_snapshots (
    owner_id, (COALESCE(work_id, draft_id)), created_at DESC, id DESC
  );
CREATE INDEX work_draft_snapshots_draft_idx
  ON community.work_draft_snapshots (draft_id)
  WHERE draft_id IS NOT NULL;

-- Minimal temporary sessions. Unsaved mode uses the session as the only media
-- holder and never has a draft; saved mode may link its draft.
CREATE TABLE community.publishing_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES community.public_users (id),
  save_mode TEXT NOT NULL,
  draft_id TEXT,
  work_id TEXT,
  state TEXT NOT NULL DEFAULT 'active',
  lease_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  CONSTRAINT publishing_sessions_id_opaque CHECK (
    id ~ '^publishing-session-[0-9a-f]{32}$'
  ),
  CONSTRAINT publishing_sessions_save_mode_valid CHECK (
    save_mode IN ('saved', 'unsaved')
  ),
  CONSTRAINT publishing_sessions_unsaved_without_draft CHECK (
    save_mode = 'saved' OR draft_id IS NULL
  ),
  CONSTRAINT publishing_sessions_draft_owned FOREIGN KEY (draft_id, owner_id)
    REFERENCES community.work_drafts (id, owner_id),
  CONSTRAINT publishing_sessions_work_owned FOREIGN KEY (work_id, owner_id)
    REFERENCES community.works (id, author_id),
  CONSTRAINT publishing_sessions_state_valid CHECK (
    state IN ('active', 'submitted', 'discarded', 'expired')
  )
);

CREATE INDEX publishing_sessions_owner_state_idx
  ON community.publishing_sessions (owner_id, state);
CREATE INDEX publishing_sessions_lease_idx
  ON community.publishing_sessions (lease_expires_at)
  WHERE state = 'active';
