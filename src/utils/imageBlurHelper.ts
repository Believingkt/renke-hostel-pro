/**
 * 生成圖片的模糊預覽 data URL
 * 用於漸進式載入效果
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
      
      // 使用非常小的尺寸來生成模糊預覽
      const scale = 20; // 減小尺寸以提高性能
      const width = scale;
      const height = Math.round((img.height / img.width) * scale);
      
      canvas.width = width;
      canvas.height = height;
      
      // 繪製縮小的圖片
      ctx.drawImage(img, 0, 0, width, height);
      
      // 轉換為 data URL（使用較低的質量以減小檔案大小）
      resolve(canvas.toDataURL('image/jpeg', 0.3));
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
