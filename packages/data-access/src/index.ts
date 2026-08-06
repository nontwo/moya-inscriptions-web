// ============================================================
// @moya/data-access — 数据访问层
// MockRepository — 开发期使用 Mock 数据
// 按照 AGENTS.md 规则 4：公开页面必须使用此抽象层
// ============================================================

import type {
  ArchiveRepository,
  SiteSummary,
  SiteDetail,
  Region,
  PlatformStats,
  SearchQuery,
  SearchResult,
  CalligrapherDetail,
  CalligrapherSummary,
  Relation,
  GraphData,
} from "@moya/contracts";
import type { Dynasty } from "@moya/contracts";
import {
  mockSites,
  mockRegions,
  mockStats,
  mockCalligraphers,
  mockRelations,
  mockGraphData,
  DYNASTY_ORDER,
  DYNASTY_YEAR_RANGE,
} from "@moya/contracts";

function toSummary(site: SiteDetail): SiteSummary {
  return {
    id: site.id,
    siteCode: site.siteCode,
    slug: site.slug,
    title: site.title,
    alias: site.alias,
    dynasty: site.dynasty,
    dynastyYear: site.dynastyYear,
    category: site.category,
    scriptType: site.scriptType,
    calligrapher: site.calligrapher,
    region: site.region,
    summary: site.summary,
    coverImage: site.coverImage,
    coverThumbnail: site.coverThumbnail,
    tags: site.tags,
    pinyinIndex: site.pinyinIndex,
    publicationStatus: site.publicationStatus,
  };
}

export class MockRepository implements ArchiveRepository {
  async getPublishedSites(query?: Partial<SearchQuery>): Promise<SiteSummary[]> {
    let sites = mockSites.filter((s) => s.publicationStatus === "published");
    if (query?.dynasty) sites = sites.filter((s) => s.dynasty === query.dynasty);
    if (query?.category) sites = sites.filter((s) => s.category === query.category);
    if (query?.scriptType) sites = sites.filter((s) => s.scriptType === query.scriptType);
    if (query?.province) sites = sites.filter((s) => s.region.province === query.province);
    return sites.map(toSummary);
  }

  async getSiteBySlug(slug: string): Promise<SiteDetail | null> {
    return mockSites.find((s) => s.slug === slug) || null;
  }

  async getRegions(): Promise<Region[]> { return mockRegions; }
  async getStats(): Promise<PlatformStats> { return mockStats; }

  async getRelatedSites(siteId: string, limit = 4): Promise<SiteSummary[]> {
    const site = mockSites.find((s) => s.id === siteId);
    if (!site) return [];
    return mockSites
      .filter((s) => s.id !== siteId)
      .filter((s) => s.dynasty === site.dynasty || s.region.province === site.region.province)
      .slice(0, limit)
      .map(toSummary);
  }

  async searchSites(query: SearchQuery): Promise<SearchResult> {
    let results = mockSites.filter((s) => s.publicationStatus === "published");
    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      results = results.filter((s) =>
        s.title.toLowerCase().includes(kw) ||
        s.pinyinIndex.toLowerCase().includes(kw) ||
        s.alias.some((a) => a.toLowerCase().includes(kw)) ||
        s.summary.toLowerCase().includes(kw) ||
        s.region.province.toLowerCase().includes(kw) ||
        s.calligrapher.toLowerCase().includes(kw),
      );
    }
    if (query.dynasty) results = results.filter((s) => s.dynasty === query.dynasty);
    if (query.category) results = results.filter((s) => s.category === query.category);
    if (query.scriptType) results = results.filter((s) => s.scriptType === query.scriptType);
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const start = (page - 1) * pageSize;
    return {
      total: results.length, page, pageSize,
      results: results.slice(start, start + pageSize).map(toSummary),
      suggestions: [], relatedKeywords: [],
    };
  }

  async getCalligrapher(id: string): Promise<CalligrapherDetail | null> {
    return mockCalligraphers.find((c) => c.id === id) || null;
  }

  async getCalligraphers(dynasty?: Dynasty): Promise<CalligrapherSummary[]> {
    if (dynasty) return mockCalligraphers.filter((c) => c.dynasty === dynasty);
    return mockCalligraphers;
  }

  async getRelations(entityId: string): Promise<Relation[]> {
    return mockRelations.filter((r) => r.fromId === entityId || r.toId === entityId);
  }

  async getGraphData(): Promise<GraphData> {
    return mockGraphData;
  }

  async exportSites(format: "csv" | "json", query?: Partial<SearchQuery>): Promise<string> {
    const sites = await this.getPublishedSites(query);
    if (format === "json") return JSON.stringify(sites, null, 2);
    const header = "名称,朝代,年代,类型,书体,书家,地区,简介\n";
    const rows = sites.map((s) =>
      `"${s.title}","${s.dynasty}","${s.dynastyYear}","${s.category}","${s.scriptType}","${s.calligrapher}","${s.region.province}${s.region.city}","${s.summary}"`,
    );
    return "\uFEFF" + header + rows.join("\n");
  }

  async getDynastyTimeline(): Promise<{ dynasty: Dynasty; yearStart: number; yearEnd: number; siteCount: number }[]> {
    const dynastyCount = new Map<string, number>();
    mockSites.forEach((s) => {
      dynastyCount.set(s.dynasty, (dynastyCount.get(s.dynasty) || 0) + 1);
    });
    return (Object.entries(DYNASTY_ORDER) as [Dynasty, number][]).map(([name]) => ({
      dynasty: name,
      yearStart: DYNASTY_YEAR_RANGE[name]?.[0] ?? 0,
      yearEnd: DYNASTY_YEAR_RANGE[name]?.[1] ?? 0,
      siteCount: dynastyCount.get(name) || 0,
    }));
  }
}

export const mockRepository = new MockRepository();
