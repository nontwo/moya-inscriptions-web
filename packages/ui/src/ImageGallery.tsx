import { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import type { ImageAsset } from "@moya/contracts";

interface ImageGalleryProps {
  images: ImageAsset[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [scale, setScale] = useState(1);

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex((index + images.length) % images.length);
      setScale(1);
    },
    [images.length],
  );

  if (!images.length) {
    return (
      <div className="aspect-[16/9] bg-rice-200 rounded-xl flex items-center justify-center text-ink-400">
        暂无图片
      </div>
    );
  }

  const current = images[currentIndex];

  return (
    <>
      {/* 主图轮播 */}
      <div className="relative">
        <div className="aspect-[16/9] bg-rice-200 rounded-xl overflow-hidden relative group">
          <img
            src={current.displayKey}
            alt={current.caption || ""}
            className="w-full h-full object-cover cursor-zoom-in"
            onClick={() => setLightboxOpen(true)}
          />

          {/* 左右箭头 */}
          {images.length > 1 && (
            <>
              <button
                onClick={() => goTo(currentIndex - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white
                           rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100
                           transition-opacity cursor-pointer"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => goTo(currentIndex + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white
                           rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100
                           transition-opacity cursor-pointer"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          {/* 图片计数 */}
          <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
            {currentIndex + 1} / {images.length}
          </div>
        </div>

        {/* 标题 */}
        {current.caption && (
          <p className="mt-2 text-sm text-ink-400 text-center">
            {current.caption}
          </p>
        )}
      </div>

      {/* 缩略图列表 */}
      {images.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => goTo(i)}
              className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                i === currentIndex
                  ? "border-vermilion-500 opacity-100"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <img
                src={img.thumbnailKey}
                alt={img.caption || ""}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* 灯箱模式 */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white cursor-pointer z-10"
          >
            <X size={28} />
          </button>

          <button
            onClick={() => setScale((s) => Math.min(s + 0.5, 5))}
            className="absolute top-4 left-4 text-white/80 hover:text-white cursor-pointer z-10"
          >
            <ZoomIn size={24} />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(s - 0.5, 0.5))}
            className="absolute top-16 left-4 text-white/80 hover:text-white cursor-pointer z-10"
          >
            <ZoomOut size={24} />
          </button>

          <img
            src={current.displayKey}
            alt={current.caption || ""}
            className="max-w-[95vw] max-h-[95vh] object-contain transition-transform duration-200"
            style={{ transform: `scale(${scale})` }}
            onClick={(e) => e.stopPropagation()}
          />

          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(currentIndex - 1);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/40
                           rounded-full flex items-center justify-center cursor-pointer"
              >
                <ChevronLeft size={24} className="text-white" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(currentIndex + 1);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/40
                           rounded-full flex items-center justify-center cursor-pointer"
              >
                <ChevronRight size={24} className="text-white" />
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
