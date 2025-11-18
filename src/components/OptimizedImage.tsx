import { useState, useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateOptimalImageSize } from "@/utils/responsiveImageHelper";
import { getCDNUrl } from "@/utils/cdnHelper";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { generateSrcSet, generateResponsiveSrcSet, STANDARD_RESPONSIVE_WIDTHS } from "@/utils/responsiveSrcSetHelper";

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
  autoSrcSet?: boolean;
  imageType?: 'thumbnail' | 'small' | 'medium' | 'large' | 'hero';
  fallbackSrc?: string;
  onError?: () => void;
  maxRetries?: number; // 最大重試次數
  retryDelay?: number; // 重試延遲（毫秒）
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
  autoSrcSet = true,
  imageType = 'medium',
  fallbackSrc,
  onError,
  maxRetries = 3,
  retryDelay = 2000,
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [showBlur, setShowBlur] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [optimalSrc, setOptimalSrc] = useState(src);
  const [generatedSrcSet, setGeneratedSrcSet] = useState<string>("");
  const imgRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const { speed: networkSpeed } = useNetworkStatus();
  const prevNetworkSpeedRef = useRef(networkSpeed);

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
        
        // 自動生成響應式 srcset
        if (autoSrcSet && !srcSet) {
          const widths = STANDARD_RESPONSIVE_WIDTHS[imageType];
          const responsiveSrcSet = generateResponsiveSrcSet(src, widths, quality, format);
          setGeneratedSrcSet(responsiveSrcSet);
        }
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
  }, [src, width, height, responsive, useCDN, networkSpeed, autoSrcSet, imageType, srcSet]);

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

  // 監聽網路狀態變化，自動重試
  useEffect(() => {
    const prevSpeed = prevNetworkSpeedRef.current;
    
    // 網路從 offline/slow 恢復到 fast 時，自動重試失敗的圖片
    if (hasError && !isRetrying && retryCount < maxRetries) {
      if (
        (prevSpeed === 'offline' && networkSpeed !== 'offline') ||
        (prevSpeed === 'slow' && networkSpeed === 'fast')
      ) {
        console.log(`網路恢復，自動重試載入圖片: ${src}`);
        handleRetry();
      }
    }
    
    prevNetworkSpeedRef.current = networkSpeed;
  }, [networkSpeed, hasError, isRetrying, retryCount, maxRetries]);

  // 清理重試計時器
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
    setIsRetrying(false);
    setRetryCount(0);
    setTimeout(() => {
      setShowBlur(false);
    }, 300);
    onLoad?.();
  };

  const handleError = () => {
    setIsLoaded(true);
    setShowBlur(false);
    setIsRetrying(false);
    onError?.();
    
    // 如果有後備圖片且還沒嘗試過，使用後備圖片
    if (fallbackSrc && optimalSrc !== fallbackSrc && retryCount === 0) {
      console.log(`主圖片載入失敗，嘗試後備圖片: ${fallbackSrc}`);
      setOptimalSrc(fallbackSrc);
      setRetryCount(retryCount + 1);
      return;
    }
    
    // 如果還有重試次數，自動重試
    if (retryCount < maxRetries) {
      console.log(`圖片載入失敗，將在 ${retryDelay}ms 後重試 (${retryCount + 1}/${maxRetries})`);
      setIsRetrying(true);
      
      retryTimeoutRef.current = setTimeout(() => {
        handleRetry();
      }, retryDelay);
    } else {
      // 重試次數用完，顯示錯誤狀態
      setHasError(true);
      console.log(`圖片載入失敗，已達最大重試次數: ${src}`);
    }
  };

  const handleRetry = () => {
    if (retryCount >= maxRetries) {
      setHasError(true);
      setIsRetrying(false);
      return;
    }
    
    console.log(`重試載入圖片 (${retryCount + 1}/${maxRetries}): ${src}`);
    setIsRetrying(true);
    setHasError(false);
    setIsLoaded(false);
    setRetryCount(retryCount + 1);
    
    // 強制重新載入圖片（添加時間戳避免快取）
    const timestamp = Date.now();
    const separator = src.includes('?') ? '&' : '?';
    const newSrc = `${src}${separator}_retry=${timestamp}`;
    
    // 重新計算最佳尺寸並重試
    if (imgRef.current) {
      const containerWidth = imgRef.current.offsetWidth || parseInt(width);
      const optimalWidth = responsive ? calculateOptimalImageSize(containerWidth) : parseInt(width);
      const optimalHeight = responsive ? Math.round((optimalWidth * parseInt(height)) / parseInt(width)) : parseInt(height);
      
      let quality = 85;
      let format: 'auto' | 'webp' | 'avif' | 'jpg' | 'png' = 'auto';
      
      if (networkSpeed === 'slow') {
        quality = 60;
        format = 'webp';
      } else if (networkSpeed === 'offline') {
        quality = 40;
        format = 'webp';
      }
      
      if (useCDN) {
        const cdnUrl = getCDNUrl(newSrc, optimalWidth, optimalHeight, quality, format);
        setOptimalSrc(cdnUrl);
      } else {
        setOptimalSrc(newSrc);
      }
    }
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
          className="absolute inset-0 w-full h-full bg-cover bg-center transition-opacity duration-300"
          style={{
            backgroundImage: `url(${blurDataURL})`,
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
            opacity: isLoaded ? 0 : 1,
          }}
        />
      )}
      
      {/* 簡化的載入狀態 - 只在沒有模糊預覽時顯示 */}
      {!blurDataURL && !isLoaded && !hasError && (
        <div className="absolute inset-0 w-full h-full bg-muted/30" />
      )}
      
      {/* 重試中狀態 */}
      {isRetrying && (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-muted/50">
          <RefreshCw className="w-12 h-12 text-primary animate-spin mb-2" />
          <p className="text-xs text-muted-foreground">重新載入中...</p>
        </div>
      )}
      
      {/* 錯誤狀態 */}
      {hasError && !isRetrying && (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-muted/50 gap-2">
          <ImageOff className="w-12 h-12 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">無法載入圖片</p>
          {retryCount < maxRetries && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleRetry();
              }}
              className="mt-2"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              手動重試
            </Button>
          )}
        </div>
      )}
      
      {/* 主圖片 */}
      {isInView && !hasError && !isRetrying && (
        <picture>
          {/* 使用生成的 srcSet 或提供的 srcSet */}
          {(generatedSrcSet || srcSet) && (
            <>
              <source 
                type="image/webp" 
                srcSet={generatedSrcSet || srcSet} 
                sizes={sizes} 
              />
              <source 
                type="image/avif" 
                srcSet={generatedSrcSet || srcSet} 
                sizes={sizes} 
              />
            </>
          )}
          
          {/* 回退到原始圖片 */}
          <img
            ref={imageRef}
            src={optimalSrc}
            srcSet={generatedSrcSet || srcSet}
            alt={alt}
            className={`${className} ${
              isLoaded 
                ? 'opacity-100 scale-100' 
                : 'opacity-0 scale-105'
            } transition-all duration-300 ease-out`}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding={priority ? "sync" : "async"}
            width={width}
            height={height}
            sizes={sizes}
            onLoad={handleLoad}
            onError={handleError}
          />
        </picture>
      )}
    </div>
  );
};
