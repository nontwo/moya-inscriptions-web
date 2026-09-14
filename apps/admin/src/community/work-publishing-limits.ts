import type { SetWorkPublishingSettingsCommand } from "./api";

/**
 * The configurable work publishing limits as the Owner edits them, in a
 * readable unit (MiB, GiB, days, minutes). Counts, days and minutes are whole
 * numbers; byte limits are stored in whole MiB, and capacities may be entered
 * as GiB with up to three decimals so every value the contract allows stays
 * reachable. The bounds are exactly the operator settings contract's; the
 * Backend stores and enforces the values. A field the Owner did not edit keeps
 * its stored value exactly.
 */
export type WorkPublishingLimitName = Exclude<
  keyof SetWorkPublishingSettingsCommand,
  "requestId" | "expectedVersion" | "policy"
>;

export interface WorkPublishingLimitField {
  readonly name: WorkPublishingLimitName;
  readonly label: string;
  readonly unit: string;
  /** Bytes (or counts) represented by one display unit. */
  readonly scale: number;
  /** Decimal places the display unit accepts. */
  readonly decimals: 0 | 3;
  /** The stored granularity: an edited value is a whole multiple of it. */
  readonly step: number;
  /** Inclusive bounds in stored values (bytes or counts), as in the contract. */
  readonly minimum: number;
  readonly maximum: number;
  readonly hint: string;
}

const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;
const TEBIBYTE = 1024 * GIBIBYTE;

const count = { scale: 1, decimals: 0, step: 1 } as const;
const mebibytes = {
  unit: "MiB",
  scale: MEBIBYTE,
  decimals: 0,
  step: MEBIBYTE,
} as const;
const gibibytes = {
  unit: "GiB",
  scale: GIBIBYTE,
  decimals: 3,
  step: MEBIBYTE,
} as const;

export const WORK_PUBLISHING_LIMIT_FIELDS: readonly WorkPublishingLimitField[] =
  [
    {
      name: "maxItemsPerWork",
      label: "每件作品的媒体数量上限",
      unit: "项",
      ...count,
      minimum: 1,
      maximum: 100,
      hint: "一张实况照片计为 1 项，最多可设为 100 项。调低后只限制之后的添加与提交。",
    },
    {
      name: "originalItemMaxBytes",
      label: "原图画质单项大小上限",
      ...mebibytes,
      minimum: MEBIBYTE,
      maximum: 8 * GIBIBYTE,
      hint: "一项原图的全部文件合计（实况照片含静态与动态文件）；不设整件作品上限。",
    },
    {
      name: "standardComponentMaxBytes",
      label: "标准画质单个文件安全上限",
      ...mebibytes,
      minimum: MEBIBYTE,
      maximum: 8 * GIBIBYTE,
      hint: "浏览器优化后上传的单个文件在后端的安全上限，不是压缩目标。",
    },
    {
      name: "ordinaryAccountCapacityBytes",
      label: "普通账号容量",
      ...gibibytes,
      minimum: MEBIBYTE,
      maximum: TEBIBYTE,
      hint: "每个账号实际保存的媒体字节数，同一文件被多个版本引用只计一次。",
    },
    {
      name: "ownerAccountCapacityBytes",
      label: "Owner 账号容量",
      ...gibibytes,
      minimum: MEBIBYTE,
      maximum: TEBIBYTE,
      hint: "只适用于在「账号容量」中按账号 ID 指定为 Owner 的账号。",
    },
    {
      name: "maxActiveDrafts",
      label: "每个账号的草稿数量上限",
      unit: "个",
      ...count,
      minimum: 1,
      maximum: 10000,
      hint: "冲突副本不计入。达到上限后不能新建草稿，已有草稿不会被删除。",
    },
    {
      name: "dailyNewWorkLimit",
      label: "每日新作品提交上限",
      unit: "件",
      ...count,
      minimum: 1,
      maximum: 10000,
      hint: "按美国东部时间（America/New_York）自然日计算，只统计新作品的首次成功提交。",
    },
    {
      name: "historyLimit",
      label: "历史版本保留数量",
      unit: "个",
      ...count,
      minimum: 1,
      maximum: 200,
      hint: "每件作品或草稿保留的重要快照数量；调低后，之后保存时按新数量保留。固定保留的冲突副本不受此限制。",
    },
    {
      name: "trashRetentionDays",
      label: "回收站保留天数",
      unit: "天",
      ...count,
      minimum: 1,
      maximum: 365,
      hint: "作品移入回收站时按当时的设置计算清除时间。",
    },
    {
      name: "orphanGraceDays",
      label: "未引用媒体清理宽限",
      unit: "天",
      ...count,
      minimum: 1,
      maximum: 90,
      hint: "已不被任何草稿、版本或临时会话引用的媒体，在清理前保留的天数。",
    },
    {
      name: "unsavedSessionLeaseMinutes",
      label: "不保存草稿时的临时会话时长",
      unit: "分钟",
      ...count,
      minimum: 5,
      maximum: 10080,
      hint: "作者选择不保存草稿时，临时上传会话在无活动后保留的时长。",
    },
  ];

/** The editable text for a stored value; a fraction is shown to three decimals, never rounded to zero. */
export const limitDisplayValue = (
  field: WorkPublishingLimitField,
  stored: number,
): string =>
  stored % field.scale === 0
    ? String(stored / field.scale)
    : String(Math.max(0.001, Math.round((stored / field.scale) * 1000) / 1000));

/** The inclusive range in readable units, for hints and messages. */
export const limitRangeText = (field: WorkPublishingLimitField): string =>
  field.scale === 1
    ? `${field.minimum}–${field.maximum} ${field.unit}`
    : `${formatBytes(field.minimum)} – ${formatBytes(field.maximum)}`;

export type LimitInputResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly message: string };

/**
 * Reads one field. A field the Owner did not edit keeps the exact stored
 * value, however it displays. Edited text is a number in the field's unit
 * (whole, or with up to three decimals where the unit allows), converted to
 * a whole multiple of the field's step and checked against the contract
 * bounds.
 */
export const readLimitInput = (
  field: WorkPublishingLimitField,
  text: string,
  stored: number,
  edited: boolean,
): LimitInputResult => {
  if (!edited) return { ok: true, value: stored };
  const trimmed = text.trim();
  const pattern =
    field.decimals === 0 ? /^\d{1,10}$/u : /^\d{1,10}(?:\.\d{1,3})?$/u;
  if (!pattern.test(trimmed))
    return {
      ok: false,
      message:
        field.decimals === 0
          ? `请输入整数（${field.unit}），范围 ${limitRangeText(field)}。`
          : `请输入数字（${field.unit}，最多三位小数），范围 ${limitRangeText(field)}。`,
    };
  const value =
    Math.round((Number(trimmed) * field.scale) / field.step) * field.step;
  if (value < field.minimum || value > field.maximum)
    return { ok: false, message: `须在 ${limitRangeText(field)} 之间。` };
  return { ok: true, value };
};

const binaryUnits = [
  ["GiB", GIBIBYTE],
  ["MiB", MEBIBYTE],
  ["KiB", 1024],
] as const;

/** Binary units, at most two decimals, never a fabricated precision. */
export const formatBytes = (bytes: number): string => {
  for (const [unit, size] of binaryUnits)
    if (bytes >= size)
      return `${(Math.round((bytes / size) * 100) / 100).toLocaleString("zh-CN")} ${unit}`;
  return `${bytes} 字节`;
};
