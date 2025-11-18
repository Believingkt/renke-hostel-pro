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
 * 優化版：支援優先級和快取檢查
 */
export const smartPreload = (
  currentIndex: number,
  totalImages: number,
  imageUrls: string[],
  preloadCount: number = 2
): void => {
  const imagesToPreload: { url: string; priority: 'high' | 'low' }[] = [];
  
  // 優先預載入下一張（高優先級）
  const nextIndex = (currentIndex + 1) % totalImages;
  if (imageUrls[nextIndex]) {
    imagesToPreload.push({ url: imageUrls[nextIndex], priority: 'high' });
  }
  
  // 預載入再下一張（低優先級）
  if (preloadCount > 1) {
    for (let i = 2; i <= preloadCount; i++) {
      const index = (currentIndex + i) % totalImages;
      if (imageUrls[index]) {
        imagesToPreload.push({ url: imageUrls[index], priority: 'low' });
      }
    }
  }
  
  // 預載入上一張圖片（低優先級，用於向後導航）
  const prevIndex = (currentIndex - 1 + totalImages) % totalImages;
  if (imageUrls[prevIndex]) {
    imagesToPreload.push({ url: imageUrls[prevIndex], priority: 'low' });
  }
  
  // 按優先級分組預載入
  const highPriority = imagesToPreload.filter(img => img.priority === 'high');
  const lowPriority = imagesToPreload.filter(img => img.priority === 'low');
  
  // 立即預載入高優先級圖片
  if (highPriority.length > 0) {
    preloadImages(highPriority.map(img => img.url), { priority: 'high' });
  }
  
  // 延遲預載入低優先級圖片
  if (lowPriority.length > 0) {
    setTimeout(() => {
      preloadImages(lowPriority.map(img => img.url), { priority: 'low' });
    }, 500);
  }
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
