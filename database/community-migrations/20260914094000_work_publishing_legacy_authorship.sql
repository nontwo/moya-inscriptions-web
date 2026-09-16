-- work-publishing-v1 (Owner instruction 2026-09-13, C05 "no other metadata"
-- and no invented ownership claims): a revision may declare no authorship.
-- Phase 4 authors never declared one, so legacy baselines stop claiming
-- 'original': their authorship becomes NULL (not set), their content identity
-- is recomputed with that NULL, the bridge writes NULL for later Phase 4 style
-- inserts, and legacy draft snapshots carry `"authorship": null`. Edit drafts
-- the server seeded from a legacy baseline with the old 'original' default,
-- and never changed since, lose that default as well.
-- Forward-only: earlier files and their ledger rows stay untouched; works,
-- items, refs, user media, Catalog and avatar data are not rewritten.
--
-- Deploy order: stop the Backend, apply this migration, then start the build
-- that reads NULL authorship. A Backend built before it refuses NULL
-- authorship on every read of an upgraded Phase 4 work and would seed new
-- edit drafts with the old default while it runs.
--
-- community.work_content_sha256 keeps its signature and body. It hashes the
-- positional jsonb array [title, body, authorship_kind, reference_title,
-- original_author, source_note, items, cover_item_id, cover_crop]; a NULL
-- kind is the JSON null element, which no declared kind (always a string)
-- produces, and a NULL kind now forces NULL reference fields (constraint
-- below), so "not set" already hashes distinctly from every declaration. Every
-- revision that declares authorship therefore keeps its stored hash.

-- Blocks Phase 4 style inserts (and their bridge trigger), every revision
-- reader and writer, and every draft and snapshot writer until this migration
-- commits, so no legacy baseline or edit draft is written with an old default
-- after the rewrites below. The revision table is taken in the mode its ALTER
-- needs at once, never upgraded from a weaker lock.
LOCK TABLE community.works IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE community.work_revisions IN ACCESS EXCLUSIVE MODE;
LOCK TABLE community.work_drafts, community.work_draft_snapshots
  IN SHARE ROW EXCLUSIVE MODE;

-- NULL = not set. The existing kind check already admits NULL (a CHECK that
-- evaluates to NULL passes); references only exist under a declared kind.
ALTER TABLE community.work_revisions
  ALTER COLUMN authorship_kind DROP NOT NULL,
  ADD CONSTRAINT work_revisions_authorship_references_need_kind CHECK (
    authorship_kind IS NOT NULL
    OR (
      reference_title IS NULL
      AND original_author IS NULL
      AND source_note IS NULL
    )
  );

-- Legacy baselines never declared authorship. The content identity is
-- recomputed from the stored revision and its items with the one definition;
-- version stays unchanged (a legacy baseline is never moderated).
UPDATE community.work_revisions r
SET
  authorship_kind = NULL,
  reference_title = NULL,
  original_author = NULL,
  source_note = NULL,
  content_sha256 = community.work_content_sha256(
    r.title, r.body, NULL, NULL, NULL, NULL,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('itemId', i.item_id, 'edit', i.edit)
          ORDER BY i.position
        )
        FROM community.work_revision_items i
        WHERE i.revision_id = r.id
      ),
      '[]'::jsonb
    ),
    r.cover_item_id,
    r.cover_crop
  )
WHERE r.origin = 'legacy';

-- The legacy baseline of one work, exactly as in 20260914093000 except that
-- the revision declares no authorship.
CREATE OR REPLACE FUNCTION community.ensure_legacy_work_revision(
  target_work_id TEXT
)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  target community.works%ROWTYPE;
  legacy_revision TEXT;
  legacy_items JSONB;
  legacy_cover TEXT;
  published TIMESTAMPTZ;
  next_sequence INTEGER;
BEGIN
  SELECT * INTO target
  FROM community.works
  WHERE id = target_work_id
  FOR UPDATE;
  IF NOT FOUND OR target.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF target.public_revision_id IS NOT NULL THEN
    RETURN target.public_revision_id;
  END IF;
  IF target.author_revision_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(target.media_ids) AS m(media_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM community.user_media um
      WHERE um.id = m.media_id AND um.owner_id = target.author_id
    )
  ) THEN
    RAISE EXCEPTION 'legacy work media is not owned by the work author';
  END IF;

  INSERT INTO community.media_items (
    id, owner_id, kind, quality_mode, source, legacy_media_id, state,
    declared_total_bytes, received_total_bytes, presentation,
    created_at, updated_at, ready_at
  )
  SELECT DISTINCT
    'media-item-' || md5('legacy-media:' || um.id),
    um.owner_id,
    'static',
    'legacy',
    'legacy_user_media',
    um.id,
    'ready',
    octet_length(um.bytes),
    octet_length(um.bytes),
    jsonb_build_object('width', um.width, 'height', um.height),
    um.created_at,
    um.created_at,
    um.created_at
  FROM unnest(target.media_ids) AS m(media_id)
  JOIN community.user_media um
    ON um.id = m.media_id AND um.owner_id = target.author_id
  ON CONFLICT (id) DO UPDATE SET
    state = 'ready',
    failure_code = NULL,
    cancelled_at = NULL,
    purged_at = NULL,
    ready_at = COALESCE(community.media_items.ready_at, EXCLUDED.ready_at),
    updated_at = CURRENT_TIMESTAMP,
    version = community.media_items.version + 1
  WHERE community.media_items.state IN ('cancelled', 'purged');

  -- A revived item keeps only derivative rows whose blob is still committed
  -- (a purge tombstoned the others); live items never have any other rows.
  DELETE FROM community.media_derivatives d
  USING community.media_blobs b
  WHERE b.id = d.blob_id
    AND b.state <> 'committed'
    AND d.item_id IN (
      SELECT 'media-item-' || md5('legacy-media:' || m.media_id)
      FROM unnest(target.media_ids) AS m(media_id)
    );

  SELECT
    jsonb_agg(
      jsonb_build_object(
        'itemId', ordered.item_id,
        'edit', '{"rotation":0,"crop":null}'::jsonb
      )
      ORDER BY ordered.position
    ),
    (array_agg(ordered.item_id ORDER BY ordered.position))[1]
  INTO legacy_items, legacy_cover
  FROM (
    SELECT
      'media-item-' || md5('legacy-media:' || m.media_id) AS item_id,
      row_number() OVER (ORDER BY min(m.ordinal)) AS position
    FROM unnest(target.media_ids) WITH ORDINALITY AS m(media_id, ordinal)
    GROUP BY m.media_id
  ) AS ordered;

  legacy_revision := 'work-revision-' || md5('legacy-revision:' || target.id);
  published := COALESCE(target.first_published_at, target.updated_at);
  SELECT COALESCE(max(r.sequence), 0) + 1 INTO next_sequence
  FROM community.work_revisions r
  WHERE r.work_id = target.id;

  INSERT INTO community.work_revisions (
    id, work_id, author_id, sequence, origin, title, body, authorship_kind,
    requested_visibility, cover_item_id, content_sha256, disposition,
    submitted_at, decided_at
  )
  VALUES (
    legacy_revision,
    target.id,
    target.author_id,
    next_sequence,
    'legacy',
    target.title,
    target.text,
    NULL,
    'public',
    legacy_cover,
    community.work_content_sha256(
      target.title, target.text, NULL, NULL, NULL, NULL,
      COALESCE(legacy_items, '[]'::jsonb), legacy_cover, NULL
    ),
    'approved',
    published,
    published
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO community.work_revision_items (revision_id, position, item_id, edit)
  SELECT
    legacy_revision,
    row_number() OVER (ORDER BY min(m.ordinal)),
    'media-item-' || md5('legacy-media:' || m.media_id),
    '{"rotation":0,"crop":null}'::jsonb
  FROM unnest(target.media_ids) WITH ORDINALITY AS m(media_id, ordinal)
  GROUP BY m.media_id
  ON CONFLICT DO NOTHING;

  INSERT INTO community.media_item_refs (item_id, holder_kind, holder_id)
  SELECT i.item_id, 'revision', legacy_revision
  FROM community.work_revision_items i
  WHERE i.revision_id = legacy_revision
  ON CONFLICT DO NOTHING;

  -- version and updated_at stay unchanged: the insert is the only change.
  UPDATE community.works
  SET
    public_revision_id = legacy_revision,
    author_revision_id = legacy_revision,
    first_published_at = COALESCE(first_published_at, published),
    first_submitted_at = COALESCE(first_submitted_at, published)
  WHERE id = target.id;

  RETURN legacy_revision;
END
$$;

-- Legacy draft snapshots were mapped from Phase 4 edit drafts, which had no
-- authorship either.
UPDATE community.work_draft_snapshots
SET content = jsonb_set(content, '{authorship}', 'null'::jsonb)
WHERE kind = 'legacy_draft'
  AND content ? 'authorship'
  AND content -> 'authorship' <> 'null'::jsonb;

-- Opening an edit draft of a legacy baseline seeded its content with
-- `{"kind": "original"}`. Every save, restore and resolve replaces primary
-- draft content through one statement that raises the revision (a save of
-- unchanged content keeps it), and a draft's base revision never changes. So
-- an active primary edit draft still at revision 1 on a legacy base holds
-- exactly the seeded content, and a `saved` snapshot recorded at revision 1 of
-- a draft on a legacy base (an unchanged save, or the current edit kept before
-- a restore) holds that same content. Both lose the default; the draft hash is
-- the stored jsonb text hashed as the adapter hashes it, and revision and
-- updated_at stay unchanged (nothing the author wrote changes). Drafts at a
-- later revision, conflict copies and other snapshots hold content an author
-- saved, where a kept default cannot be told apart from a declaration, and
-- stay as they are.
UPDATE community.work_draft_snapshots s
SET content = jsonb_set(s.content, '{authorship}', 'null'::jsonb)
FROM community.work_drafts d
JOIN community.work_revisions r ON r.id = d.base_revision_id
WHERE s.draft_id = d.id
  AND s.owner_id = d.owner_id
  AND s.kind = 'saved'
  AND s.source_revision = 1
  AND d.conflict_of IS NULL
  AND r.origin = 'legacy'
  AND s.content -> 'authorship' = '{"kind": "original"}'::jsonb;

UPDATE community.work_drafts d
SET
  content = jsonb_set(d.content, '{authorship}', 'null'::jsonb),
  content_sha256 = encode(
    sha256(
      convert_to(jsonb_set(d.content, '{authorship}', 'null'::jsonb)::text, 'UTF8')
    ),
    'hex'
  )
FROM community.work_revisions r
WHERE r.id = d.base_revision_id
  AND r.origin = 'legacy'
  AND d.state = 'active'
  AND d.conflict_of IS NULL
  AND d.revision = 1
  AND d.content -> 'authorship' = '{"kind": "original"}'::jsonb;
