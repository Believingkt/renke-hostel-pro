/**
 * 圖片壓縮和優化工具
 * 自動將圖片轉換為 WebP 格式並壓縮大小
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
}

export interface CompressionResult {
  blob: Blob;
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

/**
 * 將文件轉換為圖片元素
 */
const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('圖片載入失敗'));
    };
    
    img.src = objectUrl;
  });
};

/**
 * 計算縮放後的尺寸，保持寬高比
 */
const calculateDimensions = (
  originalWidth: number,
  originalHeight: number,
  maxWidth?: number,
  maxHeight?: number
): { width: number; height: number } => {
  let width = originalWidth;
  let height = originalHeight;

  // 如果設置了最大寬度且圖片寬度超過
  if (maxWidth && width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }

  // 如果設置了最大高度且圖片高度超過
  if (maxHeight && height > maxHeight) {
    width = Math.round((width * maxHeight) / height);
    height = maxHeight;
  }

  return { width, height };
};

/**
 * 壓縮和優化圖片
 * @param file 原始圖片文件
 * @param options 壓縮選項
 * @returns 壓縮後的結果
 */
export const compressImage = async (
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> => {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.85,
    format = 'webp'
  } = options;

  try {
    const originalSize = file.size;

    // 載入圖片
    const img = await loadImageFromFile(file);
    
    // 計算新尺寸
    const { width, height } = calculateDimensions(
      img.naturalWidth,
      img.naturalHeight,
      maxWidth,
      maxHeight
    );

    // 創建畫布
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('無法獲取畫布上下文');
    }

    // 設置圖片平滑處理
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 繪製圖片到畫布
    ctx.drawImage(img, 0, 0, width, height);

    // 轉換為 Blob
    const mimeType = `image/${format}`;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('圖片轉換失敗'));
          }
        },
        mimeType,
        quality
      );
    });

    // 轉換為 Data URL
    const dataUrl = canvas.toDataURL(mimeType, quality);

    const compressedSize = blob.size;
    const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

    return {
      blob,
      dataUrl,
      originalSize,
      compressedSize,
      compressionRatio
    };
  } catch (error) {
    console.error('圖片壓縮失敗:', error);
    throw error;
  }
};

/**
 * 批量壓縮多張圖片
 */
export const compressImages = async (
  files: File[],
  options: CompressionOptions = {}
): Promise<CompressionResult[]> => {
  const promises = files.map(file => compressImage(file, options));
  return Promise.all(promises);
};

/**
 * 格式化文件大小顯示
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * 驗證圖片文件
 */
export const validateImageFile = (file: File, maxSize: number = 10 * 1024 * 1024): { valid: boolean; error?: string } => {
  // 驗證文件類型
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: '不支援的文件格式！請上傳 JPG、PNG、WEBP 或 GIF 格式的圖片。'
    };
  }

  // 驗證文件大小
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `文件大小超過限制！請上傳小於 ${formatFileSize(maxSize)} 的圖片。\n當前文件大小：${formatFileSize(file.size)}`
    };
  }

  return { valid: true };
};
