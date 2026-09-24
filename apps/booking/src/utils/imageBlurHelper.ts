/**
 * 生成圖片的模糊預覽 data URL
 * 優化版：減小尺寸和品質以加快生成速度
 */
export const generateBlurDataURL = (imageUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('無法獲取 Canvas context'));
        return;
      }
      
      // 使用極小的尺寸來生成模糊預覽（從 20 降到 10）
      const scale = 10; 
      const width = scale;
      const height = Math.round((img.height / img.width) * scale);
      
      canvas.width = width;
      canvas.height = height;
      
      // 繪製縮小的圖片
      ctx.drawImage(img, 0, 0, width, height);
      
      // 轉換為 data URL（使用更低的質量從 0.3 降到 0.1）
      resolve(canvas.toDataURL('image/jpeg', 0.1));
    };
    
    img.onerror = () => {
      // 如果載入失敗，返回空字符串
      resolve('');
    };
    
    img.src = imageUrl;
  });
};

/**
 * 為多張圖片預生成模糊預覽
 */
export const generateBlurDataURLs = async (imageUrls: string[]): Promise<Map<string, string>> => {
  const blurMap = new Map<string, string>();
  
  await Promise.all(
    imageUrls.map(async (url) => {
      try {
        const blurDataURL = await generateBlurDataURL(url);
        blurMap.set(url, blurDataURL);
      } catch (error) {
        console.warn(`無法生成模糊預覽：${url}`, error);
        blurMap.set(url, '');
      }
    })
  );
  
  return blurMap;
};
