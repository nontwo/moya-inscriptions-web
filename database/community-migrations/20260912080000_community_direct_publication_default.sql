-- Owner scope amendment 2026-09-12: DIRECT_PUBLICATION is the initial default
-- of the publication setting. Only the platform-seeded row is changed, so a
-- fresh initialization starts in direct publication while a choice the Owner
-- has already saved through the operator boundary is never overwritten.
-- Forward-only: the seeding migration stays byte-identical and its ledger row
-- untouched.
UPDATE community.publication_setting
SET policy = 'DIRECT_PUBLICATION'
WHERE id = 'publication'
  AND policy = 'PRE_MODERATION'
  AND updated_by = 'platform';
