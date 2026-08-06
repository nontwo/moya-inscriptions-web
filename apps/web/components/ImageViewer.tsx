import { useEffect, useRef, useState } from 'react';
import type { ImageAnnotation } from '@moya/contracts';
import { X, Info } from 'lucide-react';

interface ImageViewerProps {
  imageUrl: string;
  annotations?: ImageAnnotation[];
  caption?: string;
  onClose: () => void;
}

export default function ImageViewer({ imageUrl, annotations = [], caption, onClose }: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedAnn, setSelectedAnn] = useState<ImageAnnotation | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((s) => Math.min(Math.max(0.5, s + delta), 8));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setDragging(false);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.5, 8));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.5, 0.5));
  const handleReset = () => { setScale(1); setPosition({ x: 0, y: 0 }); };

  // 键盘事件
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === '0') handleReset();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 text-white">
        <div className="text-sm truncate max-w-[60%]">{caption || '图片查看'}</div>
        <div className="flex items-center gap-3">
          <span className="text-xs opacity-60">{Math.round(scale * 100)}%</span>
          <button onClick={handleZoomOut} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm cursor-pointer">-</button>
          <button onClick={handleReset} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm cursor-pointer">重置</button>
          <button onClick={handleZoomIn} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm cursor-pointer">+</button>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded cursor-pointer"><X size={20} /></button>
        </div>
      </div>

      {/* 图片区域 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: dragging ? 'grabbing' : scale > 1 ? 'grab' : 'default' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            ref={imageRef}
            src={imageUrl}
            alt={caption || ''}
            className="max-w-full max-h-full object-contain transition-transform duration-100 select-none"
            style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
            draggable={false}
          />

          {/* 标注热区 */}
          {annotations.map((ann) => (
            <div
              key={ann.id}
              className="absolute border-2 border-vermilion-500 bg-vermilion-500/10 hover:bg-vermilion-500/30 rounded cursor-pointer transition-colors"
              style={{
                left: `calc(50% + ${(ann.x / (imageRef.current?.naturalWidth || 1)) * (imageRef.current?.clientWidth || 800) * scale + position.x - (imageRef.current?.clientWidth || 800) * scale / 2}px)`,
                top: `calc(50% + ${(ann.y / (imageRef.current?.naturalHeight || 1)) * (imageRef.current?.clientHeight || 600) * scale + position.y - (imageRef.current?.clientHeight || 600) * scale / 2}px)`,
                width: `${ann.width * scale}px`,
                height: `${ann.height * scale}px`,
              }}
              onClick={(e) => { e.stopPropagation(); setSelectedAnn(ann); }}
              title={ann.label}
            />
          ))}
        </div>

        {/* 标注详情气泡 */}
        {selectedAnn && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl p-4 max-w-sm z-10 animate-fade-in">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Info size={16} className="text-vermilion-500" />
                <h4 className="font-medium text-ink-600">{selectedAnn.label}</h4>
              </div>
              <button onClick={() => setSelectedAnn(null)} className="text-ink-300 hover:text-ink-500 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            {selectedAnn.characterInfo && (
              <p className="text-sm text-ink-500 mb-1">{selectedAnn.characterInfo}</p>
            )}
            {selectedAnn.description && (
              <p className="text-sm text-ink-400">{selectedAnn.description}</p>
            )}
            {selectedAnn.calligraphyNote && (
              <p className="text-xs text-vermilion-500 mt-2 pt-2 border-t border-rice-200">{selectedAnn.calligraphyNote}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
