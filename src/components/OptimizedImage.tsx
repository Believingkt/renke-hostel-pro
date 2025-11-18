import { useState, useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { calculateOptimalImageSize } from "@/utils/responsiveImageHelper";
import { getCDNUrl } from "@/utils/cdnHelper";
import { useNetworkStatus } from "@/hooks/use-network-status";

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
  useCDN?: boolean;
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
  useCDN = true,
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [showBlur, setShowBlur] = useState(true);
  const [optimalSrc, setOptimalSrc] = useState(src);
  const imgRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const { speed: networkSpeed } = useNetworkStatus();

  // 計算最佳圖片尺寸並應用 CDN
  useEffect(() => {
    if (!imgRef.current) return;

    const updateOptimalSize = () => {
      const containerWidth = imgRef.current?.offsetWidth || parseInt(width);
      const optimalWidth = responsive ? calculateOptimalImageSize(containerWidth) : parseInt(width);
      const optimalHeight = responsive ? Math.round((optimalWidth * parseInt(height)) / parseInt(width)) : parseInt(height);
      
      // 根據網路速度調整圖片品質
      let quality = 85;
      let format: 'auto' | 'webp' | 'avif' | 'jpg' | 'png' = 'auto';
      
      if (networkSpeed === 'slow') {
        quality = 60; // 慢速網路降低品質到 60
        format = 'webp'; // 強制使用 WebP 格式以減小檔案大小
      } else if (networkSpeed === 'offline') {
        quality = 40; // 離線時使用極低品質
        format = 'webp';
      }
      
      // 應用 CDN 轉換
      if (useCDN) {
        const cdnUrl = getCDNUrl(src, optimalWidth, optimalHeight, quality, format);
        setOptimalSrc(cdnUrl);
      } else {
        setOptimalSrc(src);
      }
    };

    updateOptimalSize();

    // 監聽視窗大小變化
    if (responsive) {
      const resizeObserver = new ResizeObserver(updateOptimalSize);
      if (imgRef.current) {
        resizeObserver.observe(imgRef.current);
      }

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [src, width, height, responsive, useCDN, networkSpeed]);

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
        rootMargin: "200px", // 提前 200px 開始載入，提升體驗
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
      className={`${aspectRatio || "relative w-full h-full"} overflow-hidden bg-muted`}
      onClick={onClick}
    >
      {/* 低解析度預覽層 */}
      {blurDataURL && showBlur && (
        <div 
          className="absolute inset-0 w-full h-full bg-cover bg-center transition-opacity duration-500"
          style={{
            backgroundImage: `url(${blurDataURL})`,
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
            opacity: isLoaded ? 0 : 1,
          }}
        />
      )}
      
      {/* 骨架屏 - 當沒有模糊預覽時顯示 */}
      {!blurDataURL && (!isLoaded || !isInView) && (
        <div className="absolute inset-0 w-full h-full">
          <Skeleton className="w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-br from-muted/50 to-muted animate-pulse" />
        </div>
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
