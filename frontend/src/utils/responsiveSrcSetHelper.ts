import { getCDNUrl } from "./cdnHelper";

/**
 * 響應式圖片源集生成工具
 * 根據不同螢幕密度生成適當的圖片尺寸
 */

export interface SrcSetOptions {
  baseWidth: number;
  baseHeight?: number;
  densities?: number[];
  quality?: number;
  format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png';
}

/**
 * 生成響應式 srcset 字串
 * 支援不同的螢幕密度（1x, 2x, 3x）
 */
export const generateSrcSet = (
  src: string,
  options: SrcSetOptions
): string => {
  const {
    baseWidth,
    baseHeight,
    densities = [1, 2, 3], // 預設支援 1x, 2x, 3x 螢幕密度
    quality = 85,
    format = 'auto',
  } = options;

  const srcSetParts: string[] = [];

  densities.forEach((density) => {
    const scaledWidth = Math.round(baseWidth * density);
    const scaledHeight = baseHeight ? Math.round(baseHeight * density) : undefined;
    
    const cdnUrl = getCDNUrl(
      src,
      scaledWidth,
      scaledHeight,
      quality,
      format
    );
    
    srcSetParts.push(`${cdnUrl} ${density}x`);
  });

  return srcSetParts.join(', ');
};

/**
 * 生成基於視窗寬度的響應式 srcset
 * 適用於不同視窗大小的圖片
 */
export const generateResponsiveSrcSet = (
  src: string,
  widths: number[],
  quality: number = 85,
  format: 'auto' | 'webp' | 'avif' | 'jpg' | 'png' = 'auto'
): string => {
  const srcSetParts: string[] = [];

  widths.forEach((width) => {
    const cdnUrl = getCDNUrl(src, width, undefined, quality, format);
    srcSetParts.push(`${cdnUrl} ${width}w`);
  });

  return srcSetParts.join(', ');
};

/**
 * 根據容器寬度自動計算建議的圖片寬度
 */
export const calculateResponsiveWidths = (
  containerWidth: number
): number[] => {
  const widths: number[] = [];
  const densities = [1, 1.5, 2, 2.5, 3];
  
  densities.forEach((density) => {
    const width = Math.round(containerWidth * density);
    // 四捨五入到最接近的 100
    const roundedWidth = Math.round(width / 100) * 100;
    if (!widths.includes(roundedWidth) && roundedWidth > 0) {
      widths.push(roundedWidth);
    }
  });
  
  // 確保寬度不超過合理上限
  return widths.filter(w => w <= 3840).sort((a, b) => a - b);
};

/**
 * 生成標準的響應式圖片尺寸集合
 * 適用於常見的響應式佈局
 */
export const STANDARD_RESPONSIVE_WIDTHS = {
  thumbnail: [150, 300, 450], // 小圖縮圖
  small: [320, 640, 960], // 小尺寸圖片
  medium: [640, 1280, 1920], // 中等尺寸圖片
  large: [1024, 2048, 3072], // 大尺寸圖片
  hero: [1280, 1920, 2560, 3840], // 英雄圖片/全寬圖片
};

/**
 * 根據圖片用途生成 sizes 屬性
 */
export const generateSizesAttribute = (
  breakpoints: { maxWidth: string; size: string }[]
): string => {
  const sizesParts = breakpoints.map(
    ({ maxWidth, size }) => `(max-width: ${maxWidth}) ${size}`
  );
  
  // 添加默認大小（最後一個斷點）
  const defaultSize = breakpoints[breakpoints.length - 1]?.size || '100vw';
  
  return [...sizesParts, defaultSize].join(', ');
};

/**
 * 預設的 sizes 配置
 */
export const STANDARD_SIZES = {
  // 全寬圖片
  fullWidth: '100vw',
  
  // 容器限制圖片（最大 1280px）
  container: generateSizesAttribute([
    { maxWidth: '1280px', size: '100vw' },
  ]),
  
  // 雙欄佈局
  twoColumn: generateSizesAttribute([
    { maxWidth: '640px', size: '100vw' },
    { maxWidth: '1024px', size: '50vw' },
  ]),
  
  // 三欄佈局
  threeColumn: generateSizesAttribute([
    { maxWidth: '640px', size: '100vw' },
    { maxWidth: '1024px', size: '50vw' },
  ]),
  
  // 四欄佈局
  fourColumn: generateSizesAttribute([
    { maxWidth: '640px', size: '50vw' },
    { maxWidth: '1024px', size: '33vw' },
  ]),
};
