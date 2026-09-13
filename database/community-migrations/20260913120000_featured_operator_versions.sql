ALTER TABLE community.featured_content ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE community.featured_settings ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
