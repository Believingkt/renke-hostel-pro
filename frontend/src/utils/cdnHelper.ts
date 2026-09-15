/**
 * CDN 圖片加速工具
 * 支援多種 CDN 提供商和智能格式轉換
 */

import { getBestFormatSync, initFormatDetection, type ImageFormat } from './imageFormatHelper';

// 初始化格式偵測
if (typeof window !== 'undefined') {
  initFormatDetection();
}

export type CDNProvider = 'cloudflare' | 'imgix' | 'cloudimage' | 'bunny' | 'supabase' | 'none';

export interface CDNConfig {
  provider: CDNProvider;
  baseUrl?: string;
  accountHash?: string;
  enabled: boolean;
}

// 從環境變數或配置中讀取 CDN 設定
const getCDNConfig = (): CDNConfig => {
  // 自動偵測 Supabase Storage
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    return {
      provider: 'supabase',
      baseUrl: supabaseUrl,
      enabled: true,
    };
  }
  
  // 這裡可以從 localStorage 或後端 API 讀取配置
  const storedConfig = localStorage.getItem('cdn_config');
  
  if (storedConfig) {
    try {
      return JSON.parse(storedConfig);
    } catch {
      return { provider: 'none', enabled: false };
    }
  }
  
  return {
    provider: 'none',
    enabled: false,
  };
};

/**
 * 轉換圖片 URL 為 CDN URL，自動選擇最佳格式
 */
export const getCDNUrl = (
  imageUrl: string,
  width?: number,
  height?: number,
  quality: number = 85,
  format: 'auto' | 'webp' | 'avif' | 'jpg' | 'png' = 'auto'
): string => {
  const config = getCDNConfig();
  
  // 自動選擇最佳格式
  const effectiveFormat: ImageFormat = format === 'auto' ? getBestFormatSync() : format;
  
  if (!config.enabled || config.provider === 'none') {
    // 即使沒有 CDN，也嘗試使用 Supabase 原生轉換
    if (imageUrl.includes('supabase.co/storage')) {
      return getSupabaseTransformUrl(imageUrl, width, height, quality, effectiveFormat);
    }
    return imageUrl;
  }
  
  switch (config.provider) {
    case 'supabase':
      return getSupabaseTransformUrl(imageUrl, width, height, quality, effectiveFormat);
    case 'cloudflare':
      return getCloudflareImageUrl(imageUrl, config, width, height, quality, effectiveFormat);
    case 'imgix':
      return getImgixUrl(imageUrl, config, width, height, quality, effectiveFormat);
    case 'cloudimage':
      return getCloudImageUrl(imageUrl, config, width, height, quality, effectiveFormat);
    case 'bunny':
      return getBunnyUrl(imageUrl, config, width, height, quality, effectiveFormat);
    default:
      return imageUrl;
  }
};

/**
 * Supabase Storage 原生圖片轉換
 * 文檔: https://supabase.com/docs/guides/storage/serving/image-transformations
 */
const getSupabaseTransformUrl = (
  imageUrl: string,
  width?: number,
  height?: number,
  quality: number = 85,
  format: ImageFormat = 'auto'
): string => {
  // 只處理 Supabase Storage URL
  if (!imageUrl.includes('supabase.co/storage')) {
    return imageUrl;
  }
  
  try {
    const urlObj = new URL(imageUrl);
    
    // 將 /object/public/ 替換為 /render/image/public/ 以啟用轉換
    if (urlObj.pathname.includes('/storage/v1/object/')) {
      urlObj.pathname = urlObj.pathname.replace(
        '/storage/v1/object/',
        '/storage/v1/render/image/'
      );
    }
    
    // 添加轉換參數
    if (width) urlObj.searchParams.set('width', width.toString());
    if (height) urlObj.searchParams.set('height', height.toString());
    urlObj.searchParams.set('quality', quality.toString());
    
    // 設定格式（Supabase 支援 origin, webp）
    if (format === 'webp') {
      urlObj.searchParams.set('format', 'webp');
    }
    // 注意：Supabase 目前不支援 AVIF，回退到 WebP
    if (format === 'avif') {
      urlObj.searchParams.set('format', 'webp');
    }
    
    return urlObj.toString();
  } catch {
    return imageUrl;
  }
};

/**
 * Cloudflare Images URL 轉換
 * 文檔: https://developers.cloudflare.com/images/
 */
const getCloudflareImageUrl = (
  imageUrl: string,
  config: CDNConfig,
  width?: number,
  height?: number,
  quality: number = 85,
  format: 'auto' | 'webp' | 'avif' | 'jpg' | 'png' = 'auto'
): string => {
  if (!config.accountHash) {
    console.warn('Cloudflare account hash not configured');
    return imageUrl;
  }
  
  // 編碼原始 URL
  const encodedUrl = encodeURIComponent(imageUrl);
  
  // 構建轉換參數
  const params: string[] = [];
  
  if (width) params.push(`w=${width}`);
  if (height) params.push(`h=${height}`);
  params.push(`q=${quality}`);
  
  if (format !== 'auto') {
    params.push(`f=${format}`);
  } else {
    params.push('f=auto'); // 自動選擇最佳格式
  }
  
  // Cloudflare Images 變體（可以預先在 Cloudflare 控制台設定）
  const variant = params.join(',') || 'public';
  
  // 使用 Cloudflare Images 的 /cdn-cgi/image/ 端點
  return `https://${config.accountHash}/cdn-cgi/image/${variant}/${encodedUrl}`;
};

/**
 * imgix URL 轉換
 * 文檔: https://docs.imgix.com/
 */
const getImgixUrl = (
  imageUrl: string,
  config: CDNConfig,
  width?: number,
  height?: number,
  quality: number = 85,
  format: 'auto' | 'webp' | 'avif' | 'jpg' | 'png' = 'auto'
): string => {
  if (!config.baseUrl) {
    console.warn('imgix base URL not configured');
    return imageUrl;
  }
  
  const url = new URL(imageUrl);
  const path = url.pathname;
  const params = new URLSearchParams();
  
  if (width) params.set('w', width.toString());
  if (height) params.set('h', height.toString());
  params.set('q', quality.toString());
  
  if (format !== 'auto') {
    params.set('fm', format);
  } else {
    params.set('auto', 'format'); // 自動選擇格式
  }
  
  params.set('fit', 'max'); // 保持寬高比
  
  return `${config.baseUrl}${path}?${params.toString()}`;
};

/**
 * CloudImage URL 轉換
 * 文檔: https://docs.cloudimage.io/
 */
const getCloudImageUrl = (
  imageUrl: string,
  config: CDNConfig,
  width?: number,
  height?: number,
  quality: number = 85,
  format: 'auto' | 'webp' | 'avif' | 'jpg' | 'png' = 'auto'
): string => {
  if (!config.accountHash) {
    console.warn('CloudImage token not configured');
    return imageUrl;
  }
  
  const encodedUrl = encodeURIComponent(imageUrl);
  const operations: string[] = [];
  
  if (width) operations.push(`width=${width}`);
  if (height) operations.push(`height=${height}`);
  operations.push(`q=${quality}`);
  
  if (format !== 'auto') {
    operations.push(`f=${format}`);
  }
  
  const operationsStr = operations.join('&');
  
  return `https://${config.accountHash}.cloudimg.io/v7/${encodedUrl}?${operationsStr}`;
};

/**
 * Bunny CDN URL 轉換
 * 文檔: https://bunny.net/
 */
const getBunnyUrl = (
  imageUrl: string,
  config: CDNConfig,
  width?: number,
  height?: number,
  quality: number = 85,
  format: 'auto' | 'webp' | 'avif' | 'jpg' | 'png' = 'auto'
): string => {
  if (!config.baseUrl) {
    console.warn('Bunny CDN base URL not configured');
    return imageUrl;
  }
  
  const url = new URL(imageUrl);
  const path = url.pathname;
  const params = new URLSearchParams();
  
  if (width) params.set('width', width.toString());
  if (height) params.set('height', height.toString());
  params.set('quality', quality.toString());
  
  if (format !== 'auto') {
    params.set('format', format);
  }
  
  return `${config.baseUrl}${path}?${params.toString()}`;
};

/**
 * 儲存 CDN 配置
 */
export const saveCDNConfig = (config: CDNConfig): void => {
  localStorage.setItem('cdn_config', JSON.stringify(config));
  
  // 觸發事件通知其他組件配置已更新
  window.dispatchEvent(new CustomEvent('cdn-config-updated', { detail: config }));
};

/**
 * 預熱 CDN 快取（可選）
 * 對於關鍵圖片，可以提前請求以填充 CDN 快取
 */
export const warmupCDNCache = async (imageUrls: string[]): Promise<void> => {
  const config = getCDNConfig();
  
  if (!config.enabled || config.provider === 'none') {
    return;
  }
  
  const warmupPromises = imageUrls.map(async (url) => {
    try {
      // 使用 HEAD 請求預熱快取，不下載完整圖片
      const cdnUrl = getCDNUrl(url, 1920, 1080, 85, 'webp');
      await fetch(cdnUrl, { method: 'HEAD' });
    } catch (error) {
      console.warn(`Failed to warmup CDN cache for ${url}:`, error);
    }
  });
  
  await Promise.allSettled(warmupPromises);
};

/**
 * 檢測最佳 CDN 節點（延遲測試）
 */
export const detectBestCDNNode = async (): Promise<string | null> => {
  // 這裡可以實現 CDN 節點的延遲測試
  // 返回延遲最低的節點 URL
  return null;
};
