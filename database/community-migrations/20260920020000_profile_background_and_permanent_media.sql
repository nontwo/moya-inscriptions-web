-- Additive support for the Owner's profile and permanent-delete feedback.
-- No existing content, historical trash or media is deleted by this migration.
ALTER TABLE community.public_users
  ADD COLUMN background_media_id TEXT;
ALTER TABLE community.public_users ADD CONSTRAINT background_owned
  FOREIGN KEY (background_media_id, id) REFERENCES community.user_media (id, owner_id);

-- A deleted legacy upload keeps an identity tombstone for receipts and foreign
-- keys. Its pixels are erased; it can never be read or attached again.
ALTER TABLE community.user_media
  ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE community.user_media
  DROP CONSTRAINT user_media_bytes_check;
ALTER TABLE community.user_media ADD CONSTRAINT user_media_live_bytes CHECK (
  (deleted_at IS NULL AND octet_length(bytes) BETWEEN 1 AND 4194304)
  OR (deleted_at IS NOT NULL AND octet_length(bytes) = 0)
);
