CREATE TABLE catalog_media (
  media_id VARCHAR(128) PRIMARY KEY,
  catalog_id VARCHAR(128) NOT NULL REFERENCES catalog_entries (catalog_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  is_representative BOOLEAN NOT NULL,
  kind TEXT NOT NULL,
  alt_text VARCHAR(2000) NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  object_key VARCHAR(2048) NOT NULL,
  CONSTRAINT catalog_media_media_id_valid CHECK (
    media_id <> ''
    AND media_id !~ '[[:space:]]'
  ),
  CONSTRAINT catalog_media_position_valid CHECK (position >= 0),
  CONSTRAINT catalog_media_catalog_position_unique UNIQUE (catalog_id, position),
  CONSTRAINT catalog_media_kind_valid CHECK (kind = 'image'),
  CONSTRAINT catalog_media_alt_text_valid CHECK (
    alt_text <> '' AND alt_text = BTRIM(alt_text)
  ),
  CONSTRAINT catalog_media_width_valid CHECK (width > 0),
  CONSTRAINT catalog_media_height_valid CHECK (height > 0),
  CONSTRAINT catalog_media_object_key_valid CHECK (
    object_key <> '' AND object_key = BTRIM(object_key)
  )
);

CREATE UNIQUE INDEX catalog_media_one_representative_per_catalog
  ON catalog_media (catalog_id)
  WHERE is_representative;
