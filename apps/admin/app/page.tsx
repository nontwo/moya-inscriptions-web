"use client";

import { useState, useEffect } from "react";
import { mockRepository } from "@moya/data-access";
import type { PlatformStats } from "@moya/contracts";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mockRepository.getStats().then((s) => {
      setStats(s);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-serif font-bold text-ink-600">仪表盘</h2>

      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card-stone p-4 animate-pulse">
              <div className="h-4 bg-rice-200 rounded w-1/2 mb-2" />
              <div className="h-8 bg-rice-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="碑刻总数" value={stats.totalSites} />
            <StatCard label="覆盖省份" value={stats.totalProvinces} />
            <StatCard label="图片数量" value={stats.totalImages} />
            <StatCard label="书家数量" value={stats.totalCalligraphers} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DistributionCard
              title="朝代分布"
              data={stats.dynastyDistribution.map((d) => ({
                label: d.dynasty,
                count: d.count,
              }))}
            />
            <DistributionCard
              title="书体分布"
              data={stats.scriptTypeDistribution.map((d) => ({
                label: d.scriptType,
                count: d.count,
              }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DistributionCard
              title="类型分布"
              data={stats.categoryDistribution.map((d) => ({
                label: d.category,
                count: d.count,
              }))}
            />
            <DistributionCard
              title="省份分布"
              data={stats.provinceDistribution.map((d) => ({
                label: d.province,
                count: d.count,
              }))}
            />
          </div>

          <div className="card-stone p-6">
            <h3 className="text-lg font-medium text-ink-600 mb-4">
              快速操作
            </h3>
            <div className="flex gap-3">
              <button className="btn-primary text-sm">添加碑刻</button>
              <button className="btn-ghost text-sm">导入数据</button>
              <button className="btn-ghost text-sm">导出备份</button>
            </div>
          </div>
        </>
      ) : (
        <div className="card-stone p-6 text-center text-ink-400">
          无法加载统计数据
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-stone p-4">
      <p className="text-sm text-ink-400 mb-1">{label}</p>
      <p className="text-3xl font-bold text-ink-600">{value}</p>
    </div>
  );
}

function DistributionCard({
  title,
  data,
}: {
  title: string;
  data: { label: string; count: number }[];
}) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="card-stone p-5">
      <h3 className="text-sm font-medium text-ink-500 mb-3">{title}</h3>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="text-xs text-ink-500 w-16 flex-shrink-0">
              {item.label}
            </span>
            <div className="flex-1 bg-rice-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-vermilion-400 h-full rounded-full transition-all"
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-ink-400 w-6 text-right">
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
