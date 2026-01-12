/**
 * 主題常數定義
 * 集中管理所有住宿的主題映射和主題類名轉換邏輯
 */

// 住宿主題映射（用於 URL 參數和 ID）
// 同時支援住宿 ID 和短網址別名
export const ACCOMMODATION_THEME_MAPPINGS: Record<string, string> = {
  // 天頌幸福和苑 - warm 主題（焦糖色與奶油白）
  '4ee31aca-5641-4d05-80e2-1c67626be83d': 'warm',
  'tiansong-villa': 'warm',
  
  // 森山寫照 - default 主題（使用預設綠色）
  '5f764d55-ae11-4631-80fe-2e611853deae': 'default',
  'sensaninn': 'default',
};

// 所有可用的主題預設值
export const THEME_PRESETS = [
  'default',
  'warm',
  'ocean',
  'elegant',
  'rose',
  'earth',
  'zen',
  'sunset',
] as const;

export type ThemePreset = typeof THEME_PRESETS[number];

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
 * 根據住宿 ID 或短網址別名取得主題預設值
 * @param accommodationIdOrAlias - 住宿 ID 或短網址別名
 * @returns 主題預設值
 */
export const getThemePresetByAccommodation = (accommodationIdOrAlias?: string | null): string => {
  if (!accommodationIdOrAlias) return 'default';
  return ACCOMMODATION_THEME_MAPPINGS[accommodationIdOrAlias] || 'default';
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
 * 從 URL 參數或 localStorage 讀取住宿識別符
 * @returns CSS 類名
 */
export const getThemeClassFromContext = (): string => {
  // 1. 優先從 URL 參數判斷
  const urlParams = new URLSearchParams(window.location.search);
  const accParam = urlParams.get('acc');
  
  // 2. 如果沒有 URL 參數，嘗試從 localStorage 讀取
  const savedAcc = typeof window !== 'undefined' 
    ? localStorage.getItem('dev_selected_accommodation') 
    : null;
  
  const accToUse = accParam || savedAcc;
  
  return getThemeClassByAccommodation(accToUse);
};
