import {
  CATALOG_IMPORT_ALIAS_HEADERS,
  CATALOG_IMPORT_CATALOG_HEADERS,
  CATALOG_IMPORT_PROVENANCE_HEADERS,
  CATALOG_IMPORT_SHEET_NAMES,
  CATALOG_IMPORT_WORKBOOK_SPEC,
} from "./specification.js";

export const CATALOG_IMPORT_XLSX_LAYOUT_VERSION =
  "catalog-import-xlsx/v1" as const;

export const CATALOG_IMPORT_PRESENTATION_REQUIREDNESS = [
  "REQUIRED",
  "OPTIONAL",
  "UPDATE_ONLY",
  "CHILD_ROW_REQUIRED",
] as const;

type PresentationRequiredness =
  (typeof CATALOG_IMPORT_PRESENTATION_REQUIREDNESS)[number];

export const CATALOG_IMPORT_PRESENTATION_REQUIREDNESS_LABELS = {
  REQUIRED: "必填",
  OPTIONAL: "选填",
  UPDATE_ONLY: "更新时填",
  CHILD_ROW_REQUIRED: "子表行必填",
} as const satisfies Record<PresentationRequiredness, string>;

const presentationHeaderSuffixes = {
  REQUIRED: "【必填】",
  OPTIONAL: "",
  UPDATE_ONLY: "【更新时填】",
  CHILD_ROW_REQUIRED: "【必填】",
} as const satisfies Record<PresentationRequiredness, string>;

export const formatCatalogImportPresentationHeader = (
  presentationHeader: string,
  requiredness: PresentationRequiredness,
): string => `${presentationHeader}${presentationHeaderSuffixes[requiredness]}`;

type ValidationName =
  "catalogKind" | "fieldState" | "descriptionState" | "aliasType";

interface WorkbookFieldLayout<Header extends string> {
  readonly machineHeader: Header;
  readonly presentationHeader: string;
  readonly requiredness: PresentationRequiredness;
  readonly guidance: string;
  readonly example: string;
  readonly width: number;
  readonly textPreserving?: true;
  readonly validation?: ValidationName;
  readonly stateColumn?: true;
  readonly wrap?: true;
}

const catalogFields = [
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[0],
    presentationHeader: "批次内关联 ID",
    requiredness: "REQUIRED",
    guidance: "同一批次内关联主表与子表；不是 Catalog 的永久身份。",
    example: "synthetic-item-001",
    width: 22,
    textPreserving: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[1],
    presentationHeader: "来源 ID",
    requiredness: "REQUIRED",
    guidance: "来源记录身份；不得与 catalogId 混用。",
    example: "synthetic-source-001",
    width: 20,
    textPreserving: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[2],
    presentationHeader: "平台目录 ID",
    requiredness: "UPDATE_ONLY",
    guidance: "新建时留空；更新时填写不可变的既有 Catalog 目标。",
    example: "synthetic-catalog-001",
    width: 22,
    textPreserving: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[3],
    presentationHeader: "题名",
    requiredness: "REQUIRED",
    guidance: "条目的主要题名。",
    example: "合成示例题名",
    width: 28,
    wrap: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[4],
    presentationHeader: "类别",
    requiredness: "REQUIRED",
    guidance: "只选择 inscription 或 calligraphy。",
    example: "inscription",
    width: 18,
    validation: "catalogKind",
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[5],
    presentationHeader: "朝代",
    requiredness: "OPTIONAL",
    guidance: "原始事实文本；与右侧状态配对。",
    example: "唐（synthetic）",
    width: 18,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[6],
    presentationHeader: "朝代状态",
    requiredness: "OPTIONAL",
    guidance: "留空等同 UNSUPPLIED；blank 不删除。",
    example: "VALUE",
    width: 20,
    validation: "fieldState",
    stateColumn: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[7],
    presentationHeader: "年代文本",
    requiredness: "OPTIONAL",
    guidance: "不规范化的年代描述；与右侧状态配对。",
    example: "贞观年间（synthetic）",
    width: 22,
    wrap: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[8],
    presentationHeader: "年代状态",
    requiredness: "OPTIONAL",
    guidance: "VALUE / UNSUPPLIED / UNKNOWN / NOT_APPLICABLE / CLEAR。",
    example: "VALUE",
    width: 20,
    validation: "fieldState",
    stateColumn: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[9],
    presentationHeader: "省级行政区",
    requiredness: "OPTIONAL",
    guidance: "行政区事实，例如“福建省”；不是地点名称。",
    example: "福建省（synthetic）",
    width: 20,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[10],
    presentationHeader: "省级状态",
    requiredness: "OPTIONAL",
    guidance: "与省级行政区配对。",
    example: "VALUE",
    width: 20,
    validation: "fieldState",
    stateColumn: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[11],
    presentationHeader: "地市级行政区",
    requiredness: "OPTIONAL",
    guidance: "行政区事实，例如“泉州市”。",
    example: "泉州市（synthetic）",
    width: 20,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[12],
    presentationHeader: "地市状态",
    requiredness: "OPTIONAL",
    guidance: "与地市级行政区配对。",
    example: "VALUE",
    width: 20,
    validation: "fieldState",
    stateColumn: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[13],
    presentationHeader: "区县级行政区",
    requiredness: "OPTIONAL",
    guidance: "行政区事实，例如“洛江区”。",
    example: "洛江区（synthetic）",
    width: 20,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[14],
    presentationHeader: "区县状态",
    requiredness: "OPTIONAL",
    guidance: "与区县级行政区配对。",
    example: "VALUE",
    width: 20,
    validation: "fieldState",
    stateColumn: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[15],
    presentationHeader: "当前地点",
    requiredness: "OPTIONAL",
    guidance: "具体地点或遗址名称，例如“万安某处（synthetic）”。",
    example: "万安某处（synthetic）",
    width: 28,
    wrap: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[16],
    presentationHeader: "地点状态",
    requiredness: "OPTIONAL",
    guidance: "与当前地点配对。",
    example: "VALUE",
    width: 20,
    validation: "fieldState",
    stateColumn: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[17],
    presentationHeader: "当前保管机构",
    requiredness: "OPTIONAL",
    guidance: "管理或保管主体；不是行政区或地点。",
    example: "某文物管理机构（synthetic）",
    width: 28,
    wrap: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[18],
    presentationHeader: "保管状态",
    requiredness: "OPTIONAL",
    guidance: "与当前保管机构配对。",
    example: "VALUE",
    width: 20,
    validation: "fieldState",
    stateColumn: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[19],
    presentationHeader: "描述",
    requiredness: "OPTIONAL",
    guidance: "描述文本；状态仅允许 VALUE / UNSUPPLIED / CLEAR。",
    example: "纯合成描述示例",
    width: 40,
    wrap: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[20],
    presentationHeader: "描述状态",
    requiredness: "OPTIONAL",
    guidance: "blank 不删除；CLEAR 会进入逐字段审批。",
    example: "VALUE",
    width: 20,
    validation: "descriptionState",
    stateColumn: true,
  },
  {
    machineHeader: CATALOG_IMPORT_CATALOG_HEADERS[21],
    presentationHeader: "内部备注",
    requiredness: "OPTIONAL",
    guidance:
      "仅供 Owner 审核；不发布。当前 supplied ownerNote 会 fail closed，不发生 Apply 写入。",
    example: "纯合成内部备注",
    width: 36,
    wrap: true,
  },
] as const satisfies readonly WorkbookFieldLayout<
  (typeof CATALOG_IMPORT_CATALOG_HEADERS)[number]
>[];

const aliasFields = [
  {
    machineHeader: CATALOG_IMPORT_ALIAS_HEADERS[0],
    presentationHeader: "批次内关联 ID",
    requiredness: "CHILD_ROW_REQUIRED",
    guidance: "必须指向 01_Catalog 的 catalogImportId。",
    example: "synthetic-item-001",
    width: 22,
    textPreserving: true,
  },
  {
    machineHeader: CATALOG_IMPORT_ALIAS_HEADERS[1],
    presentationHeader: "别名",
    requiredness: "CHILD_ROW_REQUIRED",
    guidance: "完整的别名文本。",
    example: "合成示例别名",
    width: 32,
    wrap: true,
  },
  {
    machineHeader: CATALOG_IMPORT_ALIAS_HEADERS[2],
    presentationHeader: "别名类型",
    requiredness: "CHILD_ROW_REQUIRED",
    guidance: "只选择 alternate 或 historical。",
    example: "alternate",
    width: 20,
    validation: "aliasType",
  },
] as const satisfies readonly WorkbookFieldLayout<
  (typeof CATALOG_IMPORT_ALIAS_HEADERS)[number]
>[];

const provenanceFields = [
  {
    machineHeader: CATALOG_IMPORT_PROVENANCE_HEADERS[0],
    presentationHeader: "批次内关联 ID",
    requiredness: "CHILD_ROW_REQUIRED",
    guidance: "必须指向 01_Catalog 的 catalogImportId。",
    example: "synthetic-item-001",
    width: 22,
    textPreserving: true,
  },
  {
    machineHeader: CATALOG_IMPORT_PROVENANCE_HEADERS[1],
    presentationHeader: "来源 ID",
    requiredness: "CHILD_ROW_REQUIRED",
    guidance: "来源记录身份；同一来源不得重新绑定 Catalog。",
    example: "synthetic-source-001",
    width: 20,
    textPreserving: true,
  },
  {
    machineHeader: CATALOG_IMPORT_PROVENANCE_HEADERS[2],
    presentationHeader: "来源题名",
    requiredness: "OPTIONAL",
    guidance: "来源材料的原始题名。",
    example: "合成示例来源",
    width: 30,
    wrap: true,
  },
  {
    machineHeader: CATALOG_IMPORT_PROVENANCE_HEADERS[3],
    presentationHeader: "原始来源类型",
    requiredness: "OPTIONAL",
    guidance: "修剪、限长的 raw metadata；不是规范化 taxonomy。",
    example: "地方旧志（synthetic）",
    width: 24,
    wrap: true,
  },
  {
    machineHeader: CATALOG_IMPORT_PROVENANCE_HEADERS[4],
    presentationHeader: "来源链接",
    requiredness: "OPTIONAL",
    guidance: "如填写，必须是完整 URL。",
    example: "https://example.invalid",
    width: 36,
    wrap: true,
  },
  {
    machineHeader: CATALOG_IMPORT_PROVENANCE_HEADERS[5],
    presentationHeader: "来源备注",
    requiredness: "OPTIONAL",
    guidance: "附加 raw provenance 备注。",
    example: "纯合成来源备注",
    width: 36,
    wrap: true,
  },
] as const satisfies readonly WorkbookFieldLayout<
  (typeof CATALOG_IMPORT_PROVENANCE_HEADERS)[number]
>[];

const validationDefinitions = {
  catalogKind: {
    values: CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.catalogKind,
    promptTitle: "目录类型 / CatalogKind",
    prompt: "请选择英文 machine value：inscription 或 calligraphy。",
  },
  fieldState: {
    values: CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.fieldState,
    promptTitle: "事实字段状态",
    prompt:
      "有值时留空或选 VALUE；空值可选 UNSUPPLIED、UNKNOWN、NOT_APPLICABLE 或 CLEAR。blank 不删除。",
  },
  descriptionState: {
    values: CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.descriptionState,
    promptTitle: "描述状态",
    prompt:
      "有描述时留空或选 VALUE；空值可选 UNSUPPLIED 或 CLEAR。blank 不删除。",
  },
  aliasType: {
    values: CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.aliasType,
    promptTitle: "别名类型 / aliasType",
    prompt: "请选择英文 machine value：alternate 或 historical。",
  },
} as const;

export const CATALOG_IMPORT_XLSX_LAYOUT_SPEC = {
  workbookLayoutVersion: CATALOG_IMPORT_XLSX_LAYOUT_VERSION,
  importContractVersion: CATALOG_IMPORT_WORKBOOK_SPEC.importContractVersion,
  sheetOrder: CATALOG_IMPORT_SHEET_NAMES,
  rowRoles: {
    presentationHeader: 1,
    machineHeader: 2,
    firstEditableRow: 3,
    lastEditableRow: 1_048_576,
  },
  dataSheets: {
    "01_Catalog": {
      tableName: "CatalogImportTable",
      tableRef: "A2:V3",
      freeze: { xSplit: 4, ySplit: 2, topLeftCell: "E3" },
      fields: catalogFields,
    },
    "02_Aliases": {
      tableName: "AliasImportTable",
      tableRef: "A2:C3",
      freeze: { xSplit: 1, ySplit: 2, topLeftCell: "B3" },
      fields: aliasFields,
    },
    "03_Provenance": {
      tableName: "ProvenanceImportTable",
      tableRef: "A2:F3",
      freeze: { xSplit: 2, ySplit: 2, topLeftCell: "C3" },
      fields: provenanceFields,
    },
  },
  validations: validationDefinitions,
  instructions: {
    title: "摩崖目录导入模板 — Owner 使用说明",
    sectionOrder: [
      "Owner 快速开始",
      "Identity / State / Location guidance",
      "Field Guide",
      "Advanced persistence / approval / hash notes",
      "Technical Metadata",
    ],
    metadata: {
      sectionCell: "A68",
      sectionLabel: "Technical Metadata",
      workbookLayoutVersion: {
        keyCell: "A69",
        valueCell: "B69",
        key: "workbookLayoutVersion",
        value: CATALOG_IMPORT_XLSX_LAYOUT_VERSION,
      },
      importContractVersion: {
        keyCell: "A70",
        valueCell: "B70",
        key: "importContractVersion",
        value: CATALOG_IMPORT_WORKBOOK_SPEC.importContractVersion,
      },
    },
  },
} as const;
