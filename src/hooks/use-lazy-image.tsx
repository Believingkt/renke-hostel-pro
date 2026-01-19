import { useEffect, useRef, useState, useCallback } from "react";

interface UseLazyImageOptions {
  rootMargin?: string;
  threshold?: number;
  lowQualityUrl?: string;
  onLoad?: () => void;
  onError?: () => void;
}

interface UseLazyImageReturn {
  imageSrc: string | null;
  isLoaded: boolean;
  isError: boolean;
  imgRef: React.RefObject<HTMLImageElement>;
  handleLoad: () => void;
  handleError: () => void;
  retry: () => void;
}

/**
 * 增強版懶加載圖片 Hook
 * 支援：
 * - 視口內載入
 * - 載入狀態追蹤
 * - 錯誤處理和重試
 * - 低品質預覽圖（LQIP）
 */
export const useLazyImage = (
  src: string, 
  options: UseLazyImageOptions = {}
): UseLazyImageReturn => {
  const {
    rootMargin = "150px",
    threshold = 0.01,
    lowQualityUrl,
    onLoad,
    onError,
  } = options;

  const [imageSrc, setImageSrc] = useState<string | null>(lowQualityUrl || null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // 預載入圖片
            const img = new Image();
            img.src = src;
            
            img.onload = () => {
              setImageSrc(src);
            };
            
            img.onerror = () => {
              // 即使預載入失敗，也設置 src 讓實際 img 元素處理錯誤
              setImageSrc(src);
            };
            
            observer.disconnect();
          }
        });
      },
      { rootMargin, threshold }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, [src, rootMargin, threshold, retryCount]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    setIsError(false);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setIsError(true);
    setIsLoaded(true);
    onError?.();
  }, [onError]);

  const retry = useCallback(() => {
    setIsError(false);
    setIsLoaded(false);
    setRetryCount((c) => c + 1);
    // 加上時間戳避免緩存
    const timestamp = Date.now();
    const separator = src.includes('?') ? '&' : '?';
    setImageSrc(`${src}${separator}_retry=${timestamp}`);
  }, [src]);

  return { imageSrc, isLoaded, isError, imgRef, handleLoad, handleError, retry };
};

/**
 * 批量預載入圖片
 * 適用於輪播圖等需要提前載入多張圖片的場景
 */
export const preloadImages = (urls: string[], priority: 'high' | 'low' = 'low'): Promise<void[]> => {
  return Promise.all(
    urls.map((url) => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        if (priority === 'high') {
          img.fetchPriority = 'high';
        }
        img.onload = () => resolve();
        img.onerror = () => resolve(); // 即使失敗也 resolve，避免阻塞
        img.src = url;
      });
    })
  );
};

/**
 * 智能預載入下一張圖片
 */
export const preloadNextImage = (url: string): void => {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
};

