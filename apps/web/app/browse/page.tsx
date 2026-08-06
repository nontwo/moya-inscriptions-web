"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SiteCard, FilterTag, FilterGroup, EmptyState } from "@moya/ui";
import { mockRepository } from "@moya/data-access";
import type { SiteSummary } from "@moya/contracts";
import { Dynasty, Category, ScriptType } from "@moya/contracts";
import { Grid3X3, Clock } from "lucide-react";
import AppLayout from "@/app/AppLayout";

function BrowseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [view, setView] = useState<"grid" | "timeline">(
    searchParams.get("view") === "timeline" ? "timeline" : "grid",
  );

  const activeDynasty = searchParams.get("dynasty") as Dynasty | null;
  const activeCategory = searchParams.get("category") as Category | null;
  const activeScript = searchParams.get("script") as ScriptType | null;

  useEffect(() => {
    mockRepository
      .getPublishedSites({
        dynasty: activeDynasty || undefined,
        category: activeCategory || undefined,
        scriptType: activeScript || undefined,
      })
      .then(setSites);
  }, [activeDynasty, activeCategory, activeScript]);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.push(`/browse${next.toString() ? "?" + next.toString() : ""}`);
    },
    [searchParams, router],
  );

  const dynastyOptions = useMemo(() => Object.values(Dynasty), []);
  const categoryOptions = useMemo(() => Object.values(Category), []);
  const scriptOptions = useMemo(() => Object.values(ScriptType), []);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="font-serif text-3xl text-ink-600 mb-2">分类浏览</h1>
        <p className="text-ink-400 mb-8">按朝代、类型、书体浏览碑刻</p>

        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setView("grid")}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 cursor-pointer ${view === "grid" ? "bg-vermilion-500 text-white" : "bg-white text-ink-500 border border-rice-300"}`}
          >
            <Grid3X3 size={16} /> 网格
          </button>
          <button
            onClick={() => {
              setView("timeline");
              updateParam("view", "timeline");
            }}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 cursor-pointer ${view === "timeline" ? "bg-vermilion-500 text-white" : "bg-white text-ink-500 border border-rice-300"}`}
          >
            <Clock size={16} /> 时间轴
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="lg:w-60 flex-shrink-0 space-y-6">
            <FilterGroup title="朝代">
              <FilterTag
                label="全部"
                active={!activeDynasty}
                onClick={() => updateParam("dynasty", null)}
              />
              {dynastyOptions.slice(0, 10).map((d) => (
                <FilterTag
                  key={d}
                  label={d}
                  active={activeDynasty === d}
                  onClick={() =>
                    updateParam("dynasty", activeDynasty === d ? null : d)
                  }
                />
              ))}
            </FilterGroup>
            <FilterGroup title="类型">
              <FilterTag
                label="全部"
                active={!activeCategory}
                onClick={() => updateParam("category", null)}
              />
              {categoryOptions.map((c) => (
                <FilterTag
                  key={c}
                  label={c}
                  active={activeCategory === c}
                  onClick={() =>
                    updateParam("category", activeCategory === c ? null : c)
                  }
                />
              ))}
            </FilterGroup>
            <FilterGroup title="书体">
              <FilterTag
                label="全部"
                active={!activeScript}
                onClick={() => updateParam("script", null)}
              />
              {scriptOptions.map((s) => (
                <FilterTag
                  key={s}
                  label={s}
                  active={activeScript === s}
                  onClick={() =>
                    updateParam("script", activeScript === s ? null : s)
                  }
                />
              ))}
            </FilterGroup>
          </aside>

          <main className="flex-1">
            {sites.length === 0 ? (
              <EmptyState
                title="暂无符合条件的碑刻"
                description="请尝试调整筛选条件"
              />
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {sites.map((site) => (
                  <SiteCard key={site.id} site={site} />
                ))}
              </div>
            ) : (
              <TimelineView sites={sites} />
            )}
          </main>
        </div>
      </div>
    </AppLayout>
  );
}

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse h-64 bg-rice-200 rounded" />
        </div>
      }
    >
      <BrowseContent />
    </Suspense>
  );
}

function TimelineView({ sites }: { sites: SiteSummary[] }) {
  const grouped = new Map<string, SiteSummary[]>();
  sites.forEach((s) => {
    const list = grouped.get(s.dynasty) || [];
    list.push(s);
    grouped.set(s.dynasty, list);
  });

  return (
    <div className="space-y-8">
      {Array.from(grouped.entries()).map(([dynasty, items]) => (
        <div
          key={dynasty}
          className="relative pl-8 border-l-2 border-vermilion-200"
        >
          <div className="absolute -left-2 top-0 w-4 h-4 bg-vermilion-500 rounded-full ring-4 ring-vermilion-100" />
          <h3 className="font-serif text-xl text-ink-600 font-semibold mb-3">
            {dynasty}
            <span className="text-sm text-ink-400 font-normal ml-2">
              {items.length} 处
            </span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {items.map((s) => (
              <SiteCard key={s.id} site={s} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
