import { useState, useEffect, useRef } from "react";
import { ImageOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateOptimalImageSize } from "@/utils/responsiveImageHelper";
import { getCDNUrl } from "@/utils/cdnHelper";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { generateResponsiveSrcSet, STANDARD_RESPONSIVE_WIDTHS } from "@/utils/responsiveSrcSetHelper";
import { getBestFormatSync, type ImageFormat } from "@/utils/imageFormatHelper";

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
  autoRetryOnReconnect?: boolean; // 是否在網路恢復時自動重試一次（預設 true）
  maxRetries?: number; // 最大手動重試次數
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
  autoRetryOnReconnect = true,
  maxRetries = 3,
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [showBlur, setShowBlur] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [optimalSrc, setOptimalSrc] = useState(src);
  const [generatedSrcSet, setGeneratedSrcSet] = useState<string>("");
  const [generatedSrcSetFormat, setGeneratedSrcSetFormat] = useState<'auto' | 'webp'>('auto');
  const imgRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const { speed: networkSpeed } = useNetworkStatus();
  const prevNetworkSpeedRef = useRef(networkSpeed);

  // 計算最佳圖片尺寸並應用 CDN 和格式轉換
  useEffect(() => {
    if (!imgRef.current) return;

    const updateOptimalSize = () => {
      const containerWidth = imgRef.current?.offsetWidth || parseInt(width);
      const optimalWidth = responsive ? calculateOptimalImageSize(containerWidth) : parseInt(width);
      const optimalHeight = responsive ? Math.round((optimalWidth * parseInt(height)) / parseInt(width)) : parseInt(height);
      
      // 根據網路速度和瀏覽器支援調整圖片品質和格式
      let quality = 85;

      const bestFormat = getBestFormatSync();
      // 目前後端圖片轉換僅穩定支援 WebP，因此即使瀏覽器支援 AVIF 也先回退為 WebP
      let format: ImageFormat = bestFormat === 'avif' ? 'webp' : bestFormat;

      if (networkSpeed === 'slow') {
        quality = 60; // 慢速網路降低品質到 60
        format = 'webp';
      } else if (networkSpeed === 'offline') {
        quality = 40; // 離線時使用極低品質
        format = 'webp';
      }

      const srcSetFormat: 'auto' | 'webp' = format === 'webp' ? 'webp' : 'auto';
      
      // 應用 CDN 轉換
      if (useCDN) {
        const cdnUrl = getCDNUrl(src, optimalWidth, optimalHeight, quality, format);
        setOptimalSrc(cdnUrl);

        // 自動生成響應式 srcset
        if (autoSrcSet && !srcSet) {
          const widths = STANDARD_RESPONSIVE_WIDTHS[imageType];
          const responsiveSrcSet = generateResponsiveSrcSet(src, widths, quality, format);
          setGeneratedSrcSetFormat(srcSetFormat);
          setGeneratedSrcSet(responsiveSrcSet);
        } else {
          setGeneratedSrcSetFormat('auto');
          setGeneratedSrcSet("");
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
    if (priority) {
      setIsInView(true);
      return;
    }

    // 手機版使用更激進的預載入距離
    const isMobile = window.innerWidth < 768;
    const effectiveRootMargin = isMobile ? "300px" : "200px";

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
        rootMargin: effectiveRootMargin,
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

  // 監聽網路狀態變化：僅當網路從離線恢復時自動重試一次
  const hasAutoRetriedRef = useRef(false);
  
  useEffect(() => {
    if (!autoRetryOnReconnect) return;
    const prevSpeed = prevNetworkSpeedRef.current;

    // 網路從 offline 恢復到 online 時，自動重試一次（且尚未自動重試過）
    if (
      hasError &&
      !isRetrying &&
      !hasAutoRetriedRef.current &&
      prevSpeed === 'offline' &&
      networkSpeed !== 'offline'
    ) {
      hasAutoRetriedRef.current = true;
      handleRetry();
    }

    prevNetworkSpeedRef.current = networkSpeed;
  }, [networkSpeed, hasError, isRetrying, autoRetryOnReconnect]);


  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
    setIsRetrying(false);
    setRetryCount(0);
    hasAutoRetriedRef.current = false;
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
      setOptimalSrc(fallbackSrc);
      setRetryCount(retryCount + 1);
      return;
    }
    
    // 載入失敗直接顯示錯誤狀態（使用者可手動重試，或等待網路恢復自動重試一次）
    setHasError(true);
  };

  const handleRetry = () => {
    if (retryCount >= maxRetries) {
      setHasError(true);
      setIsRetrying(false);
      return;
    }
    
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
      const bestFormat = getBestFormatSync();
      let format: 'auto' | 'webp' | 'jpg' | 'png' =
        bestFormat === 'webp' || bestFormat === 'avif'
          ? 'webp'
          : bestFormat === 'png'
            ? 'png'
            : bestFormat === 'jpg'
              ? 'jpg'
              : 'auto';

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
          className="absolute inset-0 w-full h-full bg-cover bg-center"
          style={{
            backgroundImage: `url(${blurDataURL})`,
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
            opacity: isLoaded ? 0 : 1,
            transition: 'opacity 500ms ease-out',
          }}
        />
      )}
      
      {/* 簡單的背景色 - 只在沒有模糊預覽時顯示 */}
      {!blurDataURL && !isLoaded && !hasError && (
        <div className="absolute inset-0 w-full h-full bg-muted/20" />
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
          {/* 使用生成的 srcSet（僅在確認為 WebP 時才提供 <source type>，避免型別與實際格式不一致） */}
          {!srcSet && generatedSrcSet && generatedSrcSetFormat === 'webp' && (
            <source type="image/webp" srcSet={generatedSrcSet} sizes={sizes} />
          )}
          
          {/* 回退到原始圖片 */}
          <img
            ref={imageRef}
            src={optimalSrc}
            srcSet={srcSet || generatedSrcSet || undefined}
            alt={alt}
            className={`${className} ${
              isLoaded 
                ? 'opacity-100' 
                : 'opacity-0'
            } transition-opacity duration-500 ease-out`}
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
