"use client";

import type { SiteSummary } from "@moya/contracts";
import Link from "next/link";
import { MapPin, Clock, Tag } from "lucide-react";

interface SiteCardProps {
  site: SiteSummary;
}

export function SiteCard({ site }: SiteCardProps) {
  return (
    <Link
      href={`/sites/${site.slug}`}
      className="card-stone overflow-hidden group block cursor-pointer"
    >
      {/* 封面图 */}
      <div className="aspect-[4/3] overflow-hidden bg-rice-200 relative">
        <img
          src={site.coverThumbnail}
          alt={site.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-2 right-2 bg-vermilion-500 text-white text-xs px-2 py-0.5 rounded-full">
          {site.dynasty}
        </div>
      </div>

      {/* 信息 */}
      <div className="p-4 space-y-2">
        <h3 className="font-serif text-lg text-ink-600 font-semibold leading-tight group-hover:text-vermilion-500 transition-colors line-clamp-2">
          {site.title}
        </h3>

        {site.alias && site.alias.length > 0 && (
          <p className="text-xs text-ink-400">又名：{site.alias[0]}</p>
        )}

        <p className="text-sm text-ink-400 line-clamp-2 leading-relaxed">
          {site.summary}
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-ink-400">
          <span className="flex items-center gap-1">
            <MapPin size={12} />
            {site.region.province}
            {site.region.city}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {site.dynastyYear}
          </span>
        </div>

        {site.tags && site.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {site.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-0.5 px-1.5 py-0.5 bg-rice-100 text-ink-400 rounded text-xs"
              >
                <Tag size={10} />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

/** SiteCard Skeleton */
export function SiteCardSkeleton() {
  return (
    <div className="card-stone overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-rice-200" />
      <div className="p-4 space-y-3">
        <div className="h-5 bg-rice-200 rounded w-3/4" />
        <div className="h-4 bg-rice-200 rounded w-full" />
        <div className="h-4 bg-rice-200 rounded w-2/3" />
        <div className="flex gap-2 pt-1">
          <div className="h-5 bg-rice-200 rounded w-16" />
          <div className="h-5 bg-rice-200 rounded w-12" />
        </div>
      </div>
    </div>
  );
}
