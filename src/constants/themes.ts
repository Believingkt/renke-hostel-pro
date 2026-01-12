/**
 * 主題常數定義
 * 集中管理所有住宿的主題映射和主題類名轉換邏輯
 */

// localStorage 快取鍵名
const THEME_CACHE_KEY = 'accommodation_theme_cache';

// 主題顏色配置介面
export interface ThemeColors {
  primary: string;
  accent: string;
  background: string;
  card: string;
  footer: string;
}

// 主題預設選項介面
export interface ThemePresetConfig {
  value: string;
  label: string;
  description: string;
  colors: ThemeColors;
}

// 主題快取介面
interface ThemeCacheEntry {
  themePreset: string;
  updatedAt: number;
}

type ThemeCache = Record<string, ThemeCacheEntry>;

/**
 * 從 localStorage 讀取主題快取
 */
const getThemeCache = (): ThemeCache => {
  if (typeof window === 'undefined') return {};
  try {
    const cached = localStorage.getItem(THEME_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

/**
 * 將住宿主題儲存到快取
 * @param accommodationId - 住宿 ID
 * @param shortUrlAlias - 短網址別名（可選）
 * @param themePreset - 主題預設值
 */
export const cacheAccommodationTheme = (
  accommodationId: string, 
  shortUrlAlias: string | null | undefined, 
  themePreset: string
): void => {
  if (typeof window === 'undefined') return;
  try {
    const cache = getThemeCache();
    const entry: ThemeCacheEntry = { themePreset, updatedAt: Date.now() };
    
    // 同時快取 ID 和別名
    cache[accommodationId] = entry;
    if (shortUrlAlias) {
      cache[shortUrlAlias] = entry;
    }
    
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 忽略儲存錯誤
  }
};

/**
 * 從快取取得住宿主題
 * @param accommodationIdOrAlias - 住宿 ID 或短網址別名
 * @returns 主題預設值或 null
 */
export const getCachedThemePreset = (accommodationIdOrAlias: string): string | null => {
  const cache = getThemeCache();
  const entry = cache[accommodationIdOrAlias];
  
  if (!entry) return null;
  
  // 快取有效期 7 天
  const isExpired = Date.now() - entry.updatedAt > 7 * 24 * 60 * 60 * 1000;
  if (isExpired) return null;
  
  return entry.themePreset;
};

// 主題預設選項（包含顏色資訊用於預覽）
export const THEME_PRESET_CONFIGS: ThemePresetConfig[] = [
  { 
    value: "default", 
    label: "森林綠（預設）", 
    description: "清新自然的綠色調",
    colors: {
      primary: "hsl(142, 76%, 36%)",
      accent: "hsl(160, 84%, 39%)",
      background: "hsl(0, 0%, 100%)",
      card: "hsl(142, 40%, 96%)",
      footer: "hsl(160, 45%, 12%)",
    }
  },
  { 
    value: "warm", 
    label: "南瓜橘", 
    description: "溫暖的焦糖橘色調",
    colors: {
      primary: "hsl(20, 75%, 52%)",
      accent: "hsl(16, 70%, 46%)",
      background: "hsl(36, 32%, 96%)",
      card: "hsl(35, 30%, 91%)",
      footer: "hsl(20, 45%, 18%)",
    }
  },
  { 
    value: "ocean", 
    label: "海洋藍", 
    description: "沉靜的藍色調",
    colors: {
      primary: "hsl(200, 80%, 45%)",
      accent: "hsl(185, 70%, 40%)",
      background: "hsl(200, 30%, 97%)",
      card: "hsl(200, 40%, 92%)",
      footer: "hsl(200, 45%, 15%)",
    }
  },
  { 
    value: "elegant", 
    label: "優雅紫", 
    description: "高雅的紫灰色調",
    colors: {
      primary: "hsl(270, 50%, 50%)",
      accent: "hsl(280, 45%, 45%)",
      background: "hsl(260, 20%, 97%)",
      card: "hsl(260, 25%, 92%)",
      footer: "hsl(270, 30%, 15%)",
    }
  },
  { 
    value: "rose", 
    label: "玫瑰粉", 
    description: "浪漫柔美的粉色調",
    colors: {
      primary: "hsl(350, 65%, 55%)",
      accent: "hsl(340, 60%, 50%)",
      background: "hsl(350, 30%, 98%)",
      card: "hsl(350, 35%, 94%)",
      footer: "hsl(350, 35%, 18%)",
    }
  },
  { 
    value: "earth", 
    label: "大地棕", 
    description: "質樸沉穩的棕色調",
    colors: {
      primary: "hsl(30, 50%, 42%)",
      accent: "hsl(25, 45%, 38%)",
      background: "hsl(35, 25%, 96%)",
      card: "hsl(32, 22%, 92%)",
      footer: "hsl(28, 40%, 15%)",
    }
  },
  { 
    value: "zen", 
    label: "日式和風", 
    description: "禪意自然的米灰色調",
    colors: {
      primary: "hsl(45, 35%, 45%)",
      accent: "hsl(40, 30%, 40%)",
      background: "hsl(42, 25%, 97%)",
      card: "hsl(40, 20%, 93%)",
      footer: "hsl(38, 25%, 16%)",
    }
  },
  { 
    value: "sunset", 
    label: "夕陽紅", 
    description: "溫暖浪漫的紅橘漸變",
    colors: {
      primary: "hsl(10, 75%, 50%)",
      accent: "hsl(25, 85%, 55%)",
      background: "hsl(20, 30%, 97%)",
      card: "hsl(15, 28%, 93%)",
      footer: "hsl(8, 45%, 16%)",
    }
  },
];

// 所有可用的主題預設值（簡單陣列，用於類型定義）
export const THEME_PRESETS = THEME_PRESET_CONFIGS.map(t => t.value);

export type ThemePreset = typeof THEME_PRESET_CONFIGS[number]['value'];

// 主題顏色快速查詢映射（用於表格等簡化顯示場景）
export const THEME_COLORS: Record<string, { primary: string; label: string }> = 
  THEME_PRESET_CONFIGS.reduce((acc, theme) => {
    acc[theme.value] = { primary: theme.colors.primary, label: theme.label };
    return acc;
  }, {} as Record<string, { primary: string; label: string }>);

/**
 * 根據主題值取得主題配置
 * @param themeValue - 主題值
 * @returns 主題配置或預設主題
 */
export const getThemeConfig = (themeValue?: string): ThemePresetConfig => {
  return THEME_PRESET_CONFIGS.find(t => t.value === themeValue) || THEME_PRESET_CONFIGS[0];
};

/**
 * 根據主題預設值返回對應的 CSS 類名
 * @param themePreset - 主題預設值
 * @returns CSS 類名
 */
export const getThemeClass = (themePreset?: string): string => {
  switch (themePreset) {
    case 'warm':
      return 'theme-warm';
    case 'ocean':
      return 'theme-ocean';
    case 'elegant':
      return 'theme-elegant';
    case 'rose':
      return 'theme-rose';
    case 'earth':
      return 'theme-earth';
    case 'zen':
      return 'theme-zen';
    case 'sunset':
      return 'theme-sunset';
    default:
      return '';
  }
};

/**
 * 根據住宿 ID 或短網址別名取得主題預設值（從快取讀取）
 * @param accommodationIdOrAlias - 住宿 ID 或短網址別名
 * @returns 主題預設值
 */
export const getThemePresetByAccommodation = (accommodationIdOrAlias?: string | null): string => {
  if (!accommodationIdOrAlias) return 'default';
  
  // 從快取讀取主題
  const cachedTheme = getCachedThemePreset(accommodationIdOrAlias);
  return cachedTheme || 'default';
};

/**
 * 根據住宿 ID 或短網址別名取得主題 CSS 類名
 * @param accommodationIdOrAlias - 住宿 ID 或短網址別名
 * @returns CSS 類名
 */
export const getThemeClassByAccommodation = (accommodationIdOrAlias?: string | null): string => {
  const themePreset = getThemePresetByAccommodation(accommodationIdOrAlias);
  return getThemeClass(themePreset);
};

/**
 * 同步判斷主題類名（用於骨架屏等需要在 API 回應前顯示的元件）
 * 從 URL 參數或 localStorage 讀取住宿識別符，再從快取讀取主題
 * @returns CSS 類名
 */
export const getThemeClassFromContext = (): string => {
  // 1. 優先從 URL 參數判斷
  const urlParams = new URLSearchParams(window.location.search);
  const accParam = urlParams.get('acc');
  
  // 2. 如果沒有 URL 參數，嘗試從 localStorage 讀取選擇的住宿
  const savedAcc = typeof window !== 'undefined' 
    ? localStorage.getItem('dev_selected_accommodation') 
    : null;
  
  const accToUse = accParam || savedAcc;
  
  if (!accToUse) return '';
  
  // 從快取讀取主題
  const cachedTheme = getCachedThemePreset(accToUse);
  return cachedTheme ? getThemeClass(cachedTheme) : '';
};
