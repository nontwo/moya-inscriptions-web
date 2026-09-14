-- work-publishing-v1 (Owner instruction 2026-09-13, design §9.2): works that
-- are still written outside the publishing path (Phase 4 seed scripts and
-- test fixtures insert community.works rows directly) receive the same
-- deterministic legacy revision as the backfill, so they stay publicly
-- visible through community.work_is_public and consistent with revision
-- reads. Also the one SQL definition of a media edit key and of the
-- derivatives an edited item needs. Forward-only: earlier files and their
-- ledger rows stay untouched; nothing in user_media, Catalog or avatar data is
-- rewritten.

-- The opaque key of one edit and optional cover crop: 'base' for the identity
-- edit (rotation 0, no crop) without a cover crop, otherwise the first 32 hex
-- characters of the SHA-256 of the canonical jsonb text of
-- [{"crop": crop, "rotation": rotation}, cover_crop]. Stored edits and cover
-- crops are the JSON the Backend wrote, so equal edits have equal text.
-- Computed only in SQL; callers and the processor treat the result as opaque.
CREATE FUNCTION community.media_edit_key(edit JSONB, cover_crop JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN COALESCE((edit ->> 'rotation')::integer, 0) = 0
      AND COALESCE(jsonb_typeof(edit -> 'crop'), 'null') = 'null'
      AND COALESCE(jsonb_typeof(cover_crop), 'null') = 'null'
      THEN 'base'
    ELSE left(
      encode(
        sha256(
          convert_to(
            jsonb_build_array(
              jsonb_build_object(
                'rotation', COALESCE(edit -> 'rotation', '0'::jsonb),
                'crop', COALESCE(edit -> 'crop', 'null'::jsonb)
              ),
              COALESCE(cover_crop, 'null'::jsonb)
            )::text,
            'UTF8'
          )
        ),
        'hex'
      ),
      32
    )
  END
$$;

-- Every derivative an item needs for one edit: display and full (and motion
-- for a Live item) use media_edit_key(edit, NULL); thumb uses the same key,
-- except for the work's cover item, whose thumb and cover use
-- media_edit_key(edit, cover_crop). A legacy item never has 'base'
-- derivatives (its unedited Phase 4 PNG is served from user media); callers
-- skip those rows for it and derive its edited keys from the PNG bytes like
-- any other item.
CREATE FUNCTION community.media_required_derivatives(
  kind TEXT,
  edit JSONB,
  is_cover BOOLEAN,
  cover_crop JSONB
)
RETURNS TABLE (variant TEXT, edit_key TEXT)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT
    v.name,
    CASE
      WHEN is_cover AND v.name IN ('thumb', 'cover')
        THEN community.media_edit_key(edit, cover_crop)
      ELSE community.media_edit_key(edit, NULL)
    END
  FROM unnest(
    ARRAY['thumb', 'display', 'full']
    || CASE WHEN kind = 'live' THEN ARRAY['motion'] ELSE ARRAY[]::text[] END
    || CASE WHEN is_cover THEN ARRAY['cover'] ELSE ARRAY[]::text[] END
  ) AS v(name)
$$;

-- The legacy baseline of one work, with exactly the backfill mapping: one
-- ready legacy item per distinct (owner, user_media) id, the revision with
-- items in first-occurrence order and the first item as cover, revision refs,
-- and the revision as both public and author revision. A legacy row without a
-- first publication time is treated as published when it was last updated.
-- Returns the public revision id; NULL for an unknown or deleted work and for
-- a work that already has an author revision but is not public. Media not
-- owned by the work author refuses the whole statement, as the backfill does.
-- A legacy item of the same user media that was cancelled or purged (its
-- earlier works were purged) is revived as ready with its stale derivative
-- rows removed, so a new work never names a purged item; its user media row
-- was never touched.
CREATE FUNCTION community.ensure_legacy_work_revision(target_work_id TEXT)
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
    'original',
    'public',
    legacy_cover,
    community.work_content_sha256(
      target.title, target.text, 'original', NULL, NULL, NULL,
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

CREATE FUNCTION community.works_legacy_bridge()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM community.ensure_legacy_work_revision(NEW.id);
  RETURN NULL;
END
$$;

-- Direct legacy inserts only: the publishing path writes created_via
-- 'publishing' and its own revisions.
CREATE TRIGGER works_legacy_bridge
  AFTER INSERT ON community.works
  FOR EACH ROW
  WHEN (
    NEW.created_via = 'legacy'
    AND NEW.public_revision_id IS NULL
    AND NEW.author_revision_id IS NULL
    AND NEW.deleted_at IS NULL
  )
  EXECUTE FUNCTION community.works_legacy_bridge();

-- Works written directly after the backfill ran and before this trigger
-- existed get the same baseline now. The trigger above already holds a lock
-- that blocks concurrent work writes until this migration commits.
LOCK TABLE community.user_media IN SHARE MODE;
SELECT community.ensure_legacy_work_revision(w.id)
FROM community.works w
WHERE w.created_via = 'legacy'
  AND w.public_revision_id IS NULL
  AND w.author_revision_id IS NULL
  AND w.deleted_at IS NULL
ORDER BY w.id;
