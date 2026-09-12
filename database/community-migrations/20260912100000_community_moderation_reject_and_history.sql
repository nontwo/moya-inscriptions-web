-- Owner instruction 2026-09-12 (moderation workspace): a pending item may be
-- refused without ever having been published. `reject` is the explicit,
-- audited pending -> hidden edge, distinct from `hide` (visible -> hidden) so
-- the audit trail never conflates a refusal with a takedown. The state set is
-- unchanged; nothing is deleted. The audit table also gains the index the
-- per-item history and the operation-history view read by.
-- Forward-only: earlier files and their ledger rows stay untouched.
ALTER TABLE community.moderation_events
  DROP CONSTRAINT moderation_events_action_valid,
  ADD CONSTRAINT moderation_events_action_valid CHECK (
    action IN (
      'approve', 'reject', 'hide', 'unhide', 'suspend', 'reinstate',
      'set_publication_policy'
    )
  );

CREATE INDEX moderation_events_subject_idx
  ON community.moderation_events (subject_id, occurred_at DESC, id DESC);
