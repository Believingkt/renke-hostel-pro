import { useState, useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { calculateOptimalImageSize } from "@/utils/responsiveImageHelper";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  aspectRatio?: string;
  width?: string;
  height?: string;
  sizes?: string;
  srcSet?: string;
  onLoad?: () => void;
  onClick?: () => void;
  blurDataURL?: string;
  responsive?: boolean;
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
  srcSet,
  onLoad,
  onClick,
  blurDataURL,
  responsive = true,
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [showBlur, setShowBlur] = useState(true);
  const [optimalSrc, setOptimalSrc] = useState(src);
  const imgRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // 計算最佳圖片尺寸
  useEffect(() => {
    if (!responsive || !imgRef.current) return;

    const updateOptimalSize = () => {
      const containerWidth = imgRef.current?.offsetWidth || parseInt(width);
      const optimalWidth = calculateOptimalImageSize(containerWidth);
      
      // 對於本地圖片或非 Supabase 圖片，直接使用原始 URL
      if (!src.includes('supabase.co/storage')) {
        setOptimalSrc(src);
        return;
      }
      
      // 這裡可以根據需要添加 Supabase Storage 的圖片轉換參數
      // 目前直接使用原始 URL，因為 Supabase Storage 的圖片轉換 API 需要特定設置
      setOptimalSrc(src);
    };

    updateOptimalSize();

    // 監聽視窗大小變化
    const resizeObserver = new ResizeObserver(updateOptimalSize);
    if (imgRef.current) {
      resizeObserver.observe(imgRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [src, width, responsive]);

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
        <picture>
          {/* WebP 版本（如果有 srcSet）*/}
          {srcSet && (
            <source type="image/webp" srcSet={srcSet} sizes={sizes} />
          )}
          
          {/* 回退到原始圖片 */}
          <img
            ref={imageRef}
            src={optimalSrc}
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
        </picture>
      )}
    </div>
  );
};
