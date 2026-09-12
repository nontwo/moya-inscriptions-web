-- Development test accounts: real community.public_users rows seeded only into
-- the local yoyi_dev database after community migrations. Ids are opaque and
-- fixed so sessions survive re-seeding; handles are system-assigned here; the
-- display names are deliberately Chinese. Nothing in this file is QA fixture
-- data, and none of it exists in Production.
INSERT INTO community.public_users (id, handle, display_name)
VALUES
  ('user-e7f588eee9b15df8432c7a16db80ec44', 'dev-user-01', '拓片爱好者'),
  ('user-993d5a92418b0834339028df8645a0fb', 'dev-user-02', '书法学徒'),
  ('user-d3121116762595e78ddc5dd84e8ecf1c', 'dev-user-03', '石刻研究者')
ON CONFLICT (id) DO NOTHING;

INSERT INTO community.development_accounts (user_id, label)
VALUES
  ('user-e7f588eee9b15df8432c7a16db80ec44', 'Development account 01'),
  ('user-993d5a92418b0834339028df8645a0fb', 'Development account 02'),
  ('user-d3121116762595e78ddc5dd84e8ecf1c', 'Development account 03')
ON CONFLICT (user_id) DO NOTHING;
