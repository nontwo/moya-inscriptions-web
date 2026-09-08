/**
 * Evaluation-only designed fiction. No record represents a real collection
 * item, person, place, dynasty, custodial assertion, or imported source.
 * Chinese vocabulary is used to exercise retrieval; even a familiar title is
 * only a synthetic homonym. No existing fixture or original text was copied.
 *
 * Optional summary/description strings model the existing supplied VALUE case;
 * absence models no supplied value. Stateful fields require state === VALUE.
 * boundaryProbe records deliberately contain non-VALUE payloads to test that
 * an index projection rejects/omits them, not to model valid source records.
 * stressOnly content is excluded from every main relevance/index experiment.
 */

const provenance = Object.freeze({
  type: "designed-synthetic",
  note: "All facts and prose were invented for this isolated search evaluation; no real source or collection identity is asserted.",
  aliases:
    "Each alias is approved only as an explicitly designed relation inside this fictional scenario.",
});

const value = (text) => ({ state: "VALUE", value: text });
const unsupplied = () => ({ state: "UNSUPPLIED" });
const statefulFields = [
  "dynasty",
  "dateText",
  "scriptStyle",
  "province",
  "prefecture",
  "county",
  "currentLocation",
  "currentCustodian",
  "transcription",
];

const record = (number, title, fields = {}) => ({
  id: `syn-${String(number).padStart(3, "0")}`,
  kind: "inscription",
  fictional: true,
  provenance,
  visible: true,
  title,
  aliases: [],
  contributors: [],
  ...Object.fromEntries(statefulFields.map((field) => [field, unsupplied()])),
  ...fields,
});

/** Human-designed anchors; canonical strings are never normalized in place. */
export const corpus = [
  record(1, "云岭记", {
    aliases: ["云峰小记"],
    contributors: [{ name: "林砚舟", role: "calligrapher" }],
    periodLabel: "拟青三年",
    dynasty: value("拟青朝"),
    dateText: value("拟青三年春三月"),
    scriptStyle: value("行草"),
    summary: "虚构山间练笔的一段短摘要。",
    description: "此篇为检索实验新写，描摹晨光与石纹。",
    transcription: value("风入松窗月满庭。"),
  }),
  record(2, "山中短札", {
    kind: "calligraphy",
    aliases: ["云岭记"],
  }),
  record(3, "雲嶺記", {
    kind: "calligraphy",
    aliases: ["雲峰錄"],
    description: "仅用繁体字制作的虚构检索对照。",
  }),
  record(4, "云岭记续篇"),
  record(5, "石色杂记", { currentLocation: value("云岭记展室") }),
  record(6, "古木札", {
    kind: "calligraphy",
    description: "文中用云岭记一词作合成比较材料。",
  }),
  record(7, "云领记", {
    description: "这是与另一虚构标题近形的独立记录，没有别名关系。",
  }),
  record(8, "虚构书谱练习记", {
    kind: "calligraphy",
    aliases: ["翰墨练习册"],
    description: "书谱在这里仅是获准使用的查询词；本记录不是任何真实同名作品。",
  }),
  record(9, "春泉题记", {
    contributors: [{ name: "林砚舟", role: "calligrapher" }],
  }),
  record(10, "远岫清谈", {
    kind: "calligraphy",
    contributors: [{ name: "林砚舟", role: "textAuthor" }],
  }),
  record(11, "春泉续记", {
    contributors: [{ name: "沈墨禾", role: "textAuthor" }],
  }),
  record(12, "碑"),
  record(13, "寒泉碑"),
  record(14, "蘭溪習字札", { kind: "calligraphy" }),
  record(15, "兰溪习字续札", { kind: "calligraphy" }),
  record(16, "春風題記"),
  record(17, "松窗读字记", { summary: "棠花微雨是本次新写的合成摘要意象。" }),
  record(18, "石桥新札", { description: "铜声入夜是本次新写的合成说明意象。" }),
  record(19, "秋灯摹字稿", {
    kind: "calligraphy",
    transcription: value("石径微霜雁影斜。"),
  }),
  record(20, "素砚小录", {
    kind: "calligraphy",
    contributors: [{ name: "顾苔生", role: "calligrapher" }],
    periodLabel: "拟白纪元",
    dynasty: value("拟白朝"),
    dateText: value("拟白五年秋"),
    scriptStyle: value("小篆"),
    province: value("澄石省"),
    prefecture: value("流泉府"),
    county: value("竹影县"),
    currentLocation: value("素砚展室"),
    currentCustodian: value("虚构青石保管所"),
  }),
  record(21, "山川合写稿", {
    kind: "calligraphy",
    contributors: [
      { name: "沈墨禾", role: "textAuthor" },
      { name: "顾苔生", role: "calligrapher" },
    ],
    currentLocation: value("素砚展室"),
  }),
  record(22, "合成排除题记", {
    visible: false,
    aliases: ["排除样例别名"],
  }),
  record(23, "云岭记", { visible: false }),
  record(24, "留白练习稿", {
    boundaryProbe: true,
    transcription: { state: "UNSUPPLIED", value: "不可检索探针甲" },
    dynasty: { state: "UNKNOWN", value: "不可检索探针乙" },
  }),
  record(25, "清空练习稿", {
    boundaryProbe: true,
    transcription: { state: "CLEAR", value: "不可检索探针丙" },
    province: { state: "NOT_APPLICABLE", value: "不可检索探针丁" },
  }),
  record(26, "长卷压力样本", {
    stressOnly: {
      historicalContext: value("独立压力词甲。".repeat(400)),
      scholarlyResearch: value("独立压力词乙。".repeat(400)),
    },
  }),
  record(27, "遠山帖", { kind: "calligraphy" }),
  record(28, "远山帖", { kind: "calligraphy" }),
  record(29, "远山手札", { kind: "calligraphy", aliases: ["遠山帖"] }),
  record(30, "暮雨扇面稿", { kind: "calligraphy", aliases: ["秋灯别录"] }),
  record(31, "秋灯别录", { kind: "calligraphy" }),
  record(32, "乌云写字稿", { kind: "calligraphy" }),
  record(33, "重游竹径记"),
  record(34, "泉声十二行", { kind: "calligraphy" }),
  record(35, "松風入硯記", { kind: "calligraphy" }),
  record(36, "松风入砚记补笔", { kind: "calligraphy" }),
  record(37, "溪月图记"),
  record(38, "溪月杂写", {
    summary: "这一合成图记用来验证同一文档的跨字段组合。",
  }),
  record(39, "柳影小笺", { kind: "calligraphy" }),
  record(40, "隐显边界练习"),
];

const ids = (...numbers) =>
  numbers.map((number) => `syn-${String(number).padStart(3, "0")}`);
const golden = (number, query, category, expected, top, options = {}) => ({
  id: `q-${String(number).padStart(2, "0")}`,
  query,
  category,
  expectedIds: ids(...expected),
  acceptableTop1: ids(...top),
  fictional: true,
  judgment:
    "Manually specified for the 40 designed anchors; not derived from engine output.",
  ...options,
});

/**
 * Closed-anchor judgments: expectedIds are positive relevance labels, not a
 * required total order. acceptableTop1 records the approved highest tier.
 * Near-only intent is labeled separately; near results in an exact query are
 * not promoted to positive exact/partial labels. Evaluate these judgments on
 * corpus, not the scale corpus, whose additional records are unlabeled.
 */
export const goldenQueries = [
  golden(1, "云岭记", "raw-title-priority", [1, 2, 3, 4, 5, 6], [1], {
    excludedIds: ids(23),
    expectedTier: "raw-title",
  }),
  golden(2, "雲嶺記", "traditional-raw-title", [1, 2, 3, 4, 5, 6], [3], {
    excludedIds: ids(23),
    expectedTier: "raw-title",
  }),
  golden(3, "云峰小记", "approved-alias", [1], [1], {
    expectedTier: "raw-alias",
  }),
  golden(4, "雲峰錄", "traditional-approved-alias", [3], [3], {
    expectedTier: "raw-alias",
  }),
  golden(5, "林砚舟 春泉", "person-work-and", [9], [9], {
    excludedIds: ids(1, 10, 11),
  }),
  golden(6, "春泉 林砚舟", "person-work-reversed-and", [9], [9], {
    excludedIds: ids(1, 10, 11),
  }),
  golden(7, "林砚舟 远岫", "person-work-and", [10], [10], {
    excludedIds: ids(1, 9),
  }),
  golden(8, "沈墨禾 春泉", "person-work-and", [11], [11], {
    excludedIds: ids(9, 21),
  }),
  golden(9, "林砚舟 春泉", "kind-filter-zero", [], [], {
    kind: "calligraphy",
    excludedIds: ids(9),
  }),
  golden(10, "林砚舟 春泉", "kind-filter-positive", [9], [9], {
    kind: "inscription",
  }),
  golden(11, "书谱", "two-han-characters", [8], [8], {
    expectedTier: "title-alias-partial",
    notes:
      "The two-character query is authorized; the matched record and its prose are invented.",
  }),
  golden(12, "書譜", "two-han-traditional", [8], [8], {
    expectedTier: "title-alias-partial",
  }),
  golden(13, "翰墨练习册", "approved-alias", [8], [8], {
    expectedTier: "raw-alias",
  }),
  golden(14, "碑", "one-han-character", [12, 13], [12], {
    expectedTier: "raw-title",
  }),
  golden(15, "寒泉", "two-han-partial", [13], [13], {
    expectedTier: "title-alias-partial",
  }),
  golden(16, "篆", "one-han-script-style", [20], [20], {
    expectedTier: "structured",
  }),
  golden(17, "拟青朝", "dynasty", [1], [1], { expectedTier: "structured" }),
  golden(18, "擬青朝", "dynasty-traditional", [1], [1], {
    expectedTier: "structured",
  }),
  golden(19, "拟青三年", "period-label", [1], [1], {
    expectedTier: "structured",
  }),
  golden(20, "春三月", "date-text", [1], [1], { expectedTier: "structured" }),
  golden(21, "澄石省", "province", [20], [20], { expectedTier: "structured" }),
  golden(22, "流泉府", "prefecture", [20], [20], {
    expectedTier: "structured",
  }),
  golden(23, "竹影县", "county", [20], [20], { expectedTier: "structured" }),
  golden(24, "素砚展室", "current-location", [20, 21], [20, 21], {
    expectedTier: "structured",
  }),
  golden(25, "虚构青石保管所", "current-custodian", [20], [20], {
    expectedTier: "structured",
  }),
  golden(26, "行草", "script-style", [1], [1], { expectedTier: "structured" }),
  golden(27, "沈墨禾 素砚", "person-location-and", [21], [21], {
    excludedIds: ids(11, 20),
  }),
  golden(28, "棠花微雨", "summary-body", [17], [17], { expectedTier: "body" }),
  golden(29, "铜声入夜", "description-body", [18], [18], {
    expectedTier: "body",
  }),
  golden(30, "石径微霜", "transcription-body", [19], [19], {
    expectedTier: "body",
  }),
  golden(31, "石徑微霜", "transcription-traditional", [19], [19], {
    expectedTier: "body",
  }),
  golden(32, "春風題記", "traditional-raw-title", [16], [16], {
    expectedTier: "raw-title",
  }),
  golden(33, "春风题记", "simplified-query-traditional-title", [16], [16], {
    expectedTier: "normalized-exact",
  }),
  golden(34, "蘭溪習字札", "traditional-raw-title", [14], [14], {
    expectedTier: "raw-title",
  }),
  golden(35, "兰溪习字", "normalized-partial", [14, 15], [14, 15], {
    expectedTier: "title-alias-partial",
  }),
  golden(36, "远山帖", "simplified-raw-before-normalized", [27, 28, 29], [28], {
    expectedTier: "raw-title",
  }),
  golden(37, "遠山帖", "traditional-title-before-alias", [27, 28, 29], [27], {
    expectedTier: "raw-title",
  }),
  golden(38, "秋灯别录", "raw-title-before-alias", [30, 31], [31], {
    expectedTier: "raw-title",
  }),
  golden(39, "秋燈別錄", "normalized-title-alias-tie", [30, 31], [30, 31], {
    expectedTier: "normalized-exact",
  }),
  golden(40, "重遊竹徑記", "traditional-query-simplified-title", [33], [33], {
    expectedTier: "normalized-exact",
  }),
  golden(41, "泉声十二航", "near-only", [34], [34], {
    expectedTier: "near",
    notes:
      "An intentionally wrong final character; any returned result must remain labeled approximate.",
  }),
  golden(42, "松风入砚", "traditional-simplified-partial", [35, 36], [35, 36], {
    expectedTier: "title-alias-partial",
  }),
  golden(43, "松風入硯記", "raw-before-partial", [35, 36], [35], {
    expectedTier: "raw-title",
  }),
  golden(44, "溪月 图记", "same-document-title-and", [37, 38], [37], {
    notes:
      "Both query terms must occur in one document; title combination outranks title-plus-body.",
  }),
  golden(45, "图记 溪月", "same-document-reversed-and", [37, 38], [37]),
  golden(46, "合成排除题记", "visibility-zero", [], [], {
    excludedIds: ids(22),
  }),
  golden(47, "云岭记", "kind-filter-alias-before-normalized", [2, 3, 6], [2], {
    kind: "calligraphy",
    expectedTier: "raw-alias",
    excludedIds: ids(1, 4, 5, 23),
  }),
  golden(48, "云岭记", "kind-and-visibility", [1, 4, 5], [1], {
    kind: "inscription",
    expectedTier: "raw-title",
    excludedIds: ids(2, 3, 6, 23),
  }),
  golden(49, "不可检索探针甲", "unsupplied-field-exclusion", [], [], {
    excludedIds: ids(24),
  }),
  golden(50, "不可检索探针乙", "unknown-field-exclusion", [], [], {
    excludedIds: ids(24),
  }),
  golden(51, "不可检索探针丙", "clear-field-exclusion", [], [], {
    excludedIds: ids(25),
  }),
  golden(52, "不可检索探针丁", "not-applicable-field-exclusion", [], [], {
    excludedIds: ids(25),
  }),
  golden(53, "独立压力词甲", "historical-context-not-in-main", [], [], {
    excludedIds: ids(26),
  }),
  golden(54, "独立压力词乙", "scholarly-research-not-in-main", [], [], {
    excludedIds: ids(26),
  }),
  golden(55, "火星海底碑无此篇", "no-result", [], []),
  golden(56, "春泉题记 棠花微雨", "cross-document-and-zero", [], [], {
    excludedIds: ids(9, 17),
  }),
  golden(57, "  书谱  ", "outer-whitespace", [8], [8], {
    expectedTier: "title-alias-partial",
  }),
  golden(58, "泉声十二行", "near-target-exact-control", [34], [34], {
    expectedTier: "raw-title",
  }),
];

/**
 * These 26 synthetic queries plus the 24 separately judged public queries form
 * the primary 50. They retain every structured field, all three body fields,
 * two-character simplified/traditional input, ranking, same-document AND,
 * filtering, visibility, non-VALUE states and stress-field exclusion. Single
 * character and additional collision/order controls remain supplementary.
 * Each group is scored only against its own corpus; these IDs do not authorize
 * mixing public, synthetic or privately supplied Catalog identities.
 */
export const primarySyntheticQueryIds = [
  "q-01",
  "q-05",
  "q-11",
  "q-12",
  "q-17",
  "q-19",
  "q-20",
  "q-21",
  "q-22",
  "q-23",
  "q-24",
  "q-25",
  "q-26",
  "q-28",
  "q-29",
  "q-30",
  "q-41",
  "q-46",
  "q-47",
  "q-49",
  "q-50",
  "q-51",
  "q-52",
  "q-53",
  "q-54",
  "q-56",
];

/** Stable xorshift32 generator. It does not use clocks, locale, or I/O. */
const randomSource = (seed) => {
  if (!Number.isSafeInteger(seed))
    throw new TypeError("seed must be a safe integer");
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
};

const scaleSubjects = [
  "山雨",
  "江潮",
  "竹露",
  "荷风",
  "古砚",
  "石灯",
  "雾谷",
  "秋溪",
  "雪汀",
  "苔阶",
  "书谱",
  "兰溪",
  "松风",
  "素砚",
  "云岭",
  "泉声",
  "荷風",
  "古硯",
  "石燈",
  "霧谷",
  "苔階",
  "書譜",
  "蘭溪",
  "松風",
  "素硯",
  "雲嶺",
  "泉聲",
];
const scaleActions = [
  "听雨",
  "观石",
  "习字",
  "临池",
  "试墨",
  "摹形",
  "记游",
  "题壁",
  "望月",
  "寻幽",
  "访泉",
  "读碑",
];
const scaleForms = [
  "记",
  "札",
  "录",
  "题记",
  "练习稿",
  "杂写长卷",
  "十二行",
  "小笺",
];
const scaleClauses = [
  "此段文字为扩容实验逐项组合而成。",
  "纸边画出远树，石面留有浅淡的墨线。",
  "练习先写短字，再接长句，末行收笔。",
  "春云聚散，秋水明灭，所记均为虚构景象。",
  "读字者比较横画与竖画，不作真实年代判断。",
  "题名、别称与叙述只是本次检索的合成材料。",
];

/**
 * Returns exactly count records including the 40 anchors. The generated part
 * varies topic frequency, 1–3 contributors, 0–3 aliases, supplied fields,
 * body lengths and visibility. Repeated topics are intentional distractors;
 * generated labels have no Golden relevance judgments. A 5% long-body cohort
 * and a 20% medium-body cohort supplement short and absent body cohorts.
 * This is a reproducible synthetic distribution, not a production forecast.
 */
export function generateScaleCorpus(count, seed = 20260907) {
  if (
    !Number.isSafeInteger(count) ||
    count < corpus.length ||
    count > 100_000
  ) {
    throw new RangeError("count must be an integer from 40 through 100000");
  }
  const random = randomSource(seed);
  const pick = (items) => items[Math.floor(random() * items.length)];
  const weightedSubject = () => {
    const weight = random();
    return weight < 0.35
      ? scaleSubjects[0]
      : weight < 0.55
        ? scaleSubjects[1]
        : pick(scaleSubjects);
  };
  const composeBody = (subject, action, clauses) => {
    const pieces = [`合成主题${subject}，练习${action}。`];
    for (let part = 0; part < clauses; part += 1) {
      pieces.push(
        `${pick(scaleSubjects)}${pick(scaleActions)}，${pick(scaleClauses)}`,
      );
    }
    return pieces.join("");
  };
  const records = globalThis.structuredClone(corpus);
  for (let index = records.length; index < count; index += 1) {
    const subject = weightedSubject();
    const action = pick(scaleActions);
    const form = pick(scaleForms);
    const serial = String(index + 1).padStart(6, "0");
    const lengthClass = random();
    const clauses =
      lengthClass < 0.05
        ? 160 + Math.floor(random() * 300)
        : lengthClass < 0.25
          ? 12 + Math.floor(random() * 36)
          : 1 + Math.floor(random() * 5);
    const aliasCount = Math.floor(random() * 4);
    const contributorCount = 1 + Math.floor(random() * 3);
    const generated = record(
      index + 1,
      `${subject}${action}${form}第${serial}样`,
      {
        id: `scale-${serial}`,
        generated: true,
        kind: random() < 0.5 ? "inscription" : "calligraphy",
        visible: random() >= 0.03,
        aliases: Array.from(
          { length: aliasCount },
          (_, position) =>
            `${subject}${pick(scaleForms)}${serial}别称${position + 1}`,
        ),
        contributors: Array.from(
          { length: contributorCount },
          (_, position) => ({
            name: `虚构${pick(["林", "沈", "顾", "岑", "方", "乔"])}${pick(["砚", "墨", "溪", "苔", "舟", "禾"])}书者${Math.floor(random() * 100)}号第${position + 1}位`,
            role: position === 0 ? "textAuthor" : "calligrapher",
          }),
        ),
        periodLabel: `拟合纪元第${1 + Math.floor(random() * 40)}期`,
        dynasty: value(`拟合${pick(["青", "白", "玄", "赤"])}朝`),
        dateText: value(
          `拟合${1 + Math.floor(random() * 100)}年${pick(["春", "夏", "秋", "冬"])}`,
        ),
        scriptStyle:
          random() < 0.85
            ? value(pick(["楷书", "行书", "草书", "隶书", "小篆"]))
            : unsupplied(),
        province: value(
          `虚构${pick(["澄", "湛", "浅", "青"])}${pick(["石", "泉", "竹", "云"])}省`,
        ),
        prefecture: value(`虚构${subject}府`),
        county: value(`虚构${action}县`),
        currentLocation:
          random() < 0.8 ? value(`虚构${subject}陈列室`) : unsupplied(),
        currentCustodian:
          random() < 0.7 ? value(`虚构${action}保管所`) : unsupplied(),
        ...(random() < 0.75
          ? {
              summary: composeBody(
                subject,
                action,
                1 + Math.floor(random() * 4),
              ),
            }
          : {}),
        ...(random() < 0.65
          ? { description: composeBody(subject, action, Math.min(clauses, 80)) }
          : {}),
        transcription:
          random() < 0.75
            ? value(composeBody(subject, action, clauses))
            : unsupplied(),
      },
    );
    records.push(generated);
  }
  return records;
}
