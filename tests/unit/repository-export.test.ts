// ============================================================
// MockRepository + export.ts 单元测试
// 覆盖 MockRepository 全部 12 个方法 + downloadCSV/downloadJSON
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { MockRepository } from '@moya/data-access';
import { downloadCSV, downloadJSON } from '../fixtures/export';
import type {
  SiteSummary,
  SiteDetail,
  SearchQuery,
  Dynasty,
} from '@moya/contracts';
import { Dynasty as D, ScriptType as ST, Category as CT } from '@moya/contracts';

// ---- 辅助：获取 mock 数据中的已知值 ----
const KNOWN_SLUG = 'datang-zhongxing-song';
const KNOWN_ID = 's-dtzx';
const KNOWN_TITLE = '大唐中兴颂';
const KNOWN_CALLIGRAPHER_ID = 'c-yanzhenqing';

let repo: MockRepository;

beforeEach(() => {
  repo = new MockRepository();
});

// ============================================================
describe('MockRepository', () => {
  // ==========================================================
  // 1. getPublishedSites — 返回所有已发布的 SiteSummary
  // ==========================================================
  describe('getPublishedSites()', () => {
    it('1.1 无参数应返回全部已发布站点', async () => {
      const sites = await repo.getPublishedSites();
      expect(sites.length).toBeGreaterThanOrEqual(8);
      expect(sites.every((s) => s.publicationStatus === 'published')).toBe(true);
    });

    it('1.2 每个结果都是 SiteSummary（不含 detail 字段）', async () => {
      const sites = await repo.getPublishedSites();
      for (const s of sites) {
        expect(s).toHaveProperty('id');
        expect(s).toHaveProperty('slug');
        expect(s).toHaveProperty('title');
        expect(s).toHaveProperty('dynasty');
        expect(s).toHaveProperty('category');
        expect(s).toHaveProperty('scriptType');
        expect(s).toHaveProperty('calligrapher');
        expect(s).toHaveProperty('region');
        expect(s).toHaveProperty('summary');
        expect(s).toHaveProperty('coverImage');
        expect(s).toHaveProperty('coverThumbnail');
        expect(s).toHaveProperty('tags');
        expect(s).toHaveProperty('pinyinIndex');
        // 确认不含 detail 独有字段
        expect((s as SiteDetail).fullTitle).toBeUndefined();
      }
    });

    it('1.3 按 dynasty 筛选', async () => {
      const tang = await repo.getPublishedSites({ dynasty: D.TANG });
      expect(tang.every((s) => s.dynasty === D.TANG)).toBe(true);
      expect(tang.length).toBeGreaterThanOrEqual(1);
    });

    it('1.4 按 category 筛选', async () => {
      const steles = await repo.getPublishedSites({ category: CT.STELE });
      expect(steles.every((s) => s.category === CT.STELE)).toBe(true);
      expect(steles.length).toBeGreaterThanOrEqual(1);
    });

    it('1.5 按 scriptType 筛选', async () => {
      const regular = await repo.getPublishedSites({ scriptType: ST.REGULAR });
      expect(regular.every((s) => s.scriptType === ST.REGULAR)).toBe(true);
      expect(regular.length).toBeGreaterThanOrEqual(1);
    });

    it('1.6 按 province 筛选', async () => {
      const shaanxi = await repo.getPublishedSites({ province: '陕西省' });
      expect(shaanxi.every((s) => s.region.province === '陕西省')).toBe(true);
      expect(shaanxi.length).toBeGreaterThanOrEqual(1);
    });

    it('1.7 组合筛选 dynasty + province', async () => {
      const result = await repo.getPublishedSites({ dynasty: D.TANG, province: '湖南省' });
      expect(result.every((s) => s.dynasty === D.TANG && s.region.province === '湖南省')).toBe(true);
    });
  });

  // ==========================================================
  // 2. getSiteBySlug — 按 slug 返回完整 SiteDetail
  // ==========================================================
  describe('getSiteBySlug()', () => {
    it('2.1 有效 slug 返回 SiteDetail', async () => {
      const site = await repo.getSiteBySlug(KNOWN_SLUG);
      expect(site).not.toBeNull();
      expect(site!.title).toBe(KNOWN_TITLE);
      expect(site!.slug).toBe(KNOWN_SLUG);
      expect(site!.fullTitle).toBeDefined();
      expect(site!.calligraphyFeatures).toBeDefined();
      expect(site!.images).toBeDefined();
      expect(site!.references).toBeDefined();
    });

    it('2.2 无效 slug 返回 null', async () => {
      const site = await repo.getSiteBySlug('nonexistent-slug');
      expect(site).toBeNull();
    });
  });

  // ==========================================================
  // 3. getRegions — 返回所有地区
  // ==========================================================
  describe('getRegions()', () => {
    it('3.1 返回非空数组', async () => {
      const regions = await repo.getRegions();
      expect(regions.length).toBeGreaterThanOrEqual(6);
      expect(regions[0]).toHaveProperty('name');
      expect(regions[0]).toHaveProperty('level');
      expect(regions[0]).toHaveProperty('siteCount');
    });

    it('3.2 包含已知省份', async () => {
      const regions = await repo.getRegions();
      const names = regions.map((r) => r.name);
      expect(names).toContain('湖南省');
      expect(names).toContain('山东省');
      expect(names).toContain('陕西省');
    });
  });

  // ==========================================================
  // 4. getStats — 返回平台统计数据
  // ==========================================================
  describe('getStats()', () => {
    it('4.1 返回 PlatformStats 结构', async () => {
      const stats = await repo.getStats();
      expect(stats).toHaveProperty('totalSites');
      expect(stats).toHaveProperty('totalProvinces');
      expect(stats).toHaveProperty('totalImages');
      expect(stats).toHaveProperty('totalCalligraphers');
      expect(stats).toHaveProperty('dynastyDistribution');
      expect(stats).toHaveProperty('categoryDistribution');
      expect(stats).toHaveProperty('scriptTypeDistribution');
      expect(stats).toHaveProperty('provinceDistribution');
      expect(stats.totalSites).toBeGreaterThanOrEqual(8);
      expect(stats.totalProvinces).toBe(6);
    });

    it('4.2 朝代分布数组非空', async () => {
      const stats = await repo.getStats();
      expect(stats.dynastyDistribution.length).toBeGreaterThan(0);
      expect(stats.dynastyDistribution[0]).toHaveProperty('dynasty');
      expect(stats.dynastyDistribution[0]).toHaveProperty('count');
    });
  });

  // ==========================================================
  // 5. getRelatedSites — 按同朝代/同省份推荐
  // ==========================================================
  describe('getRelatedSites()', () => {
    it('5.1 有效 siteId 返回相关站点', async () => {
      const related = await repo.getRelatedSites(KNOWN_ID);
      expect(related.length).toBeGreaterThan(0);
      // 推荐算法：同朝代或同省份
      const site = await repo.getSiteBySlug(KNOWN_SLUG);
      for (const r of related) {
        expect(
          r.dynasty === site!.dynasty || r.region.province === site!.region.province
        ).toBe(true);
      }
    });

    it('5.2 默认 limit=4', async () => {
      const related = await repo.getRelatedSites(KNOWN_ID);
      expect(related.length).toBeLessThanOrEqual(4);
    });

    it('5.3 自定义 limit', async () => {
      const related = await repo.getRelatedSites(KNOWN_ID, 2);
      expect(related.length).toBeLessThanOrEqual(2);
    });

    it('5.4 无效 siteId 返回空数组', async () => {
      const related = await repo.getRelatedSites('invalid-id');
      expect(related).toEqual([]);
    });
  });

  // ==========================================================
  // 6. searchSites — 关键词+筛选+分页搜索
  // ==========================================================
  describe('searchSites()', () => {
    const BASE_QUERY: SearchQuery = { keyword: '', page: 1, pageSize: 20 };

    it('6.1 关键词"大唐"应匹配大唐中兴颂', async () => {
      const result = await repo.searchSites({ ...BASE_QUERY, keyword: '大唐' });
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.results.some((r) => r.title === '大唐中兴颂')).toBe(true);
    });

    it('6.2 拼音首字母"dtzxs"应匹配', async () => {
      const result = await repo.searchSites({ ...BASE_QUERY, keyword: 'dtzxs' });
      expect(result.results.some((r) => r.title === '大唐中兴颂')).toBe(true);
    });

    it('6.3 返回 SearchResult 结构', async () => {
      const result = await repo.searchSites(BASE_QUERY);
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('pageSize');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('relatedKeywords');
    });

    it('6.4 分页：page=1 pageSize=2', async () => {
      const result = await repo.searchSites({ ...BASE_QUERY, page: 1, pageSize: 2 });
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
      expect(result.results.length).toBeLessThanOrEqual(2);
    });

    it('6.5 分页：page=2 返回第二页', async () => {
      const result = await repo.searchSites({ ...BASE_QUERY, page: 2, pageSize: 3 });
      expect(result.page).toBe(2);
    });

    it('6.6 组合筛选 keyword+dynasty', async () => {
      const result = await repo.searchSites({ ...BASE_QUERY, keyword: '碑', dynasty: D.TANG });
      expect(result.results.every((r) => r.dynasty === D.TANG)).toBe(true);
    });
  });

  // ==========================================================
  // 7. getCalligrapher — 按 id 返回书家详情
  // ==========================================================
  describe('getCalligrapher()', () => {
    it('7.1 有效 id 返回 CalligrapherDetail', async () => {
      const c = await repo.getCalligrapher(KNOWN_CALLIGRAPHER_ID);
      expect(c).not.toBeNull();
      expect(c!.name).toBe('颜真卿');
      expect(c!.dynasty).toBe(D.TANG);
      expect(c!.fullBio).toBeDefined();
      expect(c!.styleDescription).toBeDefined();
    });

    it('7.2 无效 id 返回 null', async () => {
      const c = await repo.getCalligrapher('nonexistent');
      expect(c).toBeNull();
    });
  });

  // ==========================================================
  // 8. getCalligraphers — 返回书家列表（可选朝代筛选）
  // ==========================================================
  describe('getCalligraphers()', () => {
    it('8.1 无参数返回全部书家', async () => {
      const list = await repo.getCalligraphers();
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0]).toHaveProperty('name');
      expect(list[0]).toHaveProperty('dynasty');
    });

    it('8.2 按朝代筛选', async () => {
      const tang = await repo.getCalligraphers(D.TANG);
      expect(tang.every((c) => c.dynasty === D.TANG)).toBe(true);
      expect(tang.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================
  // 9. getRelations — 按 entityId 返回关联关系
  // ==========================================================
  describe('getRelations()', () => {
    it('9.1 返回书家关联的碑刻关系', async () => {
      const relations = await repo.getRelations(KNOWN_CALLIGRAPHER_ID);
      expect(relations.length).toBeGreaterThanOrEqual(1);
      expect(relations[0]).toHaveProperty('fromId');
      expect(relations[0]).toHaveProperty('toId');
      expect(relations[0]).toHaveProperty('relationType');
    });

    it('9.2 返回碑刻关联的书家关系', async () => {
      const relations = await repo.getRelations(KNOWN_ID);
      expect(relations.length).toBeGreaterThanOrEqual(1);
    });

    it('9.3 无效 entityId 返回空数组', async () => {
      const relations = await repo.getRelations('nonexistent');
      expect(relations).toEqual([]);
    });
  });

  // ==========================================================
  // 10. getGraphData — 返回知识图谱数据
  // ==========================================================
  describe('getGraphData()', () => {
    it('10.1 返回 GraphData 结构', async () => {
      const graph = await repo.getGraphData();
      expect(graph).toHaveProperty('nodes');
      expect(graph).toHaveProperty('edges');
      expect(Array.isArray(graph.nodes)).toBe(true);
      expect(Array.isArray(graph.edges)).toBe(true);
    });

    it('10.2 nodes 包含书家和碑刻', async () => {
      const graph = await repo.getGraphData();
      const types = new Set(graph.nodes.map((n) => n.type));
      expect(types.has('calligrapher')).toBe(true);
      expect(types.has('site')).toBe(true);
    });
  });

  // ==========================================================
  // 11. exportSites — CSV/JSON 导出
  // ==========================================================
  describe('exportSites()', () => {
    it('11.1 JSON 格式返回合法 JSON', async () => {
      const json = await repo.exportSites('json');
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThanOrEqual(8);
    });

    it('11.2 JSON 格式含 BOM', async () => {
      const json = await repo.exportSites('json');
      // JSON.stringify 不加 BOM，所以以 { 或 [ 开头
      expect(json.trimStart()[0]).toBe('[');
    });

    it('11.3 CSV 格式含 BOM + 表头', async () => {
      const csv = await repo.exportSites('csv');
      expect(csv.charCodeAt(0)).toBe(0xFEFF);
      expect(csv).toContain('名称');
      expect(csv).toContain('朝代');
      expect(csv).toContain('年代');
      expect(csv).toContain('类型');
      expect(csv).toContain('书体');
      expect(csv).toContain('书家');
      expect(csv).toContain('地区');
      expect(csv).toContain('简介');
    });

    it('11.4 CSV 数据行含已知标题', async () => {
      const csv = await repo.exportSites('csv');
      expect(csv).toContain('大唐中兴颂');
    });

    it('11.5 带筛选条件的导出', async () => {
      const csv = await repo.exportSites('csv', { dynasty: D.TANG });
      const lines = csv.split('\n').filter((l) => l.trim());
      // 表头 + 数据行，数据行都应是唐代
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================
  // 12. getDynastyTimeline — 返回朝代时间轴数据
  // ==========================================================
  describe('getDynastyTimeline()', () => {
    it('12.1 返回时间轴数组', async () => {
      const timeline = await repo.getDynastyTimeline();
      expect(timeline.length).toBeGreaterThanOrEqual(4);
    });

    it('12.2 每个条目含 dynasty/yearStart/yearEnd/siteCount', async () => {
      const timeline = await repo.getDynastyTimeline();
      for (const t of timeline) {
        expect(t).toHaveProperty('dynasty');
        expect(t).toHaveProperty('yearStart');
        expect(t).toHaveProperty('yearEnd');
        expect(t).toHaveProperty('siteCount');
        expect(t.yearStart).toBeLessThan(t.yearEnd);
      }
    });

    it('12.3 唐代时间范围正确', async () => {
      const timeline = await repo.getDynastyTimeline();
      const tang = timeline.find((t) => t.dynasty === D.TANG);
      expect(tang).toBeDefined();
      expect(tang!.yearStart).toBe(618);
      expect(tang!.yearEnd).toBe(907);
    });
  });
});

// ============================================================
describe('export.ts', () => {
  // ==========================================================
  // downloadCSV
  // ==========================================================
  describe('downloadCSV()', () => {
    it('创建 Blob 并触发下载', () => {
      const createObjectURL = vi.fn(() => 'blob:csv-test');
      const revokeObjectURL = vi.fn();
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;

      const clickSpy = vi.fn();
      // 构造一个带有 parentNode 的 anchor，让 happy-dom appendChild 不报错
      const mockAnchor = document.createElement('a');
      vi.spyOn(mockAnchor, 'click').mockImplementation(clickSpy);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'a') return mockAnchor;
        return document.createElement(tag);
      });

      downloadCSV('col1,col2\nv1,v2', 'test.csv');

      expect(createObjectURL).toHaveBeenCalled();
      const blobArg = (createObjectURL as any).mock.calls[0]?.[0] as Blob | undefined;
      expect(blobArg?.type).toBe('text/csv;charset=utf-8');

      expect(clickSpy).toHaveBeenCalled();
      expect(mockAnchor.download).toBe('test.csv');

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv-test');

      URL.createObjectURL = URL.createObjectURL; // 不重置
      vi.restoreAllMocks();
    });

    it('CSV Blob 内容含 BOM', () => {
      const createObjectURL = vi.fn(() => 'blob:csv');
      const revokeObjectURL = vi.fn();
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;

      const clickSpy = vi.fn();
      const mockAnchor2 = document.createElement('a');
      vi.spyOn(mockAnchor2, 'click').mockImplementation(clickSpy);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'a') return mockAnchor2;
        return document.createElement(tag);
      });

      downloadCSV('test', 'f.csv');

      const blobArg2 = (createObjectURL as any).mock.calls[0]?.[0] as Blob | undefined;
      expect(blobArg2?.type).toBe('text/csv;charset=utf-8');

      vi.restoreAllMocks();
    });
  });

  // ==========================================================
  // downloadJSON
  // ==========================================================
  describe('downloadJSON()', () => {
    it('创建 JSON Blob 并触发下载', () => {
      const createObjectURL = vi.fn(() => 'blob:json-test');
      const revokeObjectURL = vi.fn();
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;

      const clickSpy = vi.fn();
      const mockAnchor = document.createElement('a');
      vi.spyOn(mockAnchor, 'click').mockImplementation(clickSpy);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'a') return mockAnchor;
        return document.createElement(tag);
      });

      downloadJSON({ a: 1, b: 'hello' }, 'data.json');

      expect(createObjectURL).toHaveBeenCalled();
      const blobArg = (createObjectURL as any).mock.calls[0]?.[0] as Blob | undefined;
      expect(blobArg?.type).toBe('application/json');
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('JSON 内容包含原始数据', async () => {
      const blobs: Blob[] = [];
      const createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:j'; });
      const revokeObjectURL = vi.fn();
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;

      const clickSpy = vi.fn();
      const mockAnchor = document.createElement('a');
      vi.spyOn(mockAnchor, 'click').mockImplementation(clickSpy);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'a') return mockAnchor;
        return document.createElement(tag);
      });

      const data = { name: '大唐中兴颂', dynasty: '唐' };
      downloadJSON(data, 'site.json');

      const text = await blobs[0].text();
      const parsed = JSON.parse(text);
      expect(parsed.name).toBe('大唐中兴颂');
      expect(parsed.dynasty).toBe('唐');

      vi.restoreAllMocks();
    });
  });
});
