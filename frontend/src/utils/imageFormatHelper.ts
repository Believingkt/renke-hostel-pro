/**
 * 圖片格式自動轉換工具
 * 支援 WebP/AVIF 瀏覽器偵測和智能格式選擇
 */

export type ImageFormat = 'avif' | 'webp' | 'jpg' | 'png' | 'auto';

interface FormatSupport {
  avif: boolean;
  webp: boolean;
}

// 快取格式支援狀態
let formatSupportCache: FormatSupport | null = null;

/**
 * 檢測瀏覽器對 AVIF 和 WebP 的支援
 */
export const detectFormatSupport = async (): Promise<FormatSupport> => {
  if (formatSupportCache) {
    return formatSupportCache;
  }

  const checkSupport = (dataUri: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.width > 0 && img.height > 0);
      img.onerror = () => resolve(false);
      img.src = dataUri;
    });
  };

  // AVIF 測試圖片 (1x1 像素)
  const avifTestUri = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKBzgABokYAxAgGDIhAAAAQA==';

  // WebP 測試圖片 (1x1 像素)
  const webpTestUri = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

  const [avifSupport, webpSupport] = await Promise.all([
    checkSupport(avifTestUri),
    checkSupport(webpTestUri),
  ]);

  formatSupportCache = {
    avif: avifSupport,
    webp: webpSupport,
  };

  return formatSupportCache;
};

/**
 * 同步獲取格式支援狀態（如果已快取）
 */
export const getFormatSupportSync = (): FormatSupport | null => {
  return formatSupportCache;
};

/**
 * 初始化格式支援偵測（應在 App 啟動時調用）
 */
export const initFormatDetection = (): void => {
  detectFormatSupport().catch(console.error);
};

/**
 * 獲取最佳圖片格式
 * 優先級：AVIF > WebP > 原格式
 */
export const getBestFormat = async (): Promise<ImageFormat> => {
  const support = await detectFormatSupport();
  
  if (support.avif) return 'avif';
  if (support.webp) return 'webp';
  return 'jpg';
};

/**
 * 同步獲取最佳格式（使用快取）
 */
export const getBestFormatSync = (): ImageFormat => {
  const support = getFormatSupportSync();
  
  if (!support) return 'auto'; // 還沒偵測完成
  if (support.avif) return 'avif';
  if (support.webp) return 'webp';
  return 'jpg';
};

/**
 * 根據網路狀況和瀏覽器支援選擇最佳格式和品質
 */
export interface OptimalImageSettings {
  format: ImageFormat;
  quality: number;
}

export const getOptimalImageSettings = async (
  networkSpeed: 'fast' | 'slow' | 'offline' = 'fast'
): Promise<OptimalImageSettings> => {
  const bestFormat = await getBestFormat();
  
  // 根據網路速度調整品質
  let quality: number;
  switch (networkSpeed) {
    case 'slow':
      quality = 60; // 慢速網路使用較低品質
      break;
    case 'offline':
      quality = 40; // 離線時使用最低品質
      break;
    default:
      quality = bestFormat === 'avif' ? 80 : 85; // AVIF 可以用更低品質達到同等視覺效果
  }
  
  return { format: bestFormat, quality };
};

/**
 * 生成支援多格式的 picture 元素源
 */
export interface PictureSource {
  type: string;
  srcset: string;
  media?: string;
}

export const generatePictureSources = (
  baseSrc: string,
  widths: number[] = [640, 1280, 1920],
  quality: number = 85
): PictureSource[] => {
  const support = getFormatSupportSync();
  const sources: PictureSource[] = [];
  
  // 根據瀏覽器支援生成對應格式
  const formats: { format: ImageFormat; type: string }[] = [];
  
  if (support?.avif) {
    formats.push({ format: 'avif', type: 'image/avif' });
  }
  if (support?.webp) {
    formats.push({ format: 'webp', type: 'image/webp' });
  }
  
  // 為每種格式生成 srcset
  formats.forEach(({ format, type }) => {
    const srcset = widths
      .map((w) => `${addFormatParam(baseSrc, format, w, quality)} ${w}w`)
      .join(', ');
    
    sources.push({ type, srcset });
  });
  
  return sources;
};

/**
 * 在 URL 中添加格式轉換參數
 * 支援 Supabase Storage 和常見 CDN
 */
export const addFormatParam = (
  url: string,
  format: ImageFormat,
  width?: number,
  quality?: number
): string => {
  // 檢查是否是 Supabase Storage URL
  if (url.includes('supabase.co/storage')) {
    return addSupabaseTransformParams(url, format, width, quality);
  }
  
  // 檢查是否是 Cloudflare Images
  if (url.includes('imagedelivery.net') || url.includes('cloudflare')) {
    return addCloudflareParams(url, format, width, quality);
  }
  
  // 對於其他 URL，返回原始 URL
  return url;
};

/**
 * Supabase Storage 圖片轉換參數
 * 文檔: https://supabase.com/docs/guides/storage/serving/image-transformations
 */
const addSupabaseTransformParams = (
  url: string,
  format: ImageFormat,
  width?: number,
  quality?: number
): string => {
  try {
    const urlObj = new URL(url);
    
    // Supabase 使用 render/image 端點進行轉換
    if (!urlObj.pathname.includes('/render/image/')) {
      // 將 /object/public/ 替換為 /render/image/public/
      urlObj.pathname = urlObj.pathname.replace(
        '/storage/v1/object/public/',
        '/storage/v1/render/image/public/'
      );
    }
    
    // 添加轉換參數
    if (width) urlObj.searchParams.set('width', width.toString());
    if (quality) urlObj.searchParams.set('quality', quality.toString());
    if (format !== 'auto') urlObj.searchParams.set('format', format);
    
    return urlObj.toString();
  } catch {
    return url;
  }
};

/**
 * Cloudflare Images 參數
 */
const addCloudflareParams = (
  url: string,
  format: ImageFormat,
  width?: number,
  quality?: number
): string => {
  try {
    const params: string[] = [];
    
    if (format !== 'auto') params.push(`format=${format}`);
    if (width) params.push(`width=${width}`);
    if (quality) params.push(`quality=${quality}`);
    
    if (params.length === 0) return url;
    
    // Cloudflare 使用 /cdn-cgi/image/ 路徑
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${params.join('&')}`;
  } catch {
    return url;
  }
};

/**
 * 預載入下一代格式圖片
 */
export const preloadModernFormatImage = async (
  url: string,
  width?: number
): Promise<void> => {
  const bestFormat = await getBestFormat();
  const optimizedUrl = addFormatParam(url, bestFormat, width, 85);
  
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = optimizedUrl;
    
    // 設置正確的 type
    if (bestFormat === 'avif') {
      link.type = 'image/avif';
    } else if (bestFormat === 'webp') {
      link.type = 'image/webp';
    }
    
    link.onload = () => resolve();
    link.onerror = () => resolve();
    
    document.head.appendChild(link);
  });
};

/**
 * 獲取圖片格式優化統計
 */
export const getFormatOptimizationStats = (): {
  browserSupport: FormatSupport | null;
  recommendedFormat: ImageFormat;
  estimatedSavings: string;
} => {
  const support = getFormatSupportSync();
  const format = getBestFormatSync();
  
  let estimatedSavings = '0%';
  if (format === 'avif') {
    estimatedSavings = '50-70%'; // AVIF 相比 JPEG 可節省 50-70%
  } else if (format === 'webp') {
    estimatedSavings = '25-35%'; // WebP 相比 JPEG 可節省 25-35%
  }
  
  return {
    browserSupport: support,
    recommendedFormat: format,
    estimatedSavings,
  };
};
