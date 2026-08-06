import { useState } from "react";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: string;
}

export function LazyImage({
  src,
  alt,
  className = "",
  fallback,
}: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error && fallback) {
    return <img src={fallback} alt={alt} className={className} />;
  }

  if (error) {
    return (
      <div
        className={`${className} bg-rice-200 flex items-center justify-center text-ink-300 text-sm`}
      >
        图片加载失败
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 bg-rice-200 animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
