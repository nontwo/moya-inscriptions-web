-- Development App role after Phase 4 and work-publishing community migrations.
-- Apply explicitly as the setup/migration role; never from Backend startup.
-- The caller creates a non-owner NOSUPERUSER NOBYPASSRLS role first.
-- psql variable app_role is an identifier, not credential material.
-- Only runtime statements and invoker-trigger columns are granted. No DDL,
-- TRUNCATE, ownership, default privileges or ledger/audit UPDATE/DELETE.
-- The Backend, authenticated operator bridge and worker share this SQL role;
-- public-user and Payload/operator authentication remain separate boundaries.

GRANT USAGE ON SCHEMA public, community TO :"app_role";

-- Convergence of an earlier, broader grant path. A role that was first set up by
-- infra/development/grant-community-app.sql (Mission 2A/2B: table-level UPDATE on
-- sessions, both comment tables and publication_setting) or by a private Phase 4
-- plan keeps those table-level privileges, because GRANT only adds and the
-- column lists below never narrow a table-level grant. Revoke exactly the
-- table-level privileges this plan grants at column level, then grant the
-- columns again below in this same run: PostgreSQL drops the column-level
-- entries together with the table-level one, so the re-grant is required.
-- Revoking an absent privilege is a no-op, so repeated application converges
-- to the same effective set. Nothing else is revoked here; any other residue on
-- a retained role is listed for an Owner decision, never removed blindly.
REVOKE UPDATE ON TABLE
  community.public_users,
  community.sessions,
  community.catalog_comments,
  community.catalog_comment_replies,
  community.publication_setting,
  community.featured_users,
  community.featured_content,
  community.featured_settings,
  community.works,
  community.work_revisions,
  community.work_drafts,
  community.work_draft_snapshots,
  community.publishing_sessions,
  community.work_publishing_settings,
  community.account_publishing_capacity,
  community.daily_new_work_submissions,
  community.media_items,
  community.media_components,
  community.media_blobs,
  community.publishing_jobs,
  community.agent_principals,
  community.agent_delegations,
  community.agent_operations
FROM :"app_role";
REVOKE INSERT ON TABLE
  community.author_events,
  community.content_operator_events,
  community.featured_users,
  community.featured_content
FROM :"app_role";

-- Discovery and the featured operator read published Catalog projections only.
GRANT SELECT ON TABLE public.catalog_discovery, public.catalog_media TO :"app_role";

-- Startup readiness verifies the community ledger read-only.
GRANT SELECT ON TABLE community.schema_migrations TO :"app_role";

-- Identity, sessions and development sign-in.
GRANT SELECT ON TABLE community.public_users, community.development_accounts TO :"app_role";
GRANT UPDATE (
  display_name, bio, status, updated_at,
  following_privacy, followers_privacy, favorites_privacy, likes_privacy,
  avatar_media_id, avatar_changed_on
) ON TABLE community.public_users TO :"app_role";
GRANT SELECT, INSERT ON TABLE community.sessions TO :"app_role";
GRANT UPDATE (revoked_at) ON TABLE community.sessions TO :"app_role";

-- Discussion, likes, moderation and receipts.
GRANT SELECT, INSERT ON TABLE
  community.catalog_comments, community.catalog_comment_replies
TO :"app_role";
GRANT UPDATE (
  moderation, moderated_by, moderated_at, body_deleted_at, thread_removed_at
) ON TABLE community.catalog_comments TO :"app_role";
-- was_public is written by the remember_thread_publication trigger (invoker).
GRANT UPDATE (
  moderation, moderated_by, moderated_at, body_deleted_at, was_public
) ON TABLE community.catalog_comment_replies TO :"app_role";
GRANT SELECT, INSERT, DELETE ON TABLE community.comment_likes TO :"app_role";
GRANT SELECT, INSERT ON TABLE community.discussion_command_receipts TO :"app_role";
GRANT SELECT ON TABLE community.publication_setting TO :"app_role";
GRANT UPDATE (policy, updated_by, updated_at) ON TABLE community.publication_setting TO :"app_role";
GRANT SELECT, INSERT ON TABLE community.moderation_events TO :"app_role";

-- Author community: relations, blocks, favorites, legacy PNG media, receipts.
GRANT SELECT, INSERT, DELETE ON TABLE
  community.follows, community.blocks, community.content_relations
TO :"app_role";
GRANT SELECT, INSERT ON TABLE community.user_media, community.author_command_receipts TO :"app_role";
GRANT INSERT (id, actor_id, action, subject_id, occurred_at) ON TABLE community.author_events TO :"app_role";

-- Featured content and discovery sequences.
GRANT SELECT ON TABLE community.featured_users TO :"app_role";
GRANT INSERT (user_id, enabled) ON TABLE community.featured_users TO :"app_role";
GRANT UPDATE (enabled, version) ON TABLE community.featured_users TO :"app_role";
GRANT SELECT ON TABLE community.featured_content, community.featured_settings TO :"app_role";
GRANT INSERT (content_type, content_id, enabled, position) ON TABLE community.featured_content TO :"app_role";
GRANT UPDATE (enabled, position, version) ON TABLE community.featured_content TO :"app_role";
GRANT UPDATE (enabled_quantity, version) ON TABLE community.featured_settings TO :"app_role";
-- Expired sequence deletion cascades to items through the existing foreign key.
GRANT SELECT, INSERT, DELETE ON TABLE community.discovery_sequences TO :"app_role";
GRANT SELECT, INSERT ON TABLE community.discovery_sequence_items TO :"app_role";
GRANT INSERT (id, operator_label, action, content_type, content_id, occurred_at, detail)
ON TABLE community.content_operator_events TO :"app_role";
GRANT SELECT, INSERT ON TABLE community.content_operator_receipts TO :"app_role";

-- Works and revisions (publishing submissions, visibility, trash, moderation).
GRANT SELECT, INSERT ON TABLE community.works TO :"app_role";
GRANT UPDATE (
  title, text, version, updated_at, deleted_at, operator_state,
  public_revision_id, author_revision_id, visibility, first_published_at,
  edited_at, trashed_at, trash_purge_after
) ON TABLE community.works TO :"app_role";
GRANT SELECT, INSERT ON TABLE community.work_revisions, community.work_revision_items TO :"app_role";
GRANT UPDATE (disposition, decided_at, decided_by, version) ON TABLE community.work_revisions TO :"app_role";

-- Publishing drafts, snapshots and sessions (drafts/snapshots are deleted by cleanup).
GRANT SELECT, INSERT, DELETE ON TABLE community.work_drafts, community.work_draft_snapshots TO :"app_role";
GRANT UPDATE (
  content, content_sha256, revision, device_class, state, submitted_at,
  resolved_at, updated_at, work_id
) ON TABLE community.work_drafts TO :"app_role";
GRANT UPDATE (content, work_id, kind, pinned, source_revision, created_at) ON TABLE community.work_draft_snapshots TO :"app_role";
GRANT SELECT, INSERT ON TABLE community.publishing_sessions TO :"app_role";
GRANT UPDATE (state, ended_at, lease_expires_at, draft_id) ON TABLE community.publishing_sessions TO :"app_role";

-- Settings, capacity and daily limits.
GRANT SELECT ON TABLE community.work_publishing_settings TO :"app_role";
GRANT UPDATE (
  publication_policy, max_items_per_work, original_item_max_bytes,
  standard_component_max_bytes, ordinary_account_capacity_bytes,
  owner_account_capacity_bytes, max_active_drafts, daily_new_work_limit,
  history_limit, trash_retention_days, orphan_grace_days,
  unsaved_session_lease_minutes, version, updated_at, updated_by
) ON TABLE community.work_publishing_settings TO :"app_role";
GRANT SELECT, INSERT ON TABLE community.account_publishing_capacity TO :"app_role";
GRANT UPDATE (capacity_class, committed_bytes, reserved_bytes, version, updated_at)
ON TABLE community.account_publishing_capacity TO :"app_role";
GRANT SELECT, INSERT ON TABLE community.daily_new_work_submissions TO :"app_role";
GRANT UPDATE (count) ON TABLE community.daily_new_work_submissions TO :"app_role";

-- Media items, components, blobs, derivatives, references and jobs.
GRANT SELECT, INSERT ON TABLE community.media_items TO :"app_role";
GRANT UPDATE (
  state, failure_code, cancelled_at, purged_at, ready_at, received_total_bytes,
  presentation, pairing, private_metadata, updated_at, version
) ON TABLE community.media_items TO :"app_role";
GRANT SELECT, INSERT ON TABLE community.media_components TO :"app_role";
GRANT UPDATE (
  state, upload_attempt, received_bytes, reserved_bytes, sha256, blob_id,
  detected_type, updated_at
) ON TABLE community.media_components TO :"app_role";
GRANT SELECT, INSERT ON TABLE community.media_blobs TO :"app_role";
GRANT UPDATE (state, tombstoned_at, purged_at) ON TABLE community.media_blobs TO :"app_role";
GRANT SELECT, INSERT, DELETE ON TABLE community.media_derivatives, community.media_item_refs TO :"app_role";
GRANT SELECT, INSERT, DELETE ON TABLE community.publishing_jobs TO :"app_role";
GRANT UPDATE (
  state, attempts, run_after, lease_owner, lease_expires_at, last_error_code,
  finished_at, updated_at
) ON TABLE community.publishing_jobs TO :"app_role";

-- SQL functions the adapters call (EXECUTE is also the PostgreSQL default for
-- PUBLIC; granted explicitly so the plan stays correct if that default is revoked).
GRANT EXECUTE ON FUNCTION
  community.accounts_can_interact(TEXT, TEXT),
  community.work_is_public(community.works),
  community.media_edit_key(JSONB, JSONB),
  community.media_required_derivatives(TEXT, JSONB, BOOLEAN, JSONB),
  community.work_content_sha256(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, JSONB)
TO :"app_role";

-- Agent administration (Issue #141 r3, Phase B): principals, delegations and
-- durable prepared operations. Targets are frozen at preparation (no UPDATE
-- on targets, kind, action, fingerprint or request_id); only lifecycle
-- columns change. Nothing is ever deleted.
GRANT SELECT, INSERT ON TABLE
  community.agent_principals, community.agent_delegations, community.agent_operations
TO :"app_role";
GRANT UPDATE (display_name, scopes, enabled, version, updated_at, revoked_at)
ON TABLE community.agent_principals TO :"app_role";
GRANT UPDATE (revoked_at, revoked_by) ON TABLE community.agent_delegations TO :"app_role";
GRANT UPDATE (
  state, approval, next_index, results, lease_owner, lease_expires_at, version,
  approved_at, started_at, finished_at, cancel_requested_at
) ON TABLE community.agent_operations TO :"app_role";
