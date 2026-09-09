import { randomUUID } from "node:crypto";

import type { Field } from "payload";

import type { EditorialStatefulField } from "@moya/contracts/internal/editorial";

const stateLabels = {
  VALUE: "有值",
  UNSUPPLIED: "未提供",
  UNKNOWN: "未知",
  NOT_APPLICABLE: "不适用",
  CLEAR: "明确清空",
} as const;

const statefulText = (
  name: EditorialStatefulField,
  label: string,
  maxLength: number,
  factual = false,
): Field => ({
  name,
  type: "group",
  label,
  admin: {
    description:
      "原文逐字保存，不转换繁简或标点。非“有值”状态请清空原文；首尾空白会提示修正。",
  },
  fields: [
    {
      name: "state",
      type: "select",
      label: "资料状态",
      defaultValue: "UNSUPPLIED",
      required: true,
      options: (factual
        ? ([
            "VALUE",
            "UNSUPPLIED",
            "UNKNOWN",
            "NOT_APPLICABLE",
            "CLEAR",
          ] as const)
        : (["VALUE", "UNSUPPLIED", "CLEAR"] as const)
      ).map((value) => ({ label: stateLabels[value], value })),
    },
    {
      name: "value",
      type: "textarea",
      label: "原文（有值时填写）",
      maxLength,
    },
  ],
});

/** Native Payload fields; no JSON editor, alternate form or rich-text conversion. */
export const editorialFields: Field[] = [
  {
    name: "catalogId",
    type: "text",
    label: "CatalogId（固定身份）",
    required: true,
    maxLength: 128,
    unique: true,
    index: true,
    defaultValue: () => `catalog-${randomUUID()}`,
    admin: {
      position: "sidebar",
      description: "新建时独立生成，已有目录须沿用原身份；创建后不可变更。",
    },
  },
  {
    name: "sourceId",
    type: "text",
    label: "SourceId（固定来源身份）",
    required: true,
    maxLength: 128,
    unique: true,
    index: true,
    defaultValue: () => `source-${randomUUID()}`,
    admin: {
      position: "sidebar",
      description:
        "新建时独立生成，已有来源须沿用已保存的映射；不得由名称或 CatalogId 推导。",
    },
  },
  {
    name: "kind",
    type: "select",
    label: "类型",
    required: true,
    options: [
      { label: "碑刻", value: "inscription" },
      { label: "书法", value: "calligraphy" },
    ],
  },
  {
    name: "title",
    type: "text",
    label: "名称",
    maxLength: 500,
    admin: { description: "草稿可暂缺；发布时必须填写。" },
  },
  {
    name: "summary",
    type: "textarea",
    label: "列表摘要",
    maxLength: 2_000,
  },
  { name: "periodLabel", type: "text", label: "年代显示文字", maxLength: 200 },
  statefulText("dynasty", "朝代", 500, true),
  statefulText("dateText", "年代原文", 500, true),
  statefulText("province", "省级地域", 500, true),
  statefulText("prefecture", "府市地域", 500, true),
  statefulText("county", "区县地域", 500, true),
  statefulText("currentLocation", "现所在地", 500, true),
  statefulText("currentCustodian", "现收藏或保管者", 500, true),
  statefulText("description", "简介", 20_000),
  statefulText("scriptStyle", "书体", 2_000, true),
  statefulText("transcription", "释文", 100_000),
  statefulText("historicalContext", "历史背景", 20_000),
  statefulText("scholarlyResearch", "学术研究", 20_000),
  {
    name: "aliases",
    type: "array",
    label: "别名",
    labels: { singular: "别名", plural: "别名" },
    fields: [
      {
        name: "alias",
        type: "text",
        label: "别名原文",
        required: true,
        maxLength: 500,
      },
      {
        name: "aliasType",
        type: "select",
        label: "别名类型",
        required: true,
        options: [
          { label: "其他名称", value: "alternate" },
          { label: "历史名称", value: "historical" },
        ],
      },
    ],
  },
  {
    name: "provenance",
    type: "array",
    label: "来源记录（内部）",
    labels: { singular: "来源记录", plural: "来源记录" },
    admin: { description: "随本条目录版本保存；不直接成为公开资料来源。" },
    fields: [
      {
        name: "sourceId",
        type: "text",
        label: "SourceId",
        required: true,
        maxLength: 128,
      },
      { name: "sourceTitle", type: "text", label: "来源名称", maxLength: 500 },
      {
        name: "sourceTypeRaw",
        type: "text",
        label: "来源类型原文",
        maxLength: 200,
      },
      { name: "sourceUrl", type: "text", label: "来源链接", maxLength: 2_048 },
      {
        name: "sourceNote",
        type: "textarea",
        label: "来源说明",
        maxLength: 2_000,
      },
    ],
  },
  {
    name: "contributors",
    type: "array",
    label: "作者与书者",
    labels: { singular: "贡献者", plural: "贡献者" },
    maxRows: 50,
    fields: [
      {
        name: "name",
        type: "text",
        label: "姓名原文",
        required: true,
        maxLength: 500,
      },
      {
        name: "role",
        type: "select",
        label: "角色",
        required: true,
        options: [
          { label: "撰文者", value: "textAuthor" },
          { label: "书写者", value: "calligrapher" },
        ],
      },
    ],
  },
  {
    name: "sourceCitations",
    type: "array",
    label: "公开资料来源",
    labels: { singular: "公开引用", plural: "公开引用" },
    fields: [
      {
        name: "label",
        type: "text",
        label: "显示名称",
        required: true,
        maxLength: 500,
      },
      {
        name: "citation",
        type: "textarea",
        label: "引用文字",
        maxLength: 2_000,
      },
      { name: "url", type: "text", label: "公开链接" },
      {
        name: "appliesTo",
        type: "select",
        label: "引用范围",
        hasMany: true,
        options: [
          { label: "整条记录", value: "record" },
          { label: "简介", value: "description" },
          { label: "释文", value: "transcription" },
          { label: "历史背景", value: "historicalContext" },
          { label: "学术研究", value: "scholarlyResearch" },
        ],
      },
    ],
  },
  {
    name: "mediaPicker",
    type: "ui",
    label: "媒体选择",
    admin: {
      components: {
        Field: "./src/media/MediaSnapshotPicker#MediaSnapshotPicker",
      },
    },
  },
  {
    name: "media",
    type: "array",
    label: "图片与排序",
    labels: { singular: "图片", plural: "图片" },
    admin: {
      description:
        "从上方原生媒体库添加图片。可拖动图片行并同步顺序；有图需指定一张代表图。无图也可发布。",
    },
    fields: [
      {
        name: "mediaId",
        type: "text",
        label: "MediaId",
        admin: { readOnly: true, hidden: true },
        required: true,
        maxLength: 128,
      },
      {
        name: "objectKey",
        type: "text",
        label: "存储对象键",
        admin: { readOnly: true, hidden: true },
        required: true,
        maxLength: 2_048,
      },
      {
        name: "width",
        type: "number",
        label: "宽度（像素）",
        admin: { readOnly: true },
        required: true,
        min: 1,
      },
      {
        name: "height",
        type: "number",
        label: "高度（像素）",
        admin: { readOnly: true },
        required: true,
        min: 1,
      },
      {
        name: "alt",
        type: "textarea",
        label: "图片说明",
        required: true,
        maxLength: 2_000,
      },
      {
        name: "position",
        type: "number",
        label: "排序序号（从零起）",
        required: true,
        min: 0,
        max: 2_147_483_647,
      },
      {
        name: "isRepresentative",
        type: "checkbox",
        label: "作为代表图",
        defaultValue: false,
      },
      {
        name: "rights",
        type: "textarea",
        label: "图片权利说明",
        admin: { readOnly: true },
        maxLength: 2_000,
      },
      {
        name: "orderConfidence",
        type: "select",
        label: "排序可信度",
        admin: { readOnly: true },
        options: [
          { label: "高", value: "HIGH" },
          { label: "低（保留不确定性）", value: "LOW" },
        ],
      },
    ],
  },
  {
    name: "ownerNote",
    type: "textarea",
    label: "内部备注",
    maxLength: 2_000,
    admin: { description: "仅供内部编辑，不进入 Public API。" },
  },
];
