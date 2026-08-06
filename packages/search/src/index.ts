// ============================================================
// @moya/search — 搜索增强引擎
// Fuse.js + pinyin-pro + chinese-conv
// 按照 AGENTS.md 规则：搜索逻辑应独立为包
// ============================================================

import Fuse from "fuse.js";
import { pinyin } from "pinyin-pro";
import { sify } from "chinese-conv";
import type { SiteSummary, SearchResult } from "@moya/contracts";

interface IndexedSite {
  item: SiteSummary;
  searchText: string;
  pinyinFull: string;
  pinyinInitial: string;
}

let fuseIndex: Fuse<IndexedSite> | null = null;
let siteList: IndexedSite[] = [];

/** 构建搜索索引 */
export function buildSearchIndex(sites: SiteSummary[]): void {
  siteList = sites.map((site) => ({
    item: site,
    searchText: [site.title, ...site.alias, site.summary, site.calligrapher,
      site.region.province, site.region.city, site.dynasty, ...site.tags,
    ].join(" ").toLowerCase(),
    pinyinFull: pinyin(site.title, { toneType: "none", type: "string" }).replace(/\s/g, ""),
    pinyinInitial: pinyin(site.title, { pattern: "first", toneType: "none", type: "string" }).replace(/\s/g, ""),
  }));

  fuseIndex = new Fuse(siteList, {
    keys: [
      { name: "searchText", weight: 1 },
      { name: "pinyinFull", weight: 0.8 },
      { name: "pinyinInitial", weight: 0.6 },
    ],
    threshold: 0.4,
    distance: 100,
    minMatchCharLength: 1,
  });
}

/** 检测输入是否可能是拼音 */
function isPinyinLike(input: string): boolean {
  return /^[a-zA-Z]+$/.test(input);
}

/** Levenshtein 编辑距离 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

/** 生成纠错建议 */
function getSuggestions(keyword: string, sites: IndexedSite[], limit = 3): string[] {
  const candidates = new Set<string>();
  for (const s of sites) {
    const words = [s.item.title, ...s.item.alias];
    for (const w of words) {
      if (w.length > 1 && w.length < 10 && levenshtein(keyword, w.toLowerCase()) <= 2) {
        candidates.add(w);
      }
    }
  }
  return Array.from(candidates).slice(0, limit);
}

/** 执行搜索 */
export function search(keyword: string, sites: SiteSummary[], options?: {
  dynasty?: string; category?: string; scriptType?: string; province?: string;
}): SearchResult {
  if (!fuseIndex) buildSearchIndex(sites);

  let results: SiteSummary[] = [];

  if (!keyword.trim()) {
    results = [...sites];
  } else {
    let searchTerm = keyword.trim();

    // 繁简转换：如果是繁体，转为简体
    const simplified = sify(searchTerm);
    if (simplified !== searchTerm) {
      searchTerm = simplified;
    }

    const fuseResults = fuseIndex!.search(searchTerm);
    results = fuseResults.map((r) => r.item.item);

    // 如果结果太少，尝试拼音首字母匹配
    if (results.length < 3 && !isPinyinLike(searchTerm)) {
      const pinyinResults = fuseIndex!.search(pinyin(searchTerm, { pattern: "first", toneType: "none", type: "string" }));
      const extra = pinyinResults.filter((r) => !results.includes(r.item.item));
      results = [...results, ...extra.map((r) => r.item.item)];
    }
  }

  // 筛选
  if (options?.dynasty) results = results.filter((s) => s.dynasty === options.dynasty);
  if (options?.category) results = results.filter((s) => s.category === options.category);
  if (options?.scriptType) results = results.filter((s) => s.scriptType === options.scriptType);
  if (options?.province) results = results.filter((s) => s.region.province === options.province);

  const suggestions = keyword ? getSuggestions(keyword.toLowerCase(), siteList) : [];

  return {
    total: results.length,
    page: 1,
    pageSize: results.length,
    results,
    suggestions,
    relatedKeywords: [],
  };
}
