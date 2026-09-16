-- data-admin-hardening-v1: indexes for access patterns that sequentially scanned
-- (measured on a synthetic dataset with EXPLAIN ANALYZE; see the task record).
-- Forward-only; no data change; each index serves an existing runtime statement.

-- Followers side of community.follows. The primary key (follower_id, followed_id)
-- serves the "following" list only; the followers list, its total and the
-- profile followers count filter by followed_id and order by created_at DESC.
CREATE INDEX follows_followed_idx
  ON community.follows (followed_id, created_at DESC, follower_id DESC);

-- Draft readiness and single job probes look up a subject's non-succeeded
-- derive jobs by (kind, subject_id); only queued/running rows had an index.
-- Succeeded rows (the bulk of the table after a week) are excluded.
CREATE INDEX publishing_jobs_open_subject_idx
  ON community.publishing_jobs (kind, subject_id)
  WHERE state <> 'succeeded';

-- Discovery sequence expiry runs before every first-page browse and selects
-- the oldest sequences by created_at; the table had only its primary key.
CREATE INDEX discovery_sequences_created_idx
  ON community.discovery_sequences (created_at, id);
