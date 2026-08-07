// T01 第一批名碑名刻文物名录公共数据契约。

/** PDF 中一条源记录，五个 Raw 字段必须逐字保留。 */
export interface SourceCatalogRow {
  sourceIndex: number;
  regionRaw: string;
  nameRaw: string;
  protectionOrCollectionUnitRaw: string;
  periodRaw: string;
  sourcePage: number;
  sourceId: string;
  needsReview: boolean;
  reviewNotes?: string[];
}

export type RegionCandidateSourceMethod =
  | "unit_name_inference"
  | "official_catalog"
  | "academic_db"
  | "local_chronicle"
  | "web_search"
  | "supplemental_workbook";

export type RegionCandidateVerificationStatus = "unverified" | "verified";

/** 候选地区值的来源声明；没有 URL 时不得视为已核验。 */
export interface RegionCandidateSource {
  method: RegionCandidateSourceMethod;
  label: string;
  evidenceUrls: string[];
  notes: string[];
}

/** 尚待核验的现代行政区候选。 */
export interface RegionCandidate {
  province: string;
  city: string | null;
  county: string | null;
  verificationStatus: RegionCandidateVerificationStatus;
  sources: RegionCandidateSource[];
}

/** 与 PDF 源记录关联的候选市县集合。 */
export interface RegionEnrichment {
  sourceId: string;
  sourceIndex: number;
  regionRaw: string;
  candidates: RegionCandidate[];
  selectedCandidateIndex: number | null;
  needsReview: boolean;
  reviewNotes: string[];
}

/** 应用层地区；未经核验的候选不得写入 city/county。 */
export interface NormalizedRegion {
  province: string;
  city?: string | null;
  county?: string | null;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
  coordinateSystem?: string;
  precision?: "exact" | "approximate" | "area";
}

export interface CatalogSource {
  datasetName: "第一批古代名碑名刻文物名录";
  sourceFileName: string;
  sourceFileSha256: string;
  sourcePage: number;
  sourceId: string;
}

export type DataStatus = "catalog-only" | "enriched" | "verified" | "published";

export interface DataQualityFlag {
  type:
    | "needs_review"
    | "uncertain_region"
    | "uncertain_period"
    | "uncertain_name"
    | "text_unreadable";
  description: string;
  field?: string;
}

export interface HistoricalPeriod {
  label: string;
  normalizedName?: string;
  yearStart?: number;
  yearEnd?: number;
}

/** 可扩展应用记录；PDF 未提供的字段保持可选或空数组。 */
export interface HeritageRecord {
  id: string;
  canonicalName: string;
  aliases: string[];
  region: NormalizedRegion;
  regionCandidates: RegionCandidate[];
  historicalPeriod: HistoricalPeriod;
  protectionOrCollectionUnit: string;
  source: CatalogSource;
  dataStatus: DataStatus;
  categoryIds: string[];
  imageIds: string[];
  coordinates?: Coordinates;
  description?: string;
  bibliography: string[];
  createdAt?: string;
  updatedAt?: string;
  rawSource: SourceCatalogRow;
}

export interface Region {
  name: string;
  level: "province" | "city" | "county";
  id?: string;
  parentId?: string | null;
  fullName?: string;
  administrativeCode?: string;
}

export interface SiteSummary {
  id: string;
  title: string;
  aliases: string[];
  region: NormalizedRegion;
  historicalPeriod: HistoricalPeriod;
  dataStatus: DataStatus;
  categoryIds: string[];
  imageIds: string[];
  siteCode?: string;
  slug?: string;
  summary?: string;
  coverImageKey?: string;
  coverThumbnailKey?: string;
  tags?: string[];
}

export interface SiteDetail extends SiteSummary {
  fullTitle?: string;
  coordinates?: Coordinates;
  address?: string;
  dimensions?: string;
  wordCount?: number;
  calligrapher?: string;
  engraver?: string;
  inscriber?: string;
  preservationStatus?: string;
  description?: string;
  researchNotes?: string;
  images: ImageAsset[];
  references: Reference[];
  relatedSites: SiteSummary[];
  createdAt?: string;
  updatedAt?: string;
}

/** 图片只保存对象键，访问 URL 由图片服务派生。 */
export interface ImageAsset {
  id: string;
  objectKey: string;
  siteId?: string;
  thumbnailKey?: string;
  displayKey?: string;
  originalKey?: string;
  caption?: string;
  description?: string;
  imageType?: string;
  sortOrder?: number;
  width?: number;
  height?: number;
  fileSize?: number;
  format?: string;
  sha256?: string;
}

export interface Reference {
  title: string;
  id?: string;
  author?: string;
  year?: number;
  sourceType?: string;
  publisher?: string;
  url?: string;
  citationText?: string;
  pages?: string;
}

export interface SiteSearchQuery {
  keyword?: string;
  period?: string;
  categoryId?: string;
  province?: string;
  city?: string;
  county?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "title" | "period" | "createdAt" | "relevance";
}

export interface PaginationQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  data: T[];
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    version: string;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
