-- Existing ids, roots and reply relationships survive the Phase 4 extension.
ALTER TABLE community.catalog_comments
  ADD COLUMN target_type TEXT NOT NULL DEFAULT 'catalog' CHECK (target_type IN ('catalog','work')),
  ADD COLUMN body_deleted_at TIMESTAMPTZ,
  ADD COLUMN thread_removed_at TIMESTAMPTZ,
  ADD COLUMN was_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE community.catalog_comment_replies
  ADD COLUMN body_deleted_at TIMESTAMPTZ,
  ADD COLUMN was_public BOOLEAN NOT NULL DEFAULT FALSE;
-- Historical publication cannot be inferred for every hidden reply. Conservatively
-- remember current public visibility; all later transitions are recorded below.
UPDATE community.catalog_comments SET was_public=TRUE WHERE moderation='visible';
UPDATE community.catalog_comment_replies r SET was_public=TRUE WHERE moderation='visible' AND EXISTS (
 SELECT 1 FROM community.catalog_comments c WHERE c.id=r.root_comment_id AND c.moderation='visible');
CREATE FUNCTION community.remember_root_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.moderation='visible' AND NEW.body_deleted_at IS NULL AND NEW.thread_removed_at IS NULL THEN NEW.was_public:=TRUE; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER remember_root_publication BEFORE INSERT OR UPDATE ON community.catalog_comments
 FOR EACH ROW EXECUTE FUNCTION community.remember_root_publication();
CREATE FUNCTION community.remember_reply_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.moderation='visible' AND NEW.body_deleted_at IS NULL AND EXISTS(
  SELECT 1 FROM community.catalog_comments c WHERE c.id=NEW.root_comment_id AND c.moderation='visible' AND c.thread_removed_at IS NULL)
 THEN NEW.was_public:=TRUE; ELSE NEW.was_public:=COALESCE(OLD.was_public,FALSE); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER remember_reply_publication BEFORE INSERT OR UPDATE ON community.catalog_comment_replies
 FOR EACH ROW EXECUTE FUNCTION community.remember_reply_publication();
CREATE FUNCTION community.remember_thread_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.moderation='visible' AND NEW.thread_removed_at IS NULL THEN
  UPDATE community.catalog_comment_replies SET was_public=TRUE WHERE root_comment_id=NEW.id AND moderation='visible' AND body_deleted_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER remember_thread_publication AFTER UPDATE OF moderation ON community.catalog_comments
 FOR EACH ROW EXECUTE FUNCTION community.remember_thread_publication();
CREATE INDEX discussion_target_order ON community.catalog_comments(target_type,catalog_id,created_at DESC,id DESC) WHERE thread_removed_at IS NULL;
CREATE TABLE community.comment_likes (
  comment_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES community.public_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(comment_id,user_id)
);
ALTER TABLE community.moderation_events DROP CONSTRAINT moderation_events_action_valid;
ALTER TABLE community.moderation_events ADD CONSTRAINT moderation_events_action_valid CHECK (
  action IN ('approve','hide','unhide','reject','suspend','reinstate','set_publication_policy','delete_body','remove_thread'));
CREATE TABLE community.discussion_command_receipts (
  actor_label TEXT NOT NULL,
  request_id UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  result JSONB NOT NULL,
  PRIMARY KEY(actor_label,request_id)
);
