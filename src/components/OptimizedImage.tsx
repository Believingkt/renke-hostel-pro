import { useState, useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  aspectRatio?: string;
  width?: string;
  height?: string;
  sizes?: string;
  onLoad?: () => void;
  onClick?: () => void;
  blurDataURL?: string;
}

export const OptimizedImage = ({
  src,
  alt,
  className = "",
  priority = false,
  aspectRatio,
  width = "1920",
  height = "1080",
  sizes = "100vw",
  onLoad,
  onClick,
  blurDataURL,
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [showBlur, setShowBlur] = useState(true);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (priority) return; // 優先圖片立即載入

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: "100px", // 提前 100px 開始載入
        threshold: 0.01,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [priority]);

  const handleLoad = () => {
    setIsLoaded(true);
    // 延遲隱藏模糊層，讓淡入效果更平滑
    setTimeout(() => {
      setShowBlur(false);
    }, 300);
    onLoad?.();
  };

  return (
    <div 
      ref={imgRef} 
      className={`${aspectRatio || "relative w-full h-full"} overflow-hidden`}
      onClick={onClick}
    >
      {/* 骨架屏或模糊預覽 */}
      {!isLoaded && (
        <>
          {blurDataURL && showBlur ? (
            <div 
              className="absolute inset-0 w-full h-full bg-cover bg-center"
              style={{
                backgroundImage: `url(${blurDataURL})`,
                filter: 'blur(20px)',
                transform: 'scale(1.1)',
              }}
            />
          ) : (
            <Skeleton className="absolute inset-0 w-full h-full animate-pulse" />
          )}
        </>
      )}
      
      {/* 主圖片 */}
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={`${className} ${
            isLoaded 
              ? 'opacity-100 scale-100' 
              : 'opacity-0 scale-105'
          } transition-all duration-700 ease-out`}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding={priority ? "sync" : "async"}
          width={width}
          height={height}
          sizes={sizes}
          onLoad={handleLoad}
        />
      )}
    </div>
  );
};
