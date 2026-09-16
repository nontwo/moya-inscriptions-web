-- Explicit per-work settings override inherited author recommendations.
-- No publication, author-content or session mutation occurs here.
CREATE TABLE community.featured_users (
  user_id text PRIMARY KEY REFERENCES community.public_users(id),
  enabled boolean NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
