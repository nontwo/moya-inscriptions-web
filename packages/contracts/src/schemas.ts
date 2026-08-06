// ============================================================
// 摩崖碑刻数字平台 - Zod 数据校验 Schema
// 用于数据导入、API 响应、Mock 数据验证
// ============================================================

import { z } from "zod";

// 基础枚举 Schema
export const publicationStatusSchema = z.enum([
  "draft",
  "review",
  "published",
  "archived",
]);
export const dynastySchema = z.enum([
  "商",
  "周",
  "秦",
  "汉",
  "三国",
  "晋",
  "南北朝",
  "隋",
  "唐",
  "五代",
  "宋",
  "辽",
  "金",
  "元",
  "明",
  "清",
  "民国",
  "现代",
]);
export const categorySchema = z.enum([
  "摩崖题记",
  "碑碣",
  "造像题记",
  "墓志铭",
  "题名题记",
  "刻经",
  "其他",
]);
export const scriptTypeSchema = z.enum([
  "篆书",
  "隶书",
  "楷书",
  "行书",
  "草书",
  "混合书体",
  "其他",
]);
export const regionLevelSchema = z.enum(["province", "city", "county"]);
export const imageRoleSchema = z.enum([
  "cover",
  "overview",
  "context",
  "detail",
  "inscription_detail",
  "reference",
]);
export const referenceTypeSchema = z.enum([
  "论文",
  "图录",
  "地方志",
  "网页",
  "专著",
  "其他",
]);
export const relationTypeSchema = z.enum([
  "撰文",
  "书丹",
  "刻工",
  "师生",
  "同僚",
  "出资",
  "监造",
  "相关",
]);
export const coordinateSystemSchema = z.enum(["WGS84", "GCJ02", "BD09"]);
export const logLevelSchema = z.enum(["DEBUG", "INFO", "WARNING", "ERROR"]);

// 地理坐标
export const geoLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  coordinateSystem: coordinateSystemSchema,
  precision: z.enum(["exact", "approximate", "area"]),
  altitude: z.number().optional(),
  address: z.string().min(1),
});

// 书法特征
export const calligraphyFeaturesSchema = z.object({
  brushwork: z.string().min(1),
  structure: z.string().min(1),
  composition: z.string().min(1),
  style: z.string().min(1),
  features: z.string(),
  significance: z.string(),
});

// 图片标注
export const imageAnnotationSchema = z.object({
  id: z.string(),
  imageId: z.string(),
  label: z.string().min(1),
  description: z.string(),
  characterInfo: z.string().optional(),
  calligraphyNote: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

// 图片资源
export const imageAssetSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  objectKey: z.string().min(1),
  thumbnailKey: z.string().min(1),
  displayKey: z.string().min(1),
  originalKey: z.string().min(1),
  caption: z.string(),
  description: z.string(),
  imageType: imageRoleSchema,
  sortOrder: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fileSize: z.number().int().positive(),
  format: z.string(),
  exifData: z
    .object({
      camera: z.string().optional(),
      lens: z.string().optional(),
      focalLength: z.string().optional(),
      aperture: z.string().optional(),
      shutterSpeed: z.string().optional(),
      iso: z.number().optional(),
      dateTaken: z.string().optional(),
      gpsLatitude: z.number().optional(),
      gpsLongitude: z.number().optional(),
    })
    .optional(),
  annotations: z.array(imageAnnotationSchema),
  publicationStatus: publicationStatusSchema,
  sha256: z.string().length(64),
  uploadedAt: z.string(),
});

// 参考来源
export const referenceSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  author: z.string().min(1),
  year: z.number().int(),
  sourceType: referenceTypeSchema,
  publisher: z.string().optional(),
  url: z.string().url().optional(),
  citationText: z.string().min(1),
  pages: z.string().optional(),
});

// 书家摘要
export const calligrapherSummarySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  courtesyName: z.string(),
  artName: z.string(),
  dynasty: dynastySchema,
  shortBio: z.string(),
  avatarUrl: z.string().optional(),
  workCount: z.number().int().min(0),
});

// 碑刻摘要
export const siteSummarySchema = z.object({
  id: z.string(),
  siteCode: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  alias: z.array(z.string()),
  dynasty: dynastySchema,
  dynastyYear: z.string(),
  category: categorySchema,
  scriptType: scriptTypeSchema,
  calligrapher: z.string(),
  region: z.object({
    province: z.string(),
    city: z.string(),
    county: z.string(),
  }),
  summary: z.string(),
  coverImage: z.string(),
  coverThumbnail: z.string(),
  tags: z.array(z.string()),
  pinyinIndex: z.string(),
  publicationStatus: publicationStatusSchema,
});

// 碑刻详情
export const siteDetailSchema = siteSummarySchema.extend({
  fullTitle: z.string().min(1),
  location: geoLocationSchema,
  dimensions: z.string(),
  wordCount: z.number().int().min(0),
  engraver: z.string(),
  inscriber: z.string(),
  preservationStatus: z.string(),
  investigationDate: z.string(),
  calligraphyFeatures: calligraphyFeaturesSchema,
  fullDescription: z.string(),
  researchNotes: z.string(),
  images: z.array(imageAssetSchema),
  references: z.array(referenceSchema),
  relatedSites: z.array(siteSummarySchema),
  calligraphers: z.array(calligrapherSummarySchema),
  calligraphyWorks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      scriptType: scriptTypeSchema,
      style: z.string(),
      dynasty: dynastySchema,
      calligrapherName: z.string(),
      currentLocation: z.string(),
      siteId: z.string().optional(),
    }),
  ),
  seoTitle: z.string(),
  seoDescription: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// 搜索查询
export const searchQuerySchema = z.object({
  keyword: z.string(),
  dynasty: dynastySchema.optional(),
  category: categorySchema.optional(),
  scriptType: scriptTypeSchema.optional(),
  calligrapher: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  tags: z.array(z.string()).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["title", "dynasty", "createdAt", "relevance"]).optional(),
});

// 日志条目
export const logEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  level: logLevelSchema,
  module: z.string(),
  function: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  context: z.object({
    route: z.string(),
    searchQuery: z.string().optional(),
    userAgent: z.string(),
    screenSize: z.string(),
    browserInfo: z.string(),
    extra: z.record(z.unknown()).optional(),
  }),
});
