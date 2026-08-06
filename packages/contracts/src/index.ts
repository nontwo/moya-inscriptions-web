// ============================================================
// 摩崖碑刻数字平台 - Contracts 统一导出
// ============================================================

// 枚举
export * from './enums';

// 类型
export type {
  Region,
  DynastyInfo,
  GeoLocation,
  CalligraphyFeatures,
  SiteSummary,
  SiteDetail,
  ImageAnnotation,
  ImageAsset,
  ImageExif,
  CalligrapherSummary,
  CalligrapherDetail,
  CalligraphyWorkSummary,
  CalligraphyWorkDetail,
  Relation,
  GraphData,
  GraphNode,
  GraphEdge,
  Reference,
  Tag,
  SearchQuery,
  SearchResult,
  SearchSuggestion,
  PlatformStats,
  LogEntry,
  LogContext,
  ArchiveRepository,
} from './types';

// Schema
export {
  publicationStatusSchema,
  dynastySchema,
  categorySchema,
  scriptTypeSchema,
  regionLevelSchema,
  imageRoleSchema,
  referenceTypeSchema,
  relationTypeSchema,
  coordinateSystemSchema,
  logLevelSchema,
  geoLocationSchema,
  calligraphyFeaturesSchema,
  imageAnnotationSchema,
  imageAssetSchema,
  referenceSchema,
  calligrapherSummarySchema,
  siteSummarySchema,
  siteDetailSchema,
  searchQuerySchema,
  logEntrySchema,
} from './schemas';

// Mock Data
export {
  mockSites,
  mockRegions,
  mockDynasties,
  mockStats,
  mockCalligraphers,
  mockCalligraphyWorks,
  mockRelations,
  mockGraphData,
} from './mock-data';
