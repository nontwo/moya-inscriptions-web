-- work-publishing-v1 (Owner instruction 2026-09-13): every existing
-- non-deleted work receives a deterministic legacy revision that becomes both
-- its public and its author revision, with legacy media items wrapping the
-- referenced user_media PNG rows in place. Unapplied, undiscarded Phase 4 edit
-- drafts become legacy_draft snapshots (pinned when conflicted). Deleted works
-- and applied or discarded drafts stay untouched. Nothing is deleted or moved
-- out of user_media; work, discussion, relation and draft rows keep their
-- identities, versions and timestamps. Identifiers derive from md5 of the
-- source id, so every statement is conflict-safe.
-- Forward-only: earlier files and their ledger rows stay untouched.

-- Every statement below reads one consistent source: a still-running Phase 4
-- Backend cannot apply or save a draft, change a work or remove media between
-- them. Plain reads continue while the backfill runs.
LOCK TABLE community.works IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE community.work_edit_drafts, community.user_media IN SHARE MODE;

-- Phase 4 accepted only media owned by the work author. Refuse to guess (and
-- roll the whole migration back) if any retained reference breaks that rule.
DO $$
BEGIN
  IF EXISTS (
    WITH referenced AS (
      SELECT w.author_id AS owner_id, m.media_id
      FROM community.works w
      CROSS JOIN LATERAL unnest(w.media_ids) AS m(media_id)
      WHERE w.deleted_at IS NULL
      UNION
      SELECT d.author_id, m.media_id
      FROM community.work_edit_drafts d
      JOIN community.works w
        ON w.id = d.work_id AND w.author_id = d.author_id
      CROSS JOIN LATERAL unnest(d.media_ids) AS m(media_id)
      WHERE w.deleted_at IS NULL
        AND d.applied_at IS NULL
        AND d.discarded_at IS NULL
    )
    SELECT 1
    FROM referenced r
    WHERE NOT EXISTS (
      SELECT 1
      FROM community.user_media um
      WHERE um.id = r.media_id AND um.owner_id = r.owner_id
    )
  ) THEN
    RAISE EXCEPTION 'legacy work media is not owned by the work author';
  END IF;
END $$;

-- One ready legacy item per distinct (owner, user_media) referenced by a
-- retained work or legacy draft. Shared media across works maps to one item.
WITH referenced AS (
  SELECT w.author_id AS owner_id, m.media_id
  FROM community.works w
  CROSS JOIN LATERAL unnest(w.media_ids) AS m(media_id)
  WHERE w.deleted_at IS NULL
  UNION
  SELECT d.author_id, m.media_id
  FROM community.work_edit_drafts d
  JOIN community.works w
    ON w.id = d.work_id AND w.author_id = d.author_id
  CROSS JOIN LATERAL unnest(d.media_ids) AS m(media_id)
  WHERE w.deleted_at IS NULL
    AND d.applied_at IS NULL
    AND d.discarded_at IS NULL
)
INSERT INTO community.media_items (
  id, owner_id, kind, quality_mode, source, legacy_media_id, state,
  declared_total_bytes, received_total_bytes, presentation,
  created_at, updated_at, ready_at
)
SELECT
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
FROM referenced r
JOIN community.user_media um
  ON um.id = r.media_id AND um.owner_id = r.owner_id
ON CONFLICT DO NOTHING;

-- The legacy baseline revision. Duplicate media ids within one work keep
-- their first position; the cover is the first item, as in Phase 4. Title and
-- body are copied exactly as stored, and content_sha256 comes from the one
-- community.work_content_sha256 definition.
WITH legacy_items AS (
  SELECT
    w.id AS work_id,
    'media-item-' || md5('legacy-media:' || m.media_id) AS item_id,
    row_number() OVER (PARTITION BY w.id ORDER BY min(m.ordinal)) AS position
  FROM community.works w
  CROSS JOIN LATERAL unnest(w.media_ids) WITH ORDINALITY AS m(media_id, ordinal)
  WHERE w.deleted_at IS NULL
  GROUP BY w.id, m.media_id
),
item_lists AS (
  SELECT
    work_id,
    jsonb_agg(
      jsonb_build_object(
        'itemId', item_id,
        'edit', '{"rotation":0,"crop":null}'::jsonb
      )
      ORDER BY position
    ) AS items,
    (array_agg(item_id ORDER BY position))[1] AS cover_item_id
  FROM legacy_items
  GROUP BY work_id
)
INSERT INTO community.work_revisions (
  id, work_id, author_id, sequence, origin, title, body, authorship_kind,
  requested_visibility, cover_item_id, content_sha256, disposition,
  submitted_at, decided_at
)
SELECT
  'work-revision-' || md5('legacy-revision:' || w.id),
  w.id,
  w.author_id,
  1,
  'legacy',
  w.title,
  w.text,
  'original',
  'public',
  l.cover_item_id,
  community.work_content_sha256(
    w.title, w.text, 'original', NULL, NULL, NULL,
    COALESCE(l.items, '[]'::jsonb), l.cover_item_id, NULL
  ),
  'approved',
  COALESCE(w.first_published_at, w.updated_at),
  COALESCE(w.first_published_at, w.updated_at)
FROM community.works w
LEFT JOIN item_lists l ON l.work_id = w.id
WHERE w.deleted_at IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO community.work_revision_items (revision_id, position, item_id, edit)
SELECT
  'work-revision-' || md5('legacy-revision:' || w.id),
  row_number() OVER (PARTITION BY w.id ORDER BY min(m.ordinal)),
  'media-item-' || md5('legacy-media:' || m.media_id),
  '{"rotation":0,"crop":null}'::jsonb
FROM community.works w
CROSS JOIN LATERAL unnest(w.media_ids) WITH ORDINALITY AS m(media_id, ordinal)
WHERE w.deleted_at IS NULL
GROUP BY w.id, m.media_id
ON CONFLICT DO NOTHING;

INSERT INTO community.media_item_refs (item_id, holder_kind, holder_id)
SELECT i.item_id, 'revision', i.revision_id
FROM community.work_revision_items i
JOIN community.work_revisions r ON r.id = i.revision_id
WHERE r.origin = 'legacy'
ON CONFLICT DO NOTHING;

-- The legacy revision is both the public and the author revision. version and
-- updated_at stay unchanged so pending Phase 4 edit drafts do not conflict.
UPDATE community.works w
SET
  public_revision_id = r.id,
  author_revision_id = r.id,
  created_via = 'legacy',
  first_submitted_at = COALESCE(w.first_submitted_at, r.submitted_at)
FROM community.work_revisions r
WHERE r.id = 'work-revision-' || md5('legacy-revision:' || w.id)
  AND r.work_id = w.id
  AND w.deleted_at IS NULL
  AND w.public_revision_id IS NULL
  AND w.author_revision_id IS NULL;

-- Unapplied, undiscarded Phase 4 edit drafts become recoverable snapshots in
-- the work's lineage, mapped onto the legacy items above. Conflicted drafts
-- are pinned so the history limit never evicts them.
WITH eligible AS (
  SELECT d.id, d.work_id, d.author_id, d.version, d.title, d.text,
    d.media_ids, d.conflicted, d.created_at, w.visibility
  FROM community.work_edit_drafts d
  JOIN community.works w
    ON w.id = d.work_id AND w.author_id = d.author_id
  WHERE w.deleted_at IS NULL
    AND d.applied_at IS NULL
    AND d.discarded_at IS NULL
),
draft_items AS (
  SELECT
    e.id AS draft_id,
    'media-item-' || md5('legacy-media:' || m.media_id) AS item_id,
    row_number() OVER (PARTITION BY e.id ORDER BY min(m.ordinal)) AS position
  FROM eligible e
  CROSS JOIN LATERAL unnest(e.media_ids) WITH ORDINALITY AS m(media_id, ordinal)
  GROUP BY e.id, m.media_id
),
item_lists AS (
  SELECT
    draft_id,
    jsonb_agg(
      jsonb_build_object(
        'key', item_id,
        'itemId', item_id,
        'kind', 'static',
        'qualityMode', 'legacy',
        'edit', '{"rotation":0,"crop":null}'::jsonb
      )
      ORDER BY position
    ) AS items,
    (array_agg(item_id ORDER BY position))[1] AS cover_key
  FROM draft_items
  GROUP BY draft_id
)
INSERT INTO community.work_draft_snapshots (
  id, owner_id, draft_id, work_id, kind, content, source_revision, pinned,
  created_at
)
SELECT
  'work-snapshot-' || md5('legacy-draft:' || e.id),
  e.author_id,
  NULL,
  e.work_id,
  'legacy_draft',
  jsonb_build_object(
    'title', e.title,
    'body', e.text,
    'authorship', jsonb_build_object('kind', 'original'),
    'visibility', e.visibility,
    'items', COALESCE(l.items, '[]'::jsonb),
    'coverKey', l.cover_key,
    'coverCrop', NULL::jsonb
  ),
  e.version,
  e.conflicted,
  e.created_at
FROM eligible e
LEFT JOIN item_lists l ON l.draft_id = e.id
ON CONFLICT DO NOTHING;

INSERT INTO community.media_item_refs (item_id, holder_kind, holder_id)
SELECT DISTINCT item ->> 'itemId', 'snapshot', s.id
FROM community.work_draft_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(s.content -> 'items') AS item
WHERE s.kind = 'legacy_draft'
  AND item ->> 'itemId' IS NOT NULL
ON CONFLICT DO NOTHING;
