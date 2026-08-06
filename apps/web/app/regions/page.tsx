"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SiteCard, EmptyState } from "@moya/ui";
import { mockRepository } from "@moya/data-access";
import type { Region, SiteSummary } from "@moya/contracts";
import { MapPin, ChevronRight } from "lucide-react";
import AppLayout from "@/app/AppLayout";

export default function RegionsPage() {
  const router = useRouter();
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [provinceSites, setProvinceSites] = useState<SiteSummary[]>([]);

  useEffect(() => {
    mockRepository.getRegions().then(setRegions);
  }, []);

  const handleProvinceClick = async (province: string) => {
    setSelectedProvince(province);
    const sites = await mockRepository.getPublishedSites({ province });
    setProvinceSites(sites);
  };

  const handleBack = () => {
    setSelectedProvince(null);
    setProvinceSites([]);
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="font-serif text-3xl text-ink-600 mb-2">地区浏览</h1>
        <p className="text-ink-400 mb-8">按省份浏览碑刻分布</p>

        {selectedProvince && (
          <div className="flex items-center gap-2 text-sm mb-6">
            <button
              onClick={handleBack}
              className="text-vermilion-500 hover:text-vermilion-600 cursor-pointer"
            >
              全部省份
            </button>
            <ChevronRight size={14} className="text-ink-300" />
            <span className="text-ink-500 font-medium">{selectedProvince}</span>
            <span className="text-ink-300">({provinceSites.length} 处)</span>
          </div>
        )}

        {!selectedProvince ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {regions.map((r) => (
              <button
                key={r.id}
                onClick={() => handleProvinceClick(r.name)}
                className="card-stone p-5 text-left hover:-translate-y-1 transition-transform cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-vermilion-50 rounded-lg flex items-center justify-center text-vermilion-500 group-hover:bg-vermilion-100">
                    <MapPin size={20} />
                  </div>
                  {r.siteCount > 0 && (
                    <span className="text-xs bg-rice-100 text-ink-400 px-2 py-0.5 rounded-full">
                      {r.siteCount}
                    </span>
                  )}
                </div>
                <h3 className="font-medium text-ink-600 group-hover:text-vermilion-500 transition-colors">
                  {r.name}
                </h3>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {provinceSites.length === 0 ? (
              <div className="col-span-full">
                <EmptyState title="该省份暂无收录碑刻" />
              </div>
            ) : (
              provinceSites.map((s) => <SiteCard key={s.id} site={s} />)
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
