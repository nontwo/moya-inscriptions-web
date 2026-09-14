-- work-publishing-v1 (Owner instruction 2026-09-13): the independent work
-- publishing settings, account capacity, daily new-work counters, private
-- media manifests and the durable publishing job queue. Media bytes live in
-- the private filesystem store; PostgreSQL holds identity, manifests,
-- reservations and state only. Forward-only: earlier files and their ledger
-- rows stay untouched, and nothing in user_media, Catalog or avatar data is
-- rewritten.

-- Exactly one row. Fresh initialization inserts the defaults; a policy or
-- limit the Owner has already saved through the operator boundary is never
-- reset. Independent of community.publication_setting (comments).
CREATE TABLE community.work_publishing_settings (
  id TEXT PRIMARY KEY DEFAULT 'settings',
  publication_policy TEXT NOT NULL DEFAULT 'DIRECT_PUBLICATION',
  max_items_per_work INTEGER NOT NULL DEFAULT 50,
  original_item_max_bytes BIGINT NOT NULL DEFAULT 134217728,
  standard_component_max_bytes BIGINT NOT NULL DEFAULT 268435456,
  ordinary_account_capacity_bytes BIGINT NOT NULL DEFAULT 10737418240,
  owner_account_capacity_bytes BIGINT NOT NULL DEFAULT 21474836480,
  max_active_drafts INTEGER NOT NULL DEFAULT 100,
  daily_new_work_limit INTEGER NOT NULL DEFAULT 100,
  history_limit INTEGER NOT NULL DEFAULT 20,
  trash_retention_days INTEGER NOT NULL DEFAULT 30,
  orphan_grace_days INTEGER NOT NULL DEFAULT 7,
  unsaved_session_lease_minutes INTEGER NOT NULL DEFAULT 360,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL DEFAULT 'platform',
  CONSTRAINT work_publishing_settings_single_row CHECK (id = 'settings'),
  CONSTRAINT work_publishing_settings_policy_valid CHECK (
    publication_policy IN ('PRE_MODERATION', 'DIRECT_PUBLICATION')
  ),
  -- Revision item positions are bounded at 500.
  CONSTRAINT work_publishing_settings_items_bounded CHECK (
    max_items_per_work BETWEEN 1 AND 500
  ),
  CONSTRAINT work_publishing_settings_bytes_positive CHECK (
    original_item_max_bytes > 0
    AND standard_component_max_bytes > 0
    AND ordinary_account_capacity_bytes > 0
    AND owner_account_capacity_bytes > 0
  ),
  CONSTRAINT work_publishing_settings_counts_positive CHECK (
    max_active_drafts > 0
    AND daily_new_work_limit > 0
    AND history_limit > 0
    AND trash_retention_days > 0
    AND orphan_grace_days > 0
    AND unsaved_session_lease_minutes > 0
  ),
  CONSTRAINT work_publishing_settings_version_positive CHECK (version > 0),
  CONSTRAINT work_publishing_settings_operator_bounded CHECK (
    updated_by ~ '^[a-z][a-z0-9-]{0,63}$'
  )
);

INSERT INTO community.work_publishing_settings (id, updated_by)
VALUES ('settings', 'platform')
ON CONFLICT (id) DO NOTHING;

-- Created lazily by the Backend on first use. The Owner capacity class is an
-- audited operator designation on the immutable PublicUserId, never derived
-- from a handle, display name or client claim.
CREATE TABLE community.account_publishing_capacity (
  account_id TEXT PRIMARY KEY REFERENCES community.public_users (id),
  capacity_class TEXT NOT NULL DEFAULT 'ordinary',
  committed_bytes BIGINT NOT NULL DEFAULT 0,
  reserved_bytes BIGINT NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT account_publishing_capacity_class_valid CHECK (
    capacity_class IN ('ordinary', 'owner')
  ),
  CONSTRAINT account_publishing_capacity_committed_nonnegative CHECK (
    committed_bytes >= 0
  ),
  CONSTRAINT account_publishing_capacity_reserved_nonnegative CHECK (
    reserved_bytes >= 0
  ),
  CONSTRAINT account_publishing_capacity_version_positive CHECK (version > 0)
);

-- First successful new-work submissions per America/New_York calendar date.
CREATE TABLE community.daily_new_work_submissions (
  account_id TEXT NOT NULL REFERENCES community.public_users (id),
  ny_date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, ny_date),
  CONSTRAINT daily_new_work_submissions_count_nonnegative CHECK (count >= 0)
);

-- One logical media item: a static image or a complete Live Photo. Legacy
-- items wrap an existing user_media PNG in place; its bytes stay where they are.
CREATE TABLE community.media_items (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES community.public_users (id),
  kind TEXT NOT NULL,
  quality_mode TEXT NOT NULL,
  source TEXT NOT NULL,
  legacy_media_id TEXT,
  state TEXT NOT NULL DEFAULT 'awaiting_upload',
  failure_code TEXT,
  declared_total_bytes BIGINT NOT NULL DEFAULT 0,
  received_total_bytes BIGINT NOT NULL DEFAULT 0,
  pairing JSONB,
  presentation JSONB,
  private_metadata JSONB,
  processing_profile TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ready_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  purged_at TIMESTAMPTZ,
  CONSTRAINT media_items_id_opaque CHECK (id ~ '^media-item-[0-9a-f]{32}$'),
  CONSTRAINT media_items_id_owner_unique UNIQUE (id, owner_id),
  CONSTRAINT media_items_kind_valid CHECK (kind IN ('static', 'live')),
  CONSTRAINT media_items_quality_mode_valid CHECK (
    quality_mode IN ('standard', 'original', 'legacy')
  ),
  CONSTRAINT media_items_source_valid CHECK (
    source IN ('upload', 'legacy_user_media')
  ),
  CONSTRAINT media_items_legacy_source_consistent CHECK (
    (source = 'legacy_user_media') = (legacy_media_id IS NOT NULL)
    AND (source = 'legacy_user_media') = (quality_mode = 'legacy')
  ),
  CONSTRAINT media_items_legacy_media_owned FOREIGN KEY (legacy_media_id, owner_id)
    REFERENCES community.user_media (id, owner_id),
  CONSTRAINT media_items_state_valid CHECK (
    state IN (
      'awaiting_upload', 'processing', 'ready', 'failed', 'cancelled', 'purged'
    )
  ),
  -- Content-free code only; never a message, filename or path.
  CONSTRAINT media_items_failure_code_bounded CHECK (
    failure_code IS NULL OR failure_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  CONSTRAINT media_items_bytes_nonnegative CHECK (
    declared_total_bytes >= 0 AND received_total_bytes >= 0
  ),
  CONSTRAINT media_items_pairing_valid CHECK (
    pairing IS NULL
    OR (
      jsonb_typeof(pairing) = 'object'
      AND COALESCE(pairing ->> 'method', '') IN (
        'apple-content-identifier', 'motion-photo-container', 'none'
      )
      AND COALESCE(pairing ->> 'verifiedBy', '') IN ('server', 'client')
    )
  ),
  CONSTRAINT media_items_presentation_object CHECK (
    presentation IS NULL OR jsonb_typeof(presentation) = 'object'
  ),
  -- The contract bounds the JSON.stringify form at 16 KiB. jsonb text adds
  -- separator spaces and writes exponent numbers out in full (5e-324 becomes
  -- 326 characters), so this is only a coarse storage cap: the worst
  -- contract-valid value, 16 KiB of such numbers, is about 734 KiB here.
  CONSTRAINT media_items_private_metadata_bounded CHECK (
    private_metadata IS NULL
    OR (
      jsonb_typeof(private_metadata) = 'object'
      AND octet_length(private_metadata::text) <= 1048576
    )
  ),
  CONSTRAINT media_items_processing_profile_bounded CHECK (
    processing_profile IS NULL
    OR processing_profile ~ '^[a-z][a-z0-9-]{0,63}$'
  ),
  CONSTRAINT media_items_version_positive CHECK (version > 0)
);

CREATE INDEX media_items_owner_state_idx
  ON community.media_items (owner_id, state);
CREATE UNIQUE INDEX media_items_legacy_media_unique
  ON community.media_items (owner_id, legacy_media_id)
  WHERE legacy_media_id IS NOT NULL;

-- Physically retained private bytes. Capacity counts each committed blob once.
CREATE TABLE community.media_blobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES community.public_users (id),
  purpose TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  content_type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'committed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tombstoned_at TIMESTAMPTZ,
  purged_at TIMESTAMPTZ,
  CONSTRAINT media_blobs_id_opaque CHECK (id ~ '^media-blob-[0-9a-f]{32}$'),
  CONSTRAINT media_blobs_id_owner_unique UNIQUE (id, owner_id),
  CONSTRAINT media_blobs_purpose_valid CHECK (
    purpose IN ('original', 'standard_master', 'derivative')
  ),
  CONSTRAINT media_blobs_storage_key_unique UNIQUE (storage_key),
  CONSTRAINT media_blobs_storage_key_sanitized CHECK (
    storage_key ~ '^blobs/[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{32}$'
  ),
  CONSTRAINT media_blobs_byte_size_positive CHECK (byte_size > 0),
  CONSTRAINT media_blobs_sha256_valid CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT media_blobs_content_type_bounded CHECK (
    content_type ~ '^[a-z]+/[a-z0-9.+-]{1,64}$'
  ),
  CONSTRAINT media_blobs_state_valid CHECK (
    state IN ('committed', 'tombstoned', 'purged')
  )
);

CREATE INDEX media_blobs_owner_state_idx
  ON community.media_blobs (owner_id, state);

-- Separately uploaded components of one item (still, motion or a container
-- package). Each role occurs at most once per item.
CREATE TABLE community.media_components (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  role TEXT NOT NULL,
  declared_bytes BIGINT NOT NULL,
  declared_type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'awaiting',
  upload_attempt UUID,
  received_bytes BIGINT NOT NULL DEFAULT 0,
  sha256 TEXT,
  detected_type TEXT,
  blob_id TEXT,
  reserved_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT media_components_id_opaque CHECK (
    id ~ '^media-component-[0-9a-f]{32}$'
  ),
  CONSTRAINT media_components_item_owned FOREIGN KEY (item_id, owner_id)
    REFERENCES community.media_items (id, owner_id),
  CONSTRAINT media_components_blob_owned FOREIGN KEY (blob_id, owner_id)
    REFERENCES community.media_blobs (id, owner_id),
  CONSTRAINT media_components_item_role_unique UNIQUE (item_id, role),
  CONSTRAINT media_components_role_valid CHECK (
    role IN ('still', 'motion', 'package')
  ),
  CONSTRAINT media_components_declared_bytes_positive CHECK (declared_bytes > 0),
  CONSTRAINT media_components_declared_type_valid CHECK (
    declared_type IN (
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'video/quicktime', 'video/mp4'
    )
  ),
  CONSTRAINT media_components_state_valid CHECK (
    state IN (
      'awaiting', 'receiving', 'received', 'verified', 'rejected', 'cancelled'
    )
  ),
  CONSTRAINT media_components_received_bounded CHECK (
    received_bytes BETWEEN 0 AND declared_bytes
  ),
  CONSTRAINT media_components_sha256_valid CHECK (
    sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT media_components_detected_type_bounded CHECK (
    detected_type IS NULL OR detected_type ~ '^[a-z]+/[a-z0-9.+-]{1,64}$'
  ),
  CONSTRAINT media_components_reserved_nonnegative CHECK (reserved_bytes >= 0)
);

CREATE INDEX media_components_blob_idx
  ON community.media_components (blob_id)
  WHERE blob_id IS NOT NULL;

-- Server derivatives per item, variant and edit ('base' or a 32-hex edit key).
CREATE TABLE community.media_derivatives (
  item_id TEXT NOT NULL REFERENCES community.media_items (id),
  variant TEXT NOT NULL,
  edit_key TEXT NOT NULL,
  blob_id TEXT NOT NULL REFERENCES community.media_blobs (id),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  duration_ms INTEGER,
  content_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, variant, edit_key),
  CONSTRAINT media_derivatives_variant_valid CHECK (
    variant IN ('thumb', 'display', 'full', 'motion', 'cover')
  ),
  CONSTRAINT media_derivatives_edit_key_valid CHECK (
    edit_key = 'base' OR edit_key ~ '^[0-9a-f]{32}$'
  ),
  CONSTRAINT media_derivatives_dimensions_bounded CHECK (
    width BETWEEN 1 AND 16384 AND height BETWEEN 1 AND 16384
  ),
  CONSTRAINT media_derivatives_duration_positive CHECK (
    duration_ms IS NULL OR duration_ms > 0
  ),
  CONSTRAINT media_derivatives_content_type_bounded CHECK (
    content_type ~ '^[a-z]+/[a-z0-9.+-]{1,64}$'
  )
);

CREATE INDEX media_derivatives_blob_idx
  ON community.media_derivatives (blob_id);

-- Reference accounting for cleanup: removing an association never deletes a
-- blob while any draft, revision, snapshot or session still holds the item.
CREATE TABLE community.media_item_refs (
  item_id TEXT NOT NULL REFERENCES community.media_items (id),
  holder_kind TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  PRIMARY KEY (item_id, holder_kind, holder_id),
  CONSTRAINT media_item_refs_holder_valid CHECK (
    (holder_kind = 'draft' AND holder_id ~ '^work-draft-[0-9a-f]{32}$')
    OR (holder_kind = 'revision' AND holder_id ~ '^work-revision-[0-9a-f]{32}$')
    OR (holder_kind = 'snapshot' AND holder_id ~ '^work-snapshot-[0-9a-f]{32}$')
    OR (
      holder_kind = 'session'
      AND holder_id ~ '^publishing-session-[0-9a-f]{32}$'
    )
  )
);

CREATE INDEX media_item_refs_holder_idx
  ON community.media_item_refs (holder_kind, holder_id);

-- Durable, idempotent PostgreSQL job queue (no Redis). Payloads are
-- content-free; system retries are bounded by max_attempts.
CREATE TABLE community.publishing_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  payload JSONB,
  state TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ,
  CONSTRAINT publishing_jobs_id_opaque CHECK (
    id ~ '^publishing-job-[0-9a-f]{32}$'
  ),
  CONSTRAINT publishing_jobs_kind_valid CHECK (
    kind IN (
      'process_item', 'derive_edit', 'purge_item', 'purge_blob',
      'expire_session', 'purge_trashed_work', 'sweep_staging',
      'reconcile_capacity'
    )
  ),
  -- The operator job DTO format, so every stored job stays listable.
  CONSTRAINT publishing_jobs_subject_bounded CHECK (
    subject_id ~ '^[a-z0-9][a-z0-9-]{0,127}$'
  ),
  CONSTRAINT publishing_jobs_payload_bounded CHECK (
    payload IS NULL
    OR (
      jsonb_typeof(payload) = 'object'
      AND octet_length(payload::text) <= 8192
    )
  ),
  CONSTRAINT publishing_jobs_state_valid CHECK (
    state IN ('queued', 'running', 'succeeded', 'failed', 'abandoned')
  ),
  CONSTRAINT publishing_jobs_attempts_bounded CHECK (
    attempts >= 0 AND max_attempts BETWEEN 1 AND 1000
  ),
  CONSTRAINT publishing_jobs_running_leased CHECK (
    state <> 'running'
    OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT publishing_jobs_lease_owner_bounded CHECK (
    lease_owner IS NULL OR char_length(lease_owner) BETWEEN 1 AND 128
  ),
  CONSTRAINT publishing_jobs_error_code_bounded CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  )
);

-- At most one queued or running job per kind, subject and payload; a NULL
-- payload and an empty object are the same payload.
CREATE UNIQUE INDEX publishing_jobs_active_unique
  ON community.publishing_jobs (
    kind, subject_id, md5(COALESCE(payload, '{}'::jsonb)::text)
  )
  WHERE state IN ('queued', 'running');
CREATE INDEX publishing_jobs_claim_idx
  ON community.publishing_jobs (run_after, id)
  WHERE state = 'queued';
CREATE INDEX publishing_jobs_lease_idx
  ON community.publishing_jobs (lease_expires_at)
  WHERE state = 'running';
CREATE INDEX publishing_jobs_state_idx
  ON community.publishing_jobs (state, updated_at DESC, id DESC);
