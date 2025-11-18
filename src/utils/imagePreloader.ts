/**
 * 圖片預載入工具
 * 提前載入圖片以改善使用者體驗
 */

interface PreloadOptions {
  priority?: 'high' | 'low';
  crossOrigin?: 'anonymous' | 'use-credentials';
}

/**
 * 預載入單張圖片
 */
export const preloadImage = (src: string, options: PreloadOptions = {}): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    if (options.crossOrigin) {
      img.crossOrigin = options.crossOrigin;
    }
    
    // 設置載入優先級
    if (options.priority === 'high') {
      img.fetchPriority = 'high';
    }
    
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to preload image: ${src}`));
    
    img.src = src;
  });
};

/**
 * 預載入多張圖片
 */
export const preloadImages = async (
  urls: string[], 
  options: PreloadOptions = {}
): Promise<void> => {
  const promises = urls.map(url => preloadImage(url, options).catch(error => {
    console.warn('圖片預載入失敗:', url, error);
  }));
  
  await Promise.all(promises);
};

/**
 * 使用 link 標籤預載入圖片（更高優先級）
 */
export const preloadImageWithLink = (src: string): void => {
  // 檢查是否已經存在 preload link
  const existingLink = document.querySelector(`link[rel="preload"][href="${src}"]`);
  if (existingLink) return;
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  link.fetchPriority = 'high';
  
  document.head.appendChild(link);
};

/**
 * 智能預載入：根據視窗位置預載入附近的圖片
 */
export const smartPreload = (
  currentIndex: number,
  totalImages: number,
  imageUrls: string[],
  preloadCount: number = 2
): void => {
  const imagesToPreload: string[] = [];
  
  // 預載入下 N 張圖片
  for (let i = 1; i <= preloadCount; i++) {
    const nextIndex = (currentIndex + i) % totalImages;
    if (imageUrls[nextIndex]) {
      imagesToPreload.push(imageUrls[nextIndex]);
    }
  }
  
  // 預載入上一張圖片（用於向後導航）
  const prevIndex = (currentIndex - 1 + totalImages) % totalImages;
  if (imageUrls[prevIndex]) {
    imagesToPreload.push(imageUrls[prevIndex]);
  }
  
  // 非同步預載入
  preloadImages(imagesToPreload, { priority: 'low' });
};

/**
 * 取消預載入（清理不需要的 preload links）
 */
export const cancelPreload = (src: string): void => {
  const link = document.querySelector(`link[rel="preload"][href="${src}"]`);
  if (link) {
    link.remove();
  }
};
