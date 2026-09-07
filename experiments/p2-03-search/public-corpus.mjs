/**
 * Evaluation-only, bounded official museum text (10 records; no images).
 * Each cited collection page explicitly licenses its text under CC BY 4.0.
 * Source names, title spacing, script labels and supplied dates are retained.
 * Transcriptions below are deliberately short, verbatim EXCERPTS, not complete
 * transcriptions and not a canonical Catalog import. Empty aliases mean no
 * alias relation was adopted. An author's domain role is not inferred.
 *
 * The museum's page-wide statement identifies these as its collection; its
 * name is a current custodian, never an original site or a creator's location.
 * Dynasty/period values are not inferred from title prefixes or biographies.
 * Provenance and attribution metadata must stay OUT of the search projection.
 *
 * License: https://creativecommons.org/licenses/by/4.0/deed.zh-hant
 * Reuse/adaptation: selected fields, Chinese author-name components, short
 * transcription excerpts and the explicit 法書 -> calligraphy evaluation map.
 * Runtime normalization is performed only on rebuildable search copies.
 * The museum does not endorse this evaluation or its search judgments.
 */

const accessed = "2026-09-07";
const license = "CC BY 4.0";
const licenseUrl = "https://creativecommons.org/licenses/by/4.0/deed.zh-hant";
const museum = "國立故宮博物院";
const value = (text) => ({ state: "VALUE", value: text });
const unsupplied = () => ({ state: "UNSUPPLIED" });

const sourceFields = (hasDate) => ({
  title: "基本資料.品名；原樣保留，包括空白",
  kind: "基本資料.分類=法書；明示映射至實驗 calligraphy",
  contributors: "基本資料.作者；僅採用中文名稱，不推導書寫者或撰文者角色",
  scriptStyle: "基本資料.書體；原樣保留",
  ...(hasDate ? { dateText: "基本資料.創作時間；原樣保留" } : {}),
  currentCustodian: "關於本站所載國立故宮博物院所藏及該件署名；非作品原址",
  transcription: "基本資料.釋文；僅採用下列原樣短節選，非完整釋文",
});

const makeRecord = (
  number,
  itemId,
  title,
  author,
  scriptStyle,
  excerpt,
  dateText,
) => {
  const id = `pub-${String(number).padStart(3, "0")}`;
  const sourceUrl = `https://digitalarchive.npm.gov.tw/Collection/Detail/${itemId}?dep=P`;
  const attribution = `${title}。國立故宮博物院，台北，CC BY 4.0 @ www.npm.gov.tw`;
  const fields = sourceFields(dateText !== undefined);
  return {
    id,
    kind: "calligraphy",
    fictional: false,
    visible: true,
    provenance: {
      type: "official-open-data",
      sourceUrl,
      accessed,
      license,
      licenseUrl,
      attribution,
      fields,
      changes:
        "Field selection; Chinese author-name selection; short verbatim transcription excerpt; classification mapping only. No image, biography, inferred alias, domain role, original location or canonical identity was imported.",
      excerptOnly: true,
      visibility:
        "Official public page selected for the experiment; no publication-state or ACL assertion is created.",
    },
    title,
    aliases: [],
    contributors: [{ name: author }],
    dynasty: unsupplied(),
    dateText: dateText === undefined ? unsupplied() : value(dateText),
    scriptStyle: value(scriptStyle),
    province: unsupplied(),
    prefecture: unsupplied(),
    county: unsupplied(),
    currentLocation: unsupplied(),
    currentCustodian: value(museum),
    transcription: value(excerpt),
  };
};

export const publicCorpus = [
  makeRecord(
    1,
    14900,
    "唐孫過庭書譜　卷",
    "孫過庭",
    "草書",
    "書譜卷上。吳郡孫過庭撰。夫自古之善書者。漢魏有鍾張之絕。",
    "周則天武后萬歲通天垂拱三年（687）",
  ),
  makeRecord(
    2,
    882,
    "宋蘇軾書前赤壁賦　卷",
    "蘇軾",
    "行楷書",
    "清風徐來。水波不興。",
  ),
  makeRecord(
    3,
    14714,
    "北宋蘇東坡書黃州寒食詩　卷",
    "蘇軾",
    "行書",
    "自我來黃州。已過三寒食。",
  ),
  makeRecord(
    4,
    14901,
    "唐懷素自敘帖　卷",
    "懷素",
    "草書",
    "懷素家長沙。幼而事佛。經禪之暇。頗好筆翰。",
    "唐代宗大曆十二年（777）",
  ),
  makeRecord(
    5,
    3,
    "唐顏真卿祭姪文稿　卷",
    "顏真卿",
    "行書",
    "惟爾挺生。夙標幼德。宗廟瑚璉。階庭蘭玉。",
  ),
  makeRecord(
    6,
    912,
    "宋米芾蜀素帖　卷",
    "米芾",
    "行書",
    "青松勁挺姿。凌霄恥屈盤。",
    "北宋哲宗元祐三年（1088）",
  ),
  makeRecord(
    7,
    19,
    "晉王羲之快雪時晴帖　冊",
    "王羲之",
    "行書",
    "羲之頓首。快雪時晴。佳想安善。未果為結。",
  ),
  makeRecord(
    8,
    43,
    "宋黃庭堅自書松風閣詩　卷",
    "黃庭堅",
    "行書",
    "依山築閣見平川。夜闌箕斗插屋椽。",
  ),
  makeRecord(
    9,
    373,
    "元趙孟頫書前後赤壁賦　卷",
    "趙孟頫",
    "行楷書",
    "清風徐來。水波不興。",
    "元成宗大德三年（1299）",
  ),
  makeRecord(
    10,
    425,
    "元趙孟頫行書赤壁二賦　 冊",
    "趙孟頫",
    "行書",
    "清風徐來。水波不興。",
    "大德辛丑（1301）",
  ),
];

/** Keep this export with every redistributed copy of the adopted museum text. */
export const sourceAttributions = publicCorpus.map(
  ({ id, title, provenance }) => ({
    id,
    title,
    sourceUrl: provenance.sourceUrl,
    accessed: provenance.accessed,
    license: provenance.license,
    licenseUrl: provenance.licenseUrl,
    attribution: provenance.attribution,
    fields: Object.keys(provenance.fields),
    sourceFields: provenance.fields,
    changes: provenance.changes,
  }),
);

const ids = (...numbers) =>
  numbers.map((number) => `pub-${String(number).padStart(3, "0")}`);
const golden = (number, query, category, expected, options = {}) => ({
  id: `pub-q-${String(number).padStart(2, "0")}`,
  query,
  category,
  expectedIds: ids(...expected),
  acceptableTop1: ids(...expected),
  fictional: false,
  judgment:
    "Manually judged against these ten official-text excerpts only, before engine output; rejudge overlapping queries if corpora are combined.",
  ...options,
});

/**
 * Closed-public-corpus relevance labels. Similar-result judgments are separate
 * from exact/partial labels. No museum endorsement or new alias is implied.
 * Use independent public/synthetic quality runs, or rejudge merged labels;
 * notably the synthetic corpus contains an intentionally fictional 書譜 homonym.
 */
export const publicGoldenQueries = [
  golden(1, "唐孫過庭書譜　卷", "public-raw-title", [1], {
    expectedTier: "raw-title",
  }),
  golden(2, "书谱", "public-two-han-simplified", [1], {
    expectedTier: "title-alias-partial",
  }),
  golden(3, "孫過庭 書譜", "public-person-work-and", [1]),
  golden(4, "唐 草書", "public-dynasty-title-and-script", [1, 4], {
    notes:
      "唐 is present in the source titles; no dynasty field was inferred. Both parts must match one record.",
  }),
  golden(5, "蘇軾 前赤壁賦", "public-person-work-and", [2], {
    excludedIds: ids(3, 9, 10),
  }),
  golden(6, "苏轼 前赤壁赋", "public-person-work-simplified", [2], {
    excludedIds: ids(3, 9, 10),
  }),
  golden(7, "赤壁", "public-two-han-multiple-works", [2, 9, 10], {
    expectedTier: "title-alias-partial",
  }),
  golden(8, "黃州寒食詩", "public-title-partial", [3], {
    expectedTier: "title-alias-partial",
  }),
  golden(9, "蘇軾 黃州", "public-author-field-and-title", [3], {
    notes:
      "The title says 蘇東坡 but the explicitly supplied 作者 field says 蘇軾; no alias was added.",
  }),
  golden(10, "懷素 自敘帖", "public-person-work-and", [4]),
  golden(11, "自叙帖", "public-title-simplified", [4], {
    expectedTier: "title-alias-partial",
  }),
  golden(12, "顏真卿 祭姪文稿", "public-person-work-and", [5]),
  golden(13, "颜真卿 祭侄文稿", "public-person-work-normalization", [5], {
    notes:
      "Desired normalized recall is judged against the source spelling; runtime OpenCC output is measured, not assumed to pass.",
  }),
  golden(14, "米芾 蜀素帖", "public-person-work-and", [6]),
  golden(15, "北宋哲宗元祐三年", "public-source-date", [6], {
    expectedTier: "structured",
  }),
  golden(16, "王羲之 快雪時晴", "public-person-work-and", [7]),
  golden(17, "黄庭坚 松风阁", "public-person-work-simplified", [8]),
  golden(18, "趙孟頫 赤壁二賦", "public-same-author-distinct-work", [10], {
    excludedIds: ids(2, 9),
  }),
  golden(19, "元成宗大德三年", "public-source-date", [9], {
    expectedTier: "structured",
  }),
  golden(20, "國立故宮博物院 草書", "public-custodian-and-script", [1, 4], {
    expectedTier: "structured",
    notes:
      "Current museum custody, not original location, is the supplied field.",
  }),
  golden(21, "清風徐來", "public-transcription-multiple-works", [2, 9, 10], {
    expectedTier: "body",
  }),
  golden(22, "青松勁挺姿", "public-transcription", [6], {
    expectedTier: "body",
  }),
  golden(23, "蘇軾 蜀素帖", "public-cross-record-and-zero", [], {
    excludedIds: ids(2, 3, 6),
  }),
  golden(24, "書普", "public-near-only", [1], {
    expectedTier: "near",
    notes:
      "Deliberately wrong final character; a suggested 書譜 result must remain approximate, never exact or an adopted alias.",
  }),
];
