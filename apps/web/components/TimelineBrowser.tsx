import { useState, useEffect, useRef } from "react";
import { mockRepository } from "@moya/data-access";
import type { Dynasty } from "@moya/contracts";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TimelineData {
  dynasty: Dynasty;
  yearStart: number;
  yearEnd: number;
  siteCount: number;
}

interface TimelineBrowserProps {
  onSelectDynasty?: (dynasty: Dynasty) => void;
}

export default function TimelineBrowser({
  onSelectDynasty,
}: TimelineBrowserProps) {
  const [data, setData] = useState<TimelineData[]>([]);
  const [selected, setSelected] = useState<Dynasty | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mockRepository.getDynastyTimeline().then((d) => {
      setData(d.filter((item) => item.siteCount > 0 || item.yearStart > 0));
    });
  }, []);

  const handleSelect = (dynasty: Dynasty) => {
    setSelected(selected === dynasty ? null : dynasty);
    onSelectDynasty?.(dynasty);
  };

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: dir === "left" ? -300 : 300,
        behavior: "smooth",
      });
    }
  };

  const allYears = data.flatMap((d) => [d.yearStart, d.yearEnd]);
  const minYear = Math.min(...allYears.filter((y) => y !== 0));
  const maxYear = Math.max(...allYears);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => scroll("left")}
          className="p-1 hover:bg-rice-200 rounded cursor-pointer"
        >
          <ChevronLeft size={18} className="text-ink-400" />
        </button>
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto flex items-end gap-1 pb-2 scroll-smooth"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {data.map((item) => {
            const leftPercent =
              ((item.yearStart - minYear) / (maxYear - minYear)) * 100;
            const widthPercent =
              ((item.yearEnd - item.yearStart) / (maxYear - minYear)) * 100;
            const isSelected = selected === item.dynasty;
            const hasSites = item.siteCount > 0;

            return (
              <button
                key={item.dynasty}
                onClick={() => hasSites && handleSelect(item.dynasty)}
                className="flex-shrink-0 relative cursor-pointer group"
                style={{ scrollSnapAlign: "center" }}
              >
                {/* 朝代条 */}
                <div
                  className={`h-8 rounded-lg transition-all min-w-[48px] flex items-center justify-center px-3 ${
                    isSelected
                      ? "bg-vermilion-500 text-white shadow-lg"
                      : hasSites
                        ? "bg-vermilion-100 text-vermilion-600 hover:bg-vermilion-200"
                        : "bg-rice-200 text-ink-300"
                  }`}
                >
                  <span className="text-xs font-medium whitespace-nowrap">
                    {item.dynasty}
                  </span>
                </div>

                {/* 数量徽章 */}
                {hasSites && (
                  <div
                    className={`absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isSelected
                        ? "bg-white text-vermilion-500"
                        : "bg-vermilion-500 text-white"
                    } shadow-md`}
                  >
                    {item.siteCount}
                  </div>
                )}

                {/* 年份 */}
                <div className="text-[10px] text-ink-300 text-center mt-1">
                  {item.yearStart > 0 ? `${item.yearStart}` : ""}
                </div>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => scroll("right")}
          className="p-1 hover:bg-rice-200 rounded cursor-pointer"
        >
          <ChevronRight size={18} className="text-ink-400" />
        </button>
      </div>

      {/* 时间线 */}
      <div className="h-0.5 bg-rice-300 rounded-full relative mx-6">
        <div
          className="absolute inset-y-0 bg-vermilion-400 rounded-full"
          style={{
            left: `${selected ? (data.findIndex((d) => d.dynasty === selected) / data.length) * 100 : 0}%`,
            width: `${selected ? 100 / data.length : 0}%`,
            transition: "all 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}
