"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SearchBar, SiteCard, EmptyState } from "@moya/ui";
import { mockRepository } from "@moya/data-access";
import type { SiteSummary } from "@moya/contracts";
import AppLayout from "@/app/AppLayout";

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [results, setResults] = useState<SiteSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const query = searchParams.get("q") || "";

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    const result = await mockRepository.searchSites({
      keyword: q,
      page: 1,
      pageSize: 50,
    });
    setResults(result.results);
    setTotal(result.total);
    setLoading(false);
  }, []);

  useEffect(() => {
    doSearch(query);
  }, [query, doSearch]);

  const handleSearch = (q: string) => {
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <SearchBar
            value={query}
            onChange={(v) => {
              if (!v) router.push("/search");
            }}
            onSubmit={handleSearch}
          />
        </div>

        {query && (
          <div className="mb-6">
            <p className="text-sm text-ink-400">
              搜索 &quot;
              <span className="text-ink-600 font-medium">{query}</span>&quot;
              {loading ? "..." : ` — 共找到 ${total} 个结果`}
            </p>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-stone overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-rice-200" />
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-rice-200 rounded w-3/4" />
                  <div className="h-4 bg-rice-200 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length === 0 && query ? (
          <EmptyState
            title="未找到相关碑刻"
            description="请尝试使用其他关键词，或浏览分类和地区页面"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {results.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse h-64 bg-rice-200 rounded" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
