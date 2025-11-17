/**
 * 響應式圖片工具
 * 根據不同螢幕尺寸生成適合的圖片 URL 參數
 */

export interface ImageSize {
  width: number;
  height: number;
}

export interface ResponsiveImageSizes {
  mobile: ImageSize;
  tablet: ImageSize;
  desktop: ImageSize;
  xlarge: ImageSize;
}

/**
 * 生成 srcset 字符串
 * 為 Supabase Storage 的圖片添加轉換參數
 */
export const generateSrcSet = (imageUrl: string, sizes: ResponsiveImageSizes): string => {
  // 檢查是否為 Supabase Storage URL
  const isSupabaseStorage = imageUrl.includes('supabase.co/storage');
  
  if (!isSupabaseStorage) {
    // 非 Supabase 圖片，返回原始 URL
    return imageUrl;
  }

  const srcsetItems: string[] = [];
  
  // 生成不同尺寸的 URL
  Object.entries(sizes).forEach(([key, size]) => {
    const transformedUrl = addImageTransform(imageUrl, size.width, size.height);
    let descriptor = '';
    
    switch (key) {
      case 'mobile':
        descriptor = '640w';
        break;
      case 'tablet':
        descriptor = '1024w';
        break;
      case 'desktop':
        descriptor = '1920w';
        break;
      case 'xlarge':
        descriptor = '2560w';
        break;
    }
    
    srcsetItems.push(`${transformedUrl} ${descriptor}`);
  });
  
  return srcsetItems.join(', ');
};

/**
 * 為 Supabase Storage URL 添加圖片轉換參數
 */
export const addImageTransform = (
  imageUrl: string,
  width?: number,
  height?: number,
  quality: number = 85
): string => {
  if (!imageUrl.includes('supabase.co/storage')) {
    return imageUrl;
  }

  const url = new URL(imageUrl);
  const params = new URLSearchParams();
  
  if (width) params.set('width', width.toString());
  if (height) params.set('height', height.toString());
  params.set('quality', quality.toString());
  params.set('format', 'webp'); // 自動轉換為 WebP
  
  // 將轉換參數添加到路徑中
  const transformPath = `/render/image/authenticated/${params.toString()}`;
  
  // 注意：實際的 Supabase Storage 轉換 API 可能不同
  // 這裡提供的是概念性的實現
  return imageUrl;
};

/**
 * 預設響應式圖片尺寸配置
 */
export const defaultImageSizes = {
  hero: {
    mobile: { width: 640, height: 480 },
    tablet: { width: 1024, height: 768 },
    desktop: { width: 1920, height: 1080 },
    xlarge: { width: 2560, height: 1440 },
  },
  gallery: {
    mobile: { width: 400, height: 400 },
    tablet: { width: 600, height: 600 },
    desktop: { width: 800, height: 800 },
    xlarge: { width: 1200, height: 1200 },
  },
  thumbnail: {
    mobile: { width: 200, height: 200 },
    tablet: { width: 300, height: 300 },
    desktop: { width: 400, height: 400 },
    xlarge: { width: 600, height: 600 },
  },
} as const;

/**
 * 生成 sizes 屬性字符串
 */
export const generateSizesAttribute = (type: 'hero' | 'gallery' | 'thumbnail'): string => {
  switch (type) {
    case 'hero':
      return '(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 100vw';
    case 'gallery':
      return '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw';
    case 'thumbnail':
      return '(max-width: 640px) 25vw, (max-width: 1024px) 20vw, 10vw';
    default:
      return '100vw';
  }
};

/**
 * 根據設備像素比和視窗寬度計算最佳圖片尺寸
 */
export const calculateOptimalImageSize = (
  containerWidth: number,
  devicePixelRatio: number = window.devicePixelRatio || 1
): number => {
  // 考慮設備像素比，但限制最大為 2x 避免過大
  const effectiveDPR = Math.min(devicePixelRatio, 2);
  return Math.ceil(containerWidth * effectiveDPR);
};

/**
 * 檢測瀏覽器是否支援 WebP
 */
export const supportsWebP = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const webP = new Image();
    webP.onload = webP.onerror = () => {
      resolve(webP.height === 2);
    };
    webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
  });
};
