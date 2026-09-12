-- Synthetic Development queue data for the Owner's moderation-workspace
-- acceptance (Owner instruction 2026-09-12). Applied only to the local
-- yoyi_dev database after the community migrations, grants, Development
-- accounts and the earlier acceptance comments; never to any other
-- environment. Idempotent: existing rows are kept and never reset.
--
-- 48 root comments (long Chinese paragraphs among them) and 24 replies, all on
-- catalog-dev-acceptance-04 so the public hot/latest demonstrations on the
-- earlier records stay exactly as accepted, with pending, visible and hidden
-- states mixed so the review queue spans several pages at 20 per page.

INSERT INTO community.catalog_comments (id, catalog_id, author_id, text, moderation, created_at) VALUES
  ('comment-000000000000000000000eed00000001', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '这一段题记的书风介于楷隶之间，横画收笔处常见向上挑起的波磔，竖画则多呈悬针。与同一区域晚近的造像题记相比，字距紧而行距宽，整体章法疏朗。拓片上第三行第五字左侧有一处明显的剥蚀，原石现场观察时应当留意是否为后期人为损伤。此外，题记末尾的纪年文字曾被几位学者分别释读为不同年号，目前尚无定论，建议在资料页中同时保留各家说法并注明出处，而不要在释文中直接采信其中一种。', 'pending', '2026-09-05T06:00:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000002', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '拓本与原石对照后，有三处出入。（队列样例 02）', 'pending', '2026-09-05T07:07:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000003', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '请问是否有清代以前的著录？（队列样例 03）', 'pending', '2026-09-05T08:14:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000004', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '释文第二行末字存疑。（队列样例 04）', 'pending', '2026-09-05T09:21:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000005', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '补刻痕迹明显，需在说明中指出。（队列样例 05）', 'pending', '2026-09-05T10:28:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000006', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '建议增加一张全景照片。（队列样例 06）', 'visible', '2026-09-05T11:35:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000007', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '碑额纹饰与邻近题刻相同。（队列样例 07）', 'visible', '2026-09-05T12:42:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000008', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '近年修缮后石面颜色有变化。（队列样例 08）', 'visible', '2026-09-05T13:49:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000009', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '关于书者身份，地方志里只有一句简略的记载，且与碑文本身的自署并不完全一致。有人据此推测题记出自当地一位僧人之手，也有人认为是随行的幕僚代书。就字迹本身来看，用笔的习惯与同时期几方有明确署名的碑刻有相似之处，但相似并不等于同一人。希望资料页在“学术研究”一栏能把这些分歧写清楚，方便后来者继续考证，而不是给出一个看似确定的结论。', 'visible', '2026-09-05T14:56:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000000a', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '感谢整理，很有帮助。（队列样例 10）', 'hidden', '2026-09-05T15:03:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000000b', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '这段释文的断句可以再商榷。（队列样例 11）', 'pending', '2026-09-05T16:10:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000000c', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '同意楼上的观察。（队列样例 12）', 'pending', '2026-09-05T17:17:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000000d', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '这一处的年号考订我持保留意见。（队列样例 13）', 'pending', '2026-09-06T06:24:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000000e', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '有没有更清晰的局部图？（队列样例 14）', 'pending', '2026-09-06T07:31:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000000f', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '现场已有围栏，不便近观。（队列样例 15）', 'pending', '2026-09-06T08:38:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000010', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '字势开张，气象不俗。（队列样例 16）', 'visible', '2026-09-06T09:45:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000011', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '我在去年夏天去过现场两次，一次在清晨，一次在傍晚。清晨的侧光下，刻痕的深浅层次最为清楚，尤其是那些细小的补刻痕迹；傍晚的光线则偏软，适合观察整体的章法布局。石面靠下的部分长期受水汽侵蚀，字迹已经相当模糊，如果要做完整的释文，恐怕还需要参考早年的旧拓。资料页里提到的另一处题刻位于同一条山路的上方大约三百米处，路况不好，去之前最好确认天气。', 'visible', '2026-09-06T10:52:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000012', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '请问是否有清代以前的著录？（队列样例 18）', 'visible', '2026-09-06T11:59:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000013', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '释文第二行末字存疑。（队列样例 19）', 'visible', '2026-09-06T12:06:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000014', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '补刻痕迹明显，需在说明中指出。（队列样例 20）', 'hidden', '2026-09-06T13:13:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000015', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '建议增加一张全景照片。（队列样例 21）', 'pending', '2026-09-06T14:20:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000016', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '碑额纹饰与邻近题刻相同。（队列样例 22）', 'pending', '2026-09-06T15:27:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000017', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '近年修缮后石面颜色有变化。（队列样例 23）', 'pending', '2026-09-06T16:34:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000018', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '路难走，注意安全。（队列样例 24）', 'pending', '2026-09-06T17:41:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000019', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '这一段题记的书风介于楷隶之间，横画收笔处常见向上挑起的波磔，竖画则多呈悬针。与同一区域晚近的造像题记相比，字距紧而行距宽，整体章法疏朗。拓片上第三行第五字左侧有一处明显的剥蚀，原石现场观察时应当留意是否为后期人为损伤。此外，题记末尾的纪年文字曾被几位学者分别释读为不同年号，目前尚无定论，建议在资料页中同时保留各家说法并注明出处，而不要在释文中直接采信其中一种。', 'pending', '2026-09-07T06:48:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000001a', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '这段释文的断句可以再商榷。（队列样例 26）', 'visible', '2026-09-07T07:55:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000001b', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '同意楼上的观察。（队列样例 27）', 'visible', '2026-09-07T08:02:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000001c', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '这一处的年号考订我持保留意见。（队列样例 28）', 'visible', '2026-09-07T09:09:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000001d', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '有没有更清晰的局部图？（队列样例 29）', 'visible', '2026-09-07T10:16:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000001e', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '现场已有围栏，不便近观。（队列样例 30）', 'hidden', '2026-09-07T11:23:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000001f', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '字势开张，气象不俗。（队列样例 31）', 'pending', '2026-09-07T12:30:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000020', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '拓本与原石对照后，有三处出入。（队列样例 32）', 'pending', '2026-09-07T13:37:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000021', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '关于书者身份，地方志里只有一句简略的记载，且与碑文本身的自署并不完全一致。有人据此推测题记出自当地一位僧人之手，也有人认为是随行的幕僚代书。就字迹本身来看，用笔的习惯与同时期几方有明确署名的碑刻有相似之处，但相似并不等于同一人。希望资料页在“学术研究”一栏能把这些分歧写清楚，方便后来者继续考证，而不是给出一个看似确定的结论。', 'pending', '2026-09-07T14:44:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000022', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '释文第二行末字存疑。（队列样例 34）', 'pending', '2026-09-07T15:51:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000023', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '补刻痕迹明显，需在说明中指出。（队列样例 35）', 'pending', '2026-09-07T16:58:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000024', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '建议增加一张全景照片。（队列样例 36）', 'visible', '2026-09-07T17:05:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000025', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '碑额纹饰与邻近题刻相同。（队列样例 37）', 'visible', '2026-09-08T06:12:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000026', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '近年修缮后石面颜色有变化。（队列样例 38）', 'visible', '2026-09-08T07:19:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000027', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '路难走，注意安全。（队列样例 39）', 'visible', '2026-09-08T08:26:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000028', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '感谢整理，很有帮助。（队列样例 40）', 'hidden', '2026-09-08T09:33:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000029', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '我在去年夏天去过现场两次，一次在清晨，一次在傍晚。清晨的侧光下，刻痕的深浅层次最为清楚，尤其是那些细小的补刻痕迹；傍晚的光线则偏软，适合观察整体的章法布局。石面靠下的部分长期受水汽侵蚀，字迹已经相当模糊，如果要做完整的释文，恐怕还需要参考早年的旧拓。资料页里提到的另一处题刻位于同一条山路的上方大约三百米处，路况不好，去之前最好确认天气。', 'pending', '2026-09-08T10:40:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000002a', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '同意楼上的观察。（队列样例 42）', 'pending', '2026-09-08T11:47:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000002b', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '这一处的年号考订我持保留意见。（队列样例 43）', 'pending', '2026-09-08T12:54:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000002c', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '有没有更清晰的局部图？（队列样例 44）', 'pending', '2026-09-08T13:01:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000002d', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '现场已有围栏，不便近观。（队列样例 45）', 'pending', '2026-09-08T14:08:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000002e', 'catalog-dev-acceptance-04', 'user-e7f588eee9b15df8432c7a16db80ec44', '字势开张，气象不俗。（队列样例 46）', 'visible', '2026-09-08T15:15:00Z'::timestamptz),
  ('comment-000000000000000000000eed0000002f', 'catalog-dev-acceptance-04', 'user-993d5a92418b0834339028df8645a0fb', '拓本与原石对照后，有三处出入。（队列样例 47）', 'visible', '2026-09-08T16:22:00Z'::timestamptz),
  ('comment-000000000000000000000eed00000030', 'catalog-dev-acceptance-04', 'user-d3121116762595e78ddc5dd84e8ecf1c', '请问是否有清代以前的著录？（队列样例 48）', 'visible', '2026-09-08T17:29:00Z'::timestamptz)
ON CONFLICT (id) DO NOTHING;

INSERT INTO community.catalog_comment_replies (id, root_comment_id, author_id, text, moderation, created_at, reply_to_reply_id) VALUES
  ('comment-000000000000000000000eed00000031', 'comment-000000000000000000000eed00000001', 'user-993d5a92418b0834339028df8645a0fb', '我在去年夏天去过现场两次，一次在清晨，一次在傍晚。清晨的侧光下，刻痕的深浅层次最为清楚，尤其是那些细小的补刻痕迹；傍晚的光线则偏软，适合观察整体的章法布局。石面靠下的部分长期受水汽侵蚀，字迹已经相当模糊，如果要做完整的释文，恐怕还需要参考早年的旧拓。资料页里提到的另一处题刻位于同一条山路的上方大约三百米处，路况不好，去之前最好确认天气。', 'visible', '2026-09-05T08:00:30Z'::timestamptz, NULL),
  ('comment-000000000000000000000eed00000032', 'comment-000000000000000000000eed00000001', 'user-d3121116762595e78ddc5dd84e8ecf1c', '回复：释文第二行末字存疑。（队列回复 02）', 'pending', '2026-09-05T09:11:30Z'::timestamptz, 'comment-000000000000000000000eed00000031'),
  ('comment-000000000000000000000eed00000033', 'comment-000000000000000000000eed00000002', 'user-e7f588eee9b15df8432c7a16db80ec44', '回复：碑额纹饰与邻近题刻相同。（队列回复 03）', 'hidden', '2026-09-05T10:22:30Z'::timestamptz, NULL),
  ('comment-000000000000000000000eed00000034', 'comment-000000000000000000000eed00000002', 'user-993d5a92418b0834339028df8645a0fb', '回复：感谢整理，很有帮助。（队列回复 04）', 'visible', '2026-09-05T11:33:30Z'::timestamptz, 'comment-000000000000000000000eed00000033'),
  ('comment-000000000000000000000eed00000035', 'comment-000000000000000000000eed00000003', 'user-d3121116762595e78ddc5dd84e8ecf1c', '回复：这一处的年号考订我持保留意见。（队列回复 05）', 'visible', '2026-09-05T12:44:30Z'::timestamptz, NULL),
  ('comment-000000000000000000000eed00000036', 'comment-000000000000000000000eed00000003', 'user-e7f588eee9b15df8432c7a16db80ec44', '回复：字势开张，气象不俗。（队列回复 06）', 'pending', '2026-09-05T13:55:30Z'::timestamptz, 'comment-000000000000000000000eed00000035'),
  ('comment-000000000000000000000eed00000037', 'comment-000000000000000000000eed00000004', 'user-993d5a92418b0834339028df8645a0fb', '回复：释文第二行末字存疑。（队列回复 07）', 'hidden', '2026-09-05T14:06:30Z'::timestamptz, NULL),
  ('comment-000000000000000000000eed00000038', 'comment-000000000000000000000eed00000004', 'user-d3121116762595e78ddc5dd84e8ecf1c', '回复：碑额纹饰与邻近题刻相同。（队列回复 08）', 'visible', '2026-09-05T15:17:30Z'::timestamptz, 'comment-000000000000000000000eed00000037'),
  ('comment-000000000000000000000eed00000039', 'comment-000000000000000000000eed00000005', 'user-e7f588eee9b15df8432c7a16db80ec44', '回复：感谢整理，很有帮助。（队列回复 09）', 'visible', '2026-09-05T16:28:30Z'::timestamptz, NULL),
  ('comment-000000000000000000000eed0000003a', 'comment-000000000000000000000eed00000005', 'user-993d5a92418b0834339028df8645a0fb', '我在去年夏天去过现场两次，一次在清晨，一次在傍晚。清晨的侧光下，刻痕的深浅层次最为清楚，尤其是那些细小的补刻痕迹；傍晚的光线则偏软，适合观察整体的章法布局。石面靠下的部分长期受水汽侵蚀，字迹已经相当模糊，如果要做完整的释文，恐怕还需要参考早年的旧拓。资料页里提到的另一处题刻位于同一条山路的上方大约三百米处，路况不好，去之前最好确认天气。', 'pending', '2026-09-05T17:39:30Z'::timestamptz, 'comment-000000000000000000000eed00000039'),
  ('comment-000000000000000000000eed0000003b', 'comment-000000000000000000000eed00000006', 'user-d3121116762595e78ddc5dd84e8ecf1c', '回复：字势开张，气象不俗。（队列回复 11）', 'hidden', '2026-09-05T18:50:30Z'::timestamptz, NULL),
  ('comment-000000000000000000000eed0000003c', 'comment-000000000000000000000eed00000006', 'user-e7f588eee9b15df8432c7a16db80ec44', '回复：释文第二行末字存疑。（队列回复 12）', 'visible', '2026-09-05T19:01:30Z'::timestamptz, 'comment-000000000000000000000eed0000003b'),
  ('comment-000000000000000000000eed0000003d', 'comment-000000000000000000000eed00000007', 'user-993d5a92418b0834339028df8645a0fb', '回复：碑额纹饰与邻近题刻相同。（队列回复 13）', 'visible', '2026-09-06T08:12:30Z'::timestamptz, NULL),
  ('comment-000000000000000000000eed0000003e', 'comment-000000000000000000000eed00000007', 'user-d3121116762595e78ddc5dd84e8ecf1c', '回复：感谢整理，很有帮助。（队列回复 14）', 'pending', '2026-09-06T09:23:30Z'::timestamptz, 'comment-000000000000000000000eed0000003d'),
  ('comment-000000000000000000000eed0000003f', 'comment-000000000000000000000eed00000008', 'user-e7f588eee9b15df8432c7a16db80ec44', '回复：这一处的年号考订我持保留意见。（队列回复 15）', 'hidden', '2026-09-06T10:34:30Z'::timestamptz, NULL),
  ('comment-000000000000000000000eed00000040', 'comment-000000000000000000000eed00000008', 'user-993d5a92418b0834339028df8645a0fb', '回复：字势开张，气象不俗。（队列回复 16）', 'visible', '2026-09-06T11:45:30Z'::timestamptz, 'comment-000000000000000000000eed0000003f'),
  ('comment-000000000000000000000eed00000041', 'comment-000000000000000000000eed00000009', 'user-d3121116762595e78ddc5dd84e8ecf1c', '回复：释文第二行末字存疑。（队列回复 17）', 'visible', '2026-09-06T12:56:30Z'::timestamptz, NULL),
  ('comment-000000000000000000000eed00000042', 'comment-000000000000000000000eed00000009', 'user-e7f588eee9b15df8432c7a16db80ec44', '回复：碑额纹饰与邻近题刻相同。（队列回复 18）', 'pending', '2026-09-06T13:07:30Z'::timestamptz, 'comment-000000000000000000000eed00000041'),
  ('comment-000000000000000000000eed00000043', 'comment-000000000000000000000eed0000000a', 'user-993d5a92418b0834339028df8645a0fb', '我在去年夏天去过现场两次，一次在清晨，一次在傍晚。清晨的侧光下，刻痕的深浅层次最为清楚，尤其是那些细小的补刻痕迹；傍晚的光线则偏软，适合观察整体的章法布局。石面靠下的部分长期受水汽侵蚀，字迹已经相当模糊，如果要做完整的释文，恐怕还需要参考早年的旧拓。资料页里提到的另一处题刻位于同一条山路的上方大约三百米处，路况不好，去之前最好确认天气。', 'hidden', '2026-09-06T14:18:30Z'::timestamptz, NULL),
  ('comment-000000000000000000000eed00000044', 'comment-000000000000000000000eed0000000a', 'user-d3121116762595e78ddc5dd84e8ecf1c', '回复：这一处的年号考订我持保留意见。（队列回复 20）', 'visible', '2026-09-06T15:29:30Z'::timestamptz, 'comment-000000000000000000000eed00000043'),
  ('comment-000000000000000000000eed00000045', 'comment-000000000000000000000eed0000000b', 'user-e7f588eee9b15df8432c7a16db80ec44', '回复：字势开张，气象不俗。（队列回复 21）', 'visible', '2026-09-06T16:40:30Z'::timestamptz, NULL),
  ('comment-000000000000000000000eed00000046', 'comment-000000000000000000000eed0000000b', 'user-993d5a92418b0834339028df8645a0fb', '回复：释文第二行末字存疑。（队列回复 22）', 'pending', '2026-09-06T17:51:30Z'::timestamptz, 'comment-000000000000000000000eed00000045'),
  ('comment-000000000000000000000eed00000047', 'comment-000000000000000000000eed0000000c', 'user-d3121116762595e78ddc5dd84e8ecf1c', '回复：碑额纹饰与邻近题刻相同。（队列回复 23）', 'hidden', '2026-09-06T18:02:30Z'::timestamptz, NULL),
  ('comment-000000000000000000000eed00000048', 'comment-000000000000000000000eed0000000c', 'user-e7f588eee9b15df8432c7a16db80ec44', '回复：感谢整理，很有帮助。（队列回复 24）', 'visible', '2026-09-06T19:13:30Z'::timestamptz, 'comment-000000000000000000000eed00000047')
ON CONFLICT (id) DO NOTHING;
