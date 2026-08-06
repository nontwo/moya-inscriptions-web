"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ImageGallery, SiteCard, EmptyState } from '@moya/ui';
import { mockRepository } from '@moya/data-access';
import { downloadJSON, downloadCSV } from '@/lib/export';
import type { SiteDetail } from '@moya/contracts';
import { MapPin, Clock, Tag, Download, Share2, ExternalLink, ChevronLeft } from 'lucide-react';
import AppLayout from '@/app/AppLayout';

export default function SiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    mockRepository.getSiteBySlug(slug).then((s) => {
      setSite(s);
      setLoading(false);
    });
  }, [slug]);

  const handleExport = (format: 'json' | 'csv') => {
    if (!site) return;
    if (format === 'json') {
      downloadJSON(site, `${site.slug}.json`);
    } else {
      const csv = `名称,朝代,年代,类型,书体,书家,地区,简介\n"${site.title}","${site.dynasty}","${site.dynastyYear}","${site.category}","${site.scriptType}","${site.calligrapher}","${site.region.province}${site.region.city}","${site.summary}"`;
      downloadCSV(csv, `${site.slug}.csv`);
    }
  };

  const handleShare = async () => {
    if (!site) return;
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: site.title, text: site.summary, url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-rice-200 rounded w-1/3" />
            <div className="aspect-[16/9] bg-rice-200 rounded-xl" />
            <div className="h-6 bg-rice-200 rounded w-2/3" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!site) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-12">
          <EmptyState title="未找到该碑刻" description="请检查链接是否正确" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-ink-400 hover:text-ink-600 mb-6 cursor-pointer">
          <ChevronLeft size={16} /> 返回
        </button>

        <h1 className="font-serif text-3xl md:text-4xl text-ink-600 font-bold mb-2">{site.title}</h1>
        {site.alias.length > 0 && (
          <p className="text-ink-400 mb-4">又名：{site.alias.join('、')}</p>
        )}

        <div className="flex items-center gap-2 mb-8">
          <button onClick={handleShare} className="btn-ghost flex items-center gap-1.5 cursor-pointer">
            <Share2 size={16} /> 分享
          </button>
          <div className="relative group">
            <button className="btn-ghost flex items-center gap-1.5 cursor-pointer">
              <Download size={16} /> 导出
            </button>
            <div className="absolute top-full left-0 mt-1 bg-white border border-rice-200 rounded-lg shadow-lg py-1 hidden group-hover:block z-10 min-w-[100px]">
              <button onClick={() => handleExport('json')} className="w-full text-left px-3 py-1.5 text-sm hover:bg-rice-50">JSON</button>
              <button onClick={() => handleExport('csv')} className="w-full text-left px-3 py-1.5 text-sm hover:bg-rice-50">CSV</button>
            </div>
          </div>
        </div>

        <section className="mb-10">
          <ImageGallery images={site.images} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="card-stone p-6">
              <h2 className="font-serif text-xl text-ink-600 font-semibold mb-4">基本信息</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow icon={<MapPin size={14} />} label="地区" value={`${site.region.province} ${site.region.city} ${site.region.county}`} />
                <InfoRow icon={<Clock size={14} />} label="年代" value={site.dynastyYear} />
                <InfoRow icon={<Tag size={14} />} label="类型" value={site.category} />
                <InfoRow icon={<Tag size={14} />} label="书体" value={site.scriptType} />
                <InfoRow label="书丹人" value={site.calligrapher} />
                <InfoRow label="刻工" value={site.engraver} />
                <InfoRow label="撰文" value={site.inscriber} />
                <InfoRow label="尺寸" value={site.dimensions} />
                <InfoRow label="字数" value={`${site.wordCount} 字`} />
                <InfoRow label="保存状况" value={site.preservationStatus} />
              </div>
              {site.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-rice-200">
                  {site.tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 bg-rice-100 text-ink-400 text-xs rounded-full">{t}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="card-stone p-6">
              <h2 className="font-serif text-xl text-ink-600 font-semibold mb-3">简介</h2>
              <p className="text-ink-500 leading-relaxed">{site.summary}</p>
              {site.fullDescription && (
                <p className="text-ink-500 leading-relaxed mt-3">{site.fullDescription}</p>
              )}
            </div>

            <div className="card-stone p-6">
              <h2 className="font-serif text-xl text-ink-600 font-semibold mb-4">书法赏析</h2>
              <div className="space-y-4">
                <CalligraphyBlock title="笔法" content={site.calligraphyFeatures.brushwork} />
                <CalligraphyBlock title="结体" content={site.calligraphyFeatures.structure} />
                <CalligraphyBlock title="章法" content={site.calligraphyFeatures.composition} />
                <CalligraphyBlock title="风格" content={site.calligraphyFeatures.style} />
                <CalligraphyBlock title="特征" content={site.calligraphyFeatures.features} />
                <CalligraphyBlock title="书法价值" content={site.calligraphyFeatures.significance} />
              </div>
            </div>

            {site.references.length > 0 && (
              <div className="card-stone p-6">
                <h2 className="font-serif text-xl text-ink-600 font-semibold mb-4">参考来源</h2>
                <div className="space-y-3">
                  {site.references.map((ref) => (
                    <div key={ref.id} className="text-sm text-ink-500">
                      <p className="font-medium text-ink-600">{ref.title}</p>
                      <p>{ref.citationText}</p>
                      {ref.url && (
                        <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-vermilion-500 hover:text-vermilion-600 inline-flex items-center gap-1 mt-1">
                          <ExternalLink size={12} /> 查看原文
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-6">
            {site.calligraphers.length > 0 && (
              <div className="card-stone p-5">
                <h3 className="font-medium text-ink-600 mb-3">相关书家</h3>
                <div className="space-y-3">
                  {site.calligraphers.map((c) => (
                    <div key={c.id} className="text-sm">
                      <p className="font-medium text-ink-600">{c.name}</p>
                      <p className="text-ink-400 text-xs">{c.dynasty} · {c.shortBio}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {site.calligraphyWorks.length > 0 && (
              <div className="card-stone p-5">
                <h3 className="font-medium text-ink-600 mb-3">关联书法作品</h3>
                <div className="space-y-2">
                  {site.calligraphyWorks.map((w) => (
                    <p key={w.id} className="text-sm text-ink-500">
                      <span className="text-ink-600">{w.title}</span>
                      <span className="text-ink-400 text-xs ml-2">{w.scriptType} · {w.calligrapherName}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="card-stone p-5">
              <h3 className="font-medium text-ink-600 mb-2">地理位置</h3>
              <p className="text-sm text-ink-500">{site.location.address}</p>
              <p className="text-xs text-ink-400 mt-1">
                坐标：{site.location.latitude.toFixed(4)}, {site.location.longitude.toFixed(4)}
                ({site.location.coordinateSystem})
              </p>
            </div>
          </aside>
        </div>

        <section className="mt-12 pt-8 border-t border-rice-300">
          <h2 className="font-serif text-2xl text-ink-600 font-semibold mb-6">相关碑刻</h2>
          <RelatedSites siteId={site.id} />
        </section>
      </div>
    </AppLayout>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  if (!value || value === '0 字') return null;
  return (
    <div className="flex items-start gap-1.5">
      {icon && <span className="text-ink-300 mt-0.5 flex-shrink-0">{icon}</span>}
      <span className="text-ink-400 flex-shrink-0">{label}:</span>
      <span className="text-ink-600">{value}</span>
    </div>
  );
}

function CalligraphyBlock({ title, content }: { title: string; content: string }) {
  if (!content) return null;
  return (
    <div className="quote-vermilion">
      <h4 className="text-sm font-semibold text-vermilion-600 mb-1">{title}</h4>
      <p className="text-sm text-ink-500 leading-relaxed">{content}</p>
    </div>
  );
}

function RelatedSites({ siteId }: { siteId: string }) {
  const [sites, setSites] = useState<SiteDetail[]>([]);
  useEffect(() => {
    mockRepository.getRelatedSites(siteId, 4).then((s) => {
      Promise.all(s.map((sum) => mockRepository.getSiteBySlug(sum.slug))).then((results) => {
        setSites(results.filter((s): s is SiteDetail => s !== null));
      });
    });
  }, [siteId]);

  if (sites.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {sites.map((s) => s && <SiteCard key={s.id} site={s} />)}
    </div>
  );
}
