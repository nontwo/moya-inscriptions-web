-- Synthetic Development acceptance comments for the Owner's Community review
-- (scope amendment 2026-09-12). Applied only to the local yoyi_dev database
-- after the community migrations, the App-role grants and the Development
-- accounts; never to any other environment. Idempotent: existing rows are kept.
--
-- catalog-dev-acceptance-01: hot section = the three visible roots with the
--   most visible replies (12, 2, then a 1/1 tie won by the newer root), then
--   sixteen newer roots without replies (two pages of ten). Pending and hidden
--   rows exist to prove they neither count nor show.
-- catalog-dev-acceptance-02: three visible roots whose only replies are
--   pending or hidden, so no root qualifies as hot.
-- catalog-dev-acceptance-03: intentionally empty.

INSERT INTO community.catalog_comments (id, catalog_id, author_id, text, moderation, created_at) VALUES
  ('comment-00000000000000000000acce00000001', 'catalog-dev-acceptance-01', 'user-e7f588eee9b15df8432c7a16db80ec44', '这方摩崖的字口还很清晰，拓片能看出刀痕的起收。', 'visible', '2026-09-10T08:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000002', 'catalog-dev-acceptance-01', 'user-993d5a92418b0834339028df8645a0fb', '请教：题记末尾那个年号，是否有学者做过考订？', 'visible', '2026-09-10T09:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000003', 'catalog-dev-acceptance-01', 'user-d3121116762595e78ddc5dd84e8ecf1c', '现场光线太强时看不清，建议清晨去。', 'visible', '2026-09-10T10:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000004', 'catalog-dev-acceptance-01', 'user-e7f588eee9b15df8432c7a16db80ec44', '补充一张我拍的侧光照片的观察：右下角有一处补刻。', 'visible', '2026-09-10T11:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000017', 'catalog-dev-acceptance-01', 'user-e7f588eee9b15df8432c7a16db80ec44', '初次来看，字势开张。', 'visible', '2026-09-11T08:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000018', 'catalog-dev-acceptance-01', 'user-993d5a92418b0834339028df8645a0fb', '拓本对照原石，多处漫漶。', 'visible', '2026-09-11T09:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000019', 'catalog-dev-acceptance-01', 'user-d3121116762595e78ddc5dd84e8ecf1c', '想问问附近有没有其他题刻。', 'visible', '2026-09-11T10:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce0000001a', 'catalog-dev-acceptance-01', 'user-e7f588eee9b15df8432c7a16db80ec44', '题记的书风接近同期的造像记。', 'visible', '2026-09-11T11:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce0000001b', 'catalog-dev-acceptance-01', 'user-993d5a92418b0834339028df8645a0fb', '这一段释文有一字存疑。', 'visible', '2026-09-11T12:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce0000001c', 'catalog-dev-acceptance-01', 'user-d3121116762595e78ddc5dd84e8ecf1c', '石面风化严重，建议尽早记录。', 'visible', '2026-09-11T13:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce0000001d', 'catalog-dev-acceptance-01', 'user-e7f588eee9b15df8432c7a16db80ec44', '字径约在十厘米上下。', 'visible', '2026-09-11T14:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce0000001e', 'catalog-dev-acceptance-01', 'user-993d5a92418b0834339028df8645a0fb', '路不好走，注意安全。', 'visible', '2026-09-11T15:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce0000001f', 'catalog-dev-acceptance-01', 'user-d3121116762595e78ddc5dd84e8ecf1c', '有几个字的写法值得留意。', 'visible', '2026-09-12T08:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000020', 'catalog-dev-acceptance-01', 'user-e7f588eee9b15df8432c7a16db80ec44', '与县志所载位置略有出入。', 'visible', '2026-09-12T09:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000021', 'catalog-dev-acceptance-01', 'user-993d5a92418b0834339028df8645a0fb', '近期有修缮痕迹。', 'visible', '2026-09-12T10:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000022', 'catalog-dev-acceptance-01', 'user-d3121116762595e78ddc5dd84e8ecf1c', '推荐配合周边题刻一起看。', 'visible', '2026-09-12T11:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000023', 'catalog-dev-acceptance-01', 'user-e7f588eee9b15df8432c7a16db80ec44', '关于书者身份，暂无定论。', 'visible', '2026-09-12T12:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000024', 'catalog-dev-acceptance-01', 'user-993d5a92418b0834339028df8645a0fb', '拓片边缘有明显的补描。', 'visible', '2026-09-12T13:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000025', 'catalog-dev-acceptance-01', 'user-d3121116762595e78ddc5dd84e8ecf1c', '碑额纹饰保存较好。', 'visible', '2026-09-12T14:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000026', 'catalog-dev-acceptance-01', 'user-e7f588eee9b15df8432c7a16db80ec44', '以上为合成验收数据。', 'visible', '2026-09-12T15:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000027', 'catalog-dev-acceptance-01', 'user-993d5a92418b0834339028df8645a0fb', '（待审核的根评论：不应显示）', 'pending', '2026-09-12T20:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000028', 'catalog-dev-acceptance-01', 'user-d3121116762595e78ddc5dd84e8ecf1c', '（已隐藏的根评论：不应显示）', 'hidden', '2026-09-12T21:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce00000029', 'catalog-dev-acceptance-02', 'user-e7f588eee9b15df8432c7a16db80ec44', '这条资料没有热门评论，只应显示最新列表。', 'visible', '2026-09-11T09:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce0000002a', 'catalog-dev-acceptance-02', 'user-993d5a92418b0834339028df8645a0fb', '第二条评论。', 'visible', '2026-09-11T10:00:00Z'::timestamptz),
  ('comment-00000000000000000000acce0000002b', 'catalog-dev-acceptance-02', 'user-d3121116762595e78ddc5dd84e8ecf1c', '第三条评论。', 'visible', '2026-09-11T11:00:00Z'::timestamptz)
ON CONFLICT (id) DO NOTHING;

INSERT INTO community.catalog_comment_replies (id, root_comment_id, author_id, text, moderation, created_at, reply_to_reply_id) VALUES
  ('comment-00000000000000000000acce00000005', 'comment-00000000000000000000acce00000001', 'user-993d5a92418b0834339028df8645a0fb', '回复 1：同意，第 1 行的刀痕尤其明显。', 'visible', '2026-09-10T12:00:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce00000006', 'comment-00000000000000000000acce00000001', 'user-d3121116762595e78ddc5dd84e8ecf1c', '回复 2：同意，第 2 行的刀痕尤其明显。', 'visible', '2026-09-10T12:03:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce00000007', 'comment-00000000000000000000acce00000001', 'user-e7f588eee9b15df8432c7a16db80ec44', '回复 3：同意，第 3 行的刀痕尤其明显。', 'visible', '2026-09-10T12:06:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce00000008', 'comment-00000000000000000000acce00000001', 'user-993d5a92418b0834339028df8645a0fb', '回复 4：同意，第 4 行的刀痕尤其明显。', 'visible', '2026-09-10T12:09:00Z'::timestamptz, 'comment-00000000000000000000acce00000007'),
  ('comment-00000000000000000000acce00000009', 'comment-00000000000000000000acce00000001', 'user-d3121116762595e78ddc5dd84e8ecf1c', '回复 5：同意，第 5 行的刀痕尤其明显。', 'visible', '2026-09-10T12:12:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce0000000a', 'comment-00000000000000000000acce00000001', 'user-e7f588eee9b15df8432c7a16db80ec44', '回复 6：同意，第 6 行的刀痕尤其明显。', 'visible', '2026-09-10T12:15:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce0000000b', 'comment-00000000000000000000acce00000001', 'user-993d5a92418b0834339028df8645a0fb', '回复 7：同意，第 7 行的刀痕尤其明显。', 'visible', '2026-09-10T12:18:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce0000000c', 'comment-00000000000000000000acce00000001', 'user-d3121116762595e78ddc5dd84e8ecf1c', '回复 8：同意，第 8 行的刀痕尤其明显。', 'visible', '2026-09-10T12:21:00Z'::timestamptz, 'comment-00000000000000000000acce0000000b'),
  ('comment-00000000000000000000acce0000000d', 'comment-00000000000000000000acce00000001', 'user-e7f588eee9b15df8432c7a16db80ec44', '回复 9：同意，第 9 行的刀痕尤其明显。', 'visible', '2026-09-10T12:24:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce0000000e', 'comment-00000000000000000000acce00000001', 'user-993d5a92418b0834339028df8645a0fb', '回复 10：同意，第 10 行的刀痕尤其明显。', 'visible', '2026-09-10T12:27:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce0000000f', 'comment-00000000000000000000acce00000001', 'user-d3121116762595e78ddc5dd84e8ecf1c', '回复 11：同意，第 11 行的刀痕尤其明显。', 'visible', '2026-09-10T12:30:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce00000010', 'comment-00000000000000000000acce00000001', 'user-e7f588eee9b15df8432c7a16db80ec44', '回复 12：同意，第 12 行的刀痕尤其明显。', 'visible', '2026-09-10T12:33:00Z'::timestamptz, 'comment-00000000000000000000acce0000000f'),
  ('comment-00000000000000000000acce00000011', 'comment-00000000000000000000acce00000002', 'user-d3121116762595e78ddc5dd84e8ecf1c', '有一篇九十年代的考释文章讨论过这个年号。', 'visible', '2026-09-10T13:00:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce00000012', 'comment-00000000000000000000acce00000002', 'user-e7f588eee9b15df8432c7a16db80ec44', '能否给出文章名？', 'visible', '2026-09-10T13:20:00Z'::timestamptz, 'comment-00000000000000000000acce00000011'),
  ('comment-00000000000000000000acce00000013', 'comment-00000000000000000000acce00000002', 'user-993d5a92418b0834339028df8645a0fb', '（待审核的回复：不应计入热度，也不应显示）', 'pending', '2026-09-10T13:40:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce00000014', 'comment-00000000000000000000acce00000002', 'user-993d5a92418b0834339028df8645a0fb', '（已隐藏的回复：不应计入热度，也不应显示）', 'hidden', '2026-09-10T13:50:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce00000015', 'comment-00000000000000000000acce00000003', 'user-e7f588eee9b15df8432c7a16db80ec44', '确实，清晨侧光最好。', 'visible', '2026-09-10T14:00:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce00000016', 'comment-00000000000000000000acce00000004', 'user-993d5a92418b0834339028df8645a0fb', '补刻的位置我也注意到了。', 'visible', '2026-09-10T15:00:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce0000002c', 'comment-00000000000000000000acce00000029', 'user-993d5a92418b0834339028df8645a0fb', '（待审核的回复）', 'pending', '2026-09-11T12:00:00Z'::timestamptz, NULL),
  ('comment-00000000000000000000acce0000002d', 'comment-00000000000000000000acce0000002a', 'user-e7f588eee9b15df8432c7a16db80ec44', '（已隐藏的回复）', 'hidden', '2026-09-11T13:00:00Z'::timestamptz, NULL)
ON CONFLICT (id) DO NOTHING;
