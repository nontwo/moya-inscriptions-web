-- data-admin-hardening-v1 r4 (Issue #141): the frozen keyword manifest.
-- An operation prepared by server-side query stores the canonical criteria it
-- was built from — terms, match rule, scope, target, author, state, date
-- interval, the stated interpretation, the preparation time, the match count
-- and a bounded preview sample. It is written once with the operation row and
-- never updated afterwards (the App role holds no UPDATE on this column), so
-- the approval view and any later audit read exactly what the Backend matched.
-- Operations prepared from an explicit id list leave it NULL.
-- Forward-only; no data change, no index, no existing column touched.

ALTER TABLE community.agent_operations
  ADD COLUMN criteria JSONB;
