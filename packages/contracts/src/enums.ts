// ============================================================
// 摩崖碑刻数字平台 - 枚举定义
// 所有分类、朝代、书体等标准值统一在此定义
// 这是数据标准化的单一来源 (Single Source of Truth)
// ============================================================

/** 发布状态 */
export const PublicationStatus = {
  DRAFT: 'draft',
  REVIEW: 'review',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
} as const;
export type PublicationStatus = (typeof PublicationStatus)[keyof typeof PublicationStatus];

/** 朝代枚举（按时间顺序排列） */
export const Dynasty = {
  SHANG: '商',
  ZHOU: '周',
  QIN: '秦',
  HAN: '汉',
  THREE_KINGDOMS: '三国',
  JIN: '晋',
  NORTHERN_SOUTHERN: '南北朝',
  SUI: '隋',
  TANG: '唐',
  FIVE_DYNASTIES: '五代',
  SONG: '宋',
  LIAO: '辽',
  JIN_DYNASTY: '金',
  YUAN: '元',
  MING: '明',
  QING: '清',
  REPUBLIC: '民国',
  MODERN: '现代',
} as const;
export type Dynasty = (typeof Dynasty)[keyof typeof Dynasty];

/** 朝代排序权重（用于时间轴等排序场景） */
export const DYNASTY_ORDER: Record<Dynasty, number> = {
  [Dynasty.SHANG]: 1,
  [Dynasty.ZHOU]: 2,
  [Dynasty.QIN]: 3,
  [Dynasty.HAN]: 4,
  [Dynasty.THREE_KINGDOMS]: 5,
  [Dynasty.JIN]: 6,
  [Dynasty.NORTHERN_SOUTHERN]: 7,
  [Dynasty.SUI]: 8,
  [Dynasty.TANG]: 9,
  [Dynasty.FIVE_DYNASTIES]: 10,
  [Dynasty.SONG]: 11,
  [Dynasty.LIAO]: 12,
  [Dynasty.JIN_DYNASTY]: 13,
  [Dynasty.YUAN]: 14,
  [Dynasty.MING]: 15,
  [Dynasty.QING]: 16,
  [Dynasty.REPUBLIC]: 17,
  [Dynasty.MODERN]: 18,
};

/** 朝代对应的大致年份范围 */
export const DYNASTY_YEAR_RANGE: Record<Dynasty, [number, number]> = {
  [Dynasty.SHANG]: [-1600, -1046],
  [Dynasty.ZHOU]: [-1046, -256],
  [Dynasty.QIN]: [-221, -206],
  [Dynasty.HAN]: [-206, 220],
  [Dynasty.THREE_KINGDOMS]: [220, 280],
  [Dynasty.JIN]: [265, 420],
  [Dynasty.NORTHERN_SOUTHERN]: [420, 589],
  [Dynasty.SUI]: [581, 618],
  [Dynasty.TANG]: [618, 907],
  [Dynasty.FIVE_DYNASTIES]: [907, 960],
  [Dynasty.SONG]: [960, 1279],
  [Dynasty.LIAO]: [907, 1125],
  [Dynasty.JIN_DYNASTY]: [1115, 1234],
  [Dynasty.YUAN]: [1271, 1368],
  [Dynasty.MING]: [1368, 1644],
  [Dynasty.QING]: [1644, 1912],
  [Dynasty.REPUBLIC]: [1912, 1949],
  [Dynasty.MODERN]: [1949, 2026],
};

/** 碑刻类型 */
export const Category = {
  CLIFF_INSCRIPTION: '摩崖题记',
  STELE: '碑碣',
  STATUE_INSCRIPTION: '造像题记',
  EPITAPH: '墓志铭',
  QUOTATION: '题名题记',
  SUTRA: '刻经',
  OTHER: '其他',
} as const;
export type Category = (typeof Category)[keyof typeof Category];

/** 书体 */
export const ScriptType = {
  SEAL: '篆书',
  CLERICAL: '隶书',
  REGULAR: '楷书',
  RUNNING: '行书',
  CURSIVE: '草书',
  MIXED: '混合书体',
  OTHER: '其他',
} as const;
export type ScriptType = (typeof ScriptType)[keyof typeof ScriptType];

/** 地区级别 */
export const RegionLevel = {
  PROVINCE: 'province',
  CITY: 'city',
  COUNTY: 'county',
} as const;
export type RegionLevel = (typeof RegionLevel)[keyof typeof RegionLevel];

/** 图片角色 */
export const ImageRole = {
  COVER: 'cover',
  OVERVIEW: 'overview',
  CONTEXT: 'context',
  DETAIL: 'detail',
  INSCRIPTION_DETAIL: 'inscription_detail',
  REFERENCE: 'reference',
} as const;
export type ImageRole = (typeof ImageRole)[keyof typeof ImageRole];

/** 参考来源类型 */
export const ReferenceType = {
  PAPER: '论文',
  CATALOG: '图录',
  CHRONICLE: '地方志',
  WEB: '网页',
  BOOK: '专著',
  OTHER: '其他',
} as const;
export type ReferenceType = (typeof ReferenceType)[keyof typeof ReferenceType];

/** 关系类型 */
export const RelationType = {
  WRITER: '撰文',
  CALLIGRAPHER: '书丹',
  ENGRAVER: '刻工',
  MENTOR: '师生',
  COLLEAGUE: '同僚',
  PATRON: '出资',
  SUPERVISOR: '监造',
  RELATED: '相关',
} as const;
export type RelationType = (typeof RelationType)[keyof typeof RelationType];

/** 日志级别 */
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/** 坐标系类型 */
export const CoordinateSystem = {
  WGS84: 'WGS84',
  GCJ02: 'GCJ02',
  BD09: 'BD09',
} as const;
export type CoordinateSystem = (typeof CoordinateSystem)[keyof typeof CoordinateSystem];
