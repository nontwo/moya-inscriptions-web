"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SearchBar, SiteCard, useCountUp } from "@moya/ui";
import { mockRepository } from "@moya/data-access";
import type { SiteSummary, PlatformStats } from "@moya/contracts";
import {
  BookOpen,
  MapPin,
  Image,
  Compass,
  Clock,
  ScrollText,
  TrendingUp,
} from "lucide-react";
import AppLayout from "./AppLayout";

export default function HomePage() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const [featured, setFeatured] = useState<SiteSummary[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    mockRepository.getPublishedSites({ pageSize: 6 }).then(setFeatured);
    mockRepository.getStats().then(setStats);
  }, []);

  const sitesCount = useCountUp(stats?.totalSites || 0);
  const provincesCount = useCountUp(stats?.totalProvinces || 0);
  const imagesCount = useCountUp(stats?.totalImages || 0);

  const handleSearch = (q: string) => {
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <AppLayout>
      {/* Hero Banner */}
      <section className="relative bg-gradient-to-b from-rice-50 to-rice-100 py-16 md:py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-ink-600 font-bold mb-4 tracking-wide">
            摩崖碑刻数字平台
          </h1>
          <p className="text-ink-400 text-lg md:text-xl mb-10 leading-relaxed">
            探索中华摩崖碑刻文化遗产 · 让千年石刻在数字世界焕发新生
          </p>
          <div className="max-w-xl mx-auto">
            <SearchBar
              value={searchValue}
              onChange={setSearchValue}
              onSubmit={handleSearch}
              placeholder="搜索碑刻名称、地区、朝代...（支持拼音）"
            />
          </div>
        </div>
      </section>

      {/* 统计卡片 */}
      {stats && (
        <section className="max-w-4xl mx-auto px-4 -mt-8 relative z-10">
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              icon={<BookOpen size={22} />}
              value={sitesCount}
              label="收录碑刻"
              color="vermilion"
            />
            <StatCard
              icon={<MapPin size={22} />}
              value={provincesCount}
              label="覆盖省份"
              color="ink"
            />
            <StatCard
              icon={<Image size={22} />}
              value={imagesCount}
              label="精选图片"
              color="gold"
            />
          </div>
        </section>
      )}

      {/* 快捷入口 */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickEntry
            icon={<Clock size={24} />}
            label="朝代浏览"
            onClick={() => router.push("/browse?view=timeline")}
          />
          <QuickEntry
            icon={<MapPin size={24} />}
            label="地区浏览"
            onClick={() => router.push("/regions")}
          />
          <QuickEntry
            icon={<ScrollText size={24} />}
            label="书体分类"
            onClick={() => router.push("/browse")}
          />
          <QuickEntry
            icon={<Compass size={24} />}
            label="时间轴"
            onClick={() => router.push("/browse?view=timeline")}
          />
        </div>
      </section>

      {/* 精选点位 */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl text-ink-600 font-semibold">
            精选碑刻
            <span className="text-sm text-ink-400 font-normal ml-2">
              共 {stats?.totalSites || 0} 处
            </span>
          </h2>
          <button
            onClick={() => router.push("/browse")}
            className="text-vermilion-500 hover:text-vermilion-600 text-sm font-medium flex items-center gap-1 cursor-pointer"
          >
            浏览全部 <TrendingUp size={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </div>
      </section>

      {/* 底部引导 */}
      <section className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="card-stone p-8">
          <h3 className="font-serif text-xl text-ink-600 font-semibold mb-3">
            参与共建
          </h3>
          <p className="text-ink-400 mb-4 text-sm leading-relaxed">
            本平台致力于系统整理中国摩崖碑刻文化遗产。
            如果您有相关碑刻资料或图片，欢迎联系我们。
          </p>
          <button
            onClick={() => router.push("/about")}
            className="btn-outline cursor-pointer"
          >
            了解更多
          </button>
        </div>
      </section>
    </AppLayout>
  );
}

function StatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    vermilion: "bg-vermilion-50 text-vermilion-500",
    ink: "bg-ink-50 text-ink-600",
    gold: "bg-yellow-50 text-gold-500",
  };
  return (
    <div className="card-stone p-4 md:p-6 text-center">
      <div
        className={`w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.ink}`}
      >
        {icon}
      </div>
      <div className="font-serif text-2xl md:text-3xl font-bold text-ink-600">
        {value}
      </div>
      <div className="text-xs text-ink-400 mt-1">{label}</div>
    </div>
  );
}

function QuickEntry({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card-stone p-5 flex flex-col items-center gap-2 hover:-translate-y-1 transition-transform cursor-pointer group"
    >
      <div className="w-12 h-12 rounded-xl bg-rice-100 flex items-center justify-center text-ink-500 group-hover:bg-vermilion-50 group-hover:text-vermilion-500 transition-colors">
        {icon}
      </div>
      <span className="text-sm font-medium text-ink-500 group-hover:text-ink-600">
        {label}
      </span>
    </button>
  );
}
