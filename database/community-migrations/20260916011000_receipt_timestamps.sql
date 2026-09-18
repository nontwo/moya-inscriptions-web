-- data-admin-hardening-v1: lifecycle metadata for the two idempotency receipt
-- tables that carried no timestamp (author_command_receipts already has
-- created_at). Rows written before this migration keep NULL: their write time
-- is unknown and is not invented. New rows default to their insert time, and
-- the publishing operator command passes its own clock explicitly so the
-- receipt matches the audit row written in the same transaction.
-- Forward-only; no row is deleted, rewritten or re-timed; replay semantics
-- (lookup by label + request_id, fingerprint comparison) are unchanged.
ALTER TABLE community.discussion_command_receipts
  ADD COLUMN created_at TIMESTAMPTZ;
ALTER TABLE community.discussion_command_receipts
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE community.content_operator_receipts
  ADD COLUMN created_at TIMESTAMPTZ;
ALTER TABLE community.content_operator_receipts
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
