// ============================================================
// 摩崖碑刻数字平台 - 核心数据模型类型定义
// 按数据实体分块，每个类型都有完整的注释说明
// ============================================================

import type {
  PublicationStatus,
  Dynasty,
  Category,
  ScriptType,
  RegionLevel,
  ImageRole,
  ReferenceType,
  RelationType,
  LogLevel,
  CoordinateSystem,
} from './enums';

// ============================================================
// 地区
// ============================================================

/** 地区树节点 */
export interface Region {
  id: string;
  parentId: string | null;
  name: string;
  fullName: string;
  level: RegionLevel;
  administrativeCode: string;
  siteCount: number;
  children?: Region[];
  /** 中国地图SVG中该地区的中心坐标 */
  mapCenter?: { x: number; y: number };
}

// ============================================================
// 朝代
// ============================================================

export interface DynastyInfo {
  id: string;
  name: Dynasty;
  order: number;
  yearStart: number;
  yearEnd: number;
  description: string;
  siteCount: number;
}

// ============================================================
// 碑刻点位（核心实体）
// ============================================================

/** 点位地理位置 */
export interface GeoLocation {
  latitude: number;
  longitude: number;
  coordinateSystem: CoordinateSystem;
  precision: 'exact' | 'approximate' | 'area';
  altitude?: number;
  address: string;
}

/** 书法特征描述 */
export interface CalligraphyFeatures {
  brushwork: string;
  structure: string;
  composition: string;
  style: string;
  features: string;
  significance: string;
}

/** 碑刻摘要（用于列表/卡片） */
export interface SiteSummary {
  id: string;
  siteCode: string;
  slug: string;
  title: string;
  alias: string[];
  dynasty: Dynasty;
  dynastyYear: string;
  category: Category;
  scriptType: ScriptType;
  calligrapher: string;
  region: { province: string; city: string; county: string };
  summary: string;
  coverImage: string;
  coverThumbnail: string;
  tags: string[];
  pinyinIndex: string;
  publicationStatus: PublicationStatus;
}

/** 碑刻详情（完整字段） */
export interface SiteDetail extends SiteSummary {
  fullTitle: string;
  location: GeoLocation;
  dimensions: string;
  wordCount: number;
  engraver: string;
  inscriber: string;
  preservationStatus: string;
  investigationDate: string;
  calligraphyFeatures: CalligraphyFeatures;
  fullDescription: string;
  researchNotes: string;
  images: ImageAsset[];
  references: Reference[];
  relatedSites: SiteSummary[];
  calligraphers: CalligrapherSummary[];
  calligraphyWorks: CalligraphyWorkSummary[];
  seoTitle: string;
  seoDescription: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// 图片
// ============================================================

/** 图片标注热点区域 */
export interface ImageAnnotation {
  id: string;
  imageId: string;
  label: string;
  description: string;
  characterInfo?: string;
  calligraphyNote?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 图片资源 */
export interface ImageAsset {
  id: string;
  siteId: string;
  objectKey: string;
  thumbnailKey: string;
  displayKey: string;
  originalKey: string;
  caption: string;
  description: string;
  imageType: ImageRole;
  sortOrder: number;
  width: number;
  height: number;
  fileSize: number;
  format: string;
  exifData?: ImageExif;
  annotations: ImageAnnotation[];
  publicationStatus: PublicationStatus;
  sha256: string;
  uploadedAt: string;
}

export interface ImageExif {
  camera?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: number;
  dateTaken?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
}

// ============================================================
// 书家/人物（新增）
// ============================================================

export interface CalligrapherSummary {
  id: string;
  name: string;
  courtesyName: string;
  artName: string;
  dynasty: Dynasty;
  shortBio: string;
  avatarUrl?: string;
  workCount: number;
}

export interface CalligrapherDetail extends CalligrapherSummary {
  birthYear?: number;
  deathYear?: number;
  birthPlace: string;
  fullBio: string;
  styleDescription: string;
  achievements: string[];
  relatedSites: SiteSummary[];
  relatedCalligraphers: CalligrapherSummary[];
  relatedWorks: CalligraphyWorkSummary[];
  references: Reference[];
}

// ============================================================
// 书法作品（新增）
// ============================================================

export interface CalligraphyWorkSummary {
  id: string;
  title: string;
  scriptType: ScriptType;
  style: string;
  dynasty: Dynasty;
  calligrapherName: string;
  currentLocation: string;
  siteId?: string;
}

export interface CalligraphyWorkDetail extends CalligraphyWorkSummary {
  calligrapherId: string;
  description: string;
  dimensions: string;
  material: string;
  significance: string;
  images: ImageAsset[];
  relatedSites: SiteSummary[];
  references: Reference[];
}

// ============================================================
// 关系（新增）
// ============================================================

export interface Relation {
  id: string;
  fromType: 'calligrapher' | 'site' | 'work';
  fromId: string;
  fromName: string;
  toType: 'calligrapher' | 'site' | 'work';
  toId: string;
  toName: string;
  relationType: RelationType;
  description: string;
  period: string;
  evidence: string;
}

/** 用于关系图谱可视化的数据格式 */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'site' | 'calligrapher' | 'work';
  dynasty?: Dynasty;
  imageUrl?: string;
  group: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: RelationType;
  relationType: string;
}

// ============================================================
// 参考来源
// ============================================================

export interface Reference {
  id: string;
  title: string;
  author: string;
  year: number;
  sourceType: ReferenceType;
  publisher?: string;
  url?: string;
  citationText: string;
  pages?: string;
}

// ============================================================
// 标签
// ============================================================

export interface Tag {
  id: string;
  name: string;
  slug: string;
  siteCount: number;
}

// ============================================================
// 搜索
// ============================================================

export interface SearchQuery {
  keyword: string;
  dynasty?: Dynasty;
  category?: Category;
  scriptType?: ScriptType;
  calligrapher?: string;
  province?: string;
  city?: string;
  county?: string;
  tags?: string[];
  page: number;
  pageSize: number;
  sortBy?: 'title' | 'dynasty' | 'createdAt' | 'relevance';
}

export interface SearchResult {
  total: number;
  page: number;
  pageSize: number;
  results: SiteSummary[];
  suggestions: string[];
  relatedKeywords: string[];
}

export interface SearchSuggestion {
  text: string;
  type: 'correction' | 'suggestion' | 'pinyin' | 'related';
}

// ============================================================
// 统计
// ============================================================

export interface PlatformStats {
  totalSites: number;
  totalProvinces: number;
  totalImages: number;
  totalCalligraphers: number;
  totalWorks: number;
  dynastyDistribution: { dynasty: Dynasty; count: number }[];
  categoryDistribution: { category: Category; count: number }[];
  scriptTypeDistribution: { scriptType: ScriptType; count: number }[];
  provinceDistribution: { province: string; count: number }[];
  recentUpdates: SiteSummary[];
}

// ============================================================
// 日志
// ============================================================

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  module: string;
  function: string;
  message: string;
  stack?: string;
  context: LogContext;
}

export interface LogContext {
  route: string;
  searchQuery?: string;
  userAgent: string;
  screenSize: string;
  browserInfo: string;
  extra?: Record<string, unknown>;
}

// ============================================================
// Repository 抽象接口
// ============================================================

export interface ArchiveRepository {
  getPublishedSites(query?: Partial<SearchQuery>): Promise<SiteSummary[]>;
  getSiteBySlug(slug: string): Promise<SiteDetail | null>;
  getRegions(): Promise<Region[]>;
  getStats(): Promise<PlatformStats>;
  getRelatedSites(siteId: string, limit?: number): Promise<SiteSummary[]>;
  searchSites(query: SearchQuery): Promise<SearchResult>;
  getCalligrapher(id: string): Promise<CalligrapherDetail | null>;
  getCalligraphers(dynasty?: Dynasty): Promise<CalligrapherSummary[]>;
  getRelations(entityId: string, entityType: 'calligrapher' | 'site' | 'work'): Promise<Relation[]>;
  getGraphData(entityId?: string): Promise<GraphData>;
  exportSites(format: 'csv' | 'json', query?: Partial<SearchQuery>): Promise<string>;
  getDynastyTimeline(): Promise<{ dynasty: Dynasty; yearStart: number; yearEnd: number; siteCount: number }[]>;
}
