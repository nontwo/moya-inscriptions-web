import { useEffect, useRef } from 'react';
import type { PlatformStats } from '@moya/contracts';

interface StatsDashboardProps {
  stats: PlatformStats;
}

export default function StatsDashboard({ stats }: StatsDashboardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 朝代柱状图 */}
      <div className="card-stone p-5">
        <h3 className="text-sm font-semibold text-ink-600 mb-4">朝代分布</h3>
        <BarChart data={stats.dynastyDistribution.filter((d) => d.count > 0)} />
      </div>

      {/* 类型饼图 */}
      <div className="card-stone p-5">
        <h3 className="text-sm font-semibold text-ink-600 mb-4">碑刻类型</h3>
        <PieChart data={stats.categoryDistribution.filter((c) => c.count > 0)} />
      </div>

      {/* 书体分布 */}
      <div className="card-stone p-5">
        <h3 className="text-sm font-semibold text-ink-600 mb-4">书体分布</h3>
        <BarChart data={stats.scriptTypeDistribution.filter((s) => s.count > 0)} />
      </div>

      {/* 省份热力图 */}
      <div className="card-stone p-5">
        <h3 className="text-sm font-semibold text-ink-600 mb-4">省份分布</h3>
        <HeatmapChart data={stats.provinceDistribution} />
      </div>
    </div>
  );
}

function BarChart({ data }: { data: { count: number; [key: string]: unknown }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maxVal = Math.max(...data.map((d) => d.count), 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = 200;
    ctx.scale(2, 2);
    const bw = (canvas.offsetWidth - 40) / data.length;

    data.forEach((d, i) => {
      const bh = (d.count / maxVal) * 160;
      const x = 20 + i * bw;
      const y = h / 2 - bh;

      const gradient = ctx.createLinearGradient(x, y, x, h / 2);
      gradient.addColorStop(0, '#E8485E');
      gradient.addColorStop(1, '#C41E3A');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x + 4, y, bw - 8, bh, [4, 4, 0, 0]);
      ctx.fill();

      ctx.fillStyle = '#5C5C5C';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(d.count), x + bw / 2, y - 6);

      const label = String(Object.values(d)[0] || '');
      ctx.fillStyle = '#8C8C8C';
      ctx.font = '9px sans-serif';
      ctx.fillText(label.length > 3 ? label.slice(0, 3) : label, x + bw / 2, h / 2 + 14);
    });
  }, [data, maxVal]);

  return <canvas ref={canvasRef} className="w-full h-[200px]" />;
}

function PieChart({ data }: { data: { count: number; [key: string]: unknown }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const colors = ['#C41E3A', '#E8485E', '#F8717D', '#FCA5B0', '#FEE2E5', '#D4A574', '#8C8C8C'];

  let accumulated = 0;
  const slices = data.map((d, i) => {
    const percent = d.count / total;
    const start = accumulated;
    accumulated += percent;
    return { ...d, percent, start, end: accumulated, color: colors[i % colors.length] };
  });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-24 h-24 flex-shrink-0">
        {slices.map((s, i) => {
          const r = 50;
          const startAngle = s.start * 2 * Math.PI - Math.PI / 2;
          const endAngle = s.end * 2 * Math.PI - Math.PI / 2;
          const x1 = 50 + r * Math.cos(startAngle);
          const y1 = 50 + r * Math.sin(startAngle);
          const x2 = 50 + r * Math.cos(endAngle);
          const y2 = 50 + r * Math.sin(endAngle);
          const largeArc = s.percent > 0.5 ? 1 : 0;
          return (
            <path
              key={i}
              d={`M 50 50 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={s.color}
            />
          );
        })}
      </svg>
      <div className="space-y-1 text-xs">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-ink-500">{String(Object.values(s)[0] || '')}</span>
            <span className="text-ink-300">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatmapChart({ data }: { data: { province: string; count: number }[] }) {
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.province} className="flex items-center gap-3 text-xs">
          <span className="w-12 text-right text-ink-500 flex-shrink-0">{d.province}</span>
          <div className="flex-1 h-5 bg-rice-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-vermilion-400 to-vermilion-500 rounded-full transition-all duration-1000"
              style={{ width: `${(d.count / maxVal) * 100}%` }}
            />
          </div>
          <span className="w-8 text-ink-400 flex-shrink-0">{d.count}</span>
        </div>
      ))}
    </div>
  );
}
