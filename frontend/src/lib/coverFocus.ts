/**
 * 團購活動封面顯示範圍（Hero crop）共用邏輯。
 * 後台 Crop Editor 與前台 Hero 必須使用同一套比例與樣式計算，確保 1:1 對應。
 */

export const HERO_ASPECT_DESKTOP = 16 / 6;
export const HERO_ASPECT_MOBILE = 16 / 10;

export type CoverDevice = "desktop" | "mobile";

export interface CoverFocus {
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_COVER_FOCUS: CoverFocus = { x: 50, y: 50, zoom: 1 };

export const clampPercent = (v: number) => Math.min(100, Math.max(0, Math.round(v)));
export const clampZoom = (v: number) => Math.min(3, Math.max(1, Math.round(v * 100) / 100));

interface CampaignCoverFields {
  cover_focus_x?: number | null;
  cover_focus_y?: number | null;
  cover_zoom?: number | null;
  cover_focus_x_mobile?: number | null;
  cover_focus_y_mobile?: number | null;
  cover_zoom_mobile?: number | null;
}

/**
 * 舊資料相容：
 * - 桌機沿用既有 cover_focus_x / cover_focus_y（NULL → 50/50、zoom → 1）
 * - 手機無獨立設定時 fallback 使用桌機設定
 */
export function resolveCoverFocus(c: CampaignCoverFields | null | undefined, device: CoverDevice): CoverFocus {
  const desktop: CoverFocus = {
    x: clampPercent(Number(c?.cover_focus_x ?? 50)),
    y: clampPercent(Number(c?.cover_focus_y ?? 50)),
    zoom: clampZoom(Number(c?.cover_zoom ?? 1)),
  };
  if (device === "desktop") return desktop;
  return {
    x: c?.cover_focus_x_mobile == null ? desktop.x : clampPercent(Number(c.cover_focus_x_mobile)),
    y: c?.cover_focus_y_mobile == null ? desktop.y : clampPercent(Number(c.cover_focus_y_mobile)),
    zoom: c?.cover_zoom_mobile == null ? desktop.zoom : clampZoom(Number(c.cover_zoom_mobile)),
  };
}

/**
 * 封面圖樣式：object-cover + object-position + 以同一錨點縮放。
 * zoom >= 1 且 x/y 皆為 0~100，因此框內永遠被圖片填滿，不會出現白邊。
 */
export function coverImageStyle(focus: CoverFocus): React.CSSProperties {
  return {
    objectPosition: `${focus.x}% ${focus.y}%`,
    transform: focus.zoom === 1 ? undefined : `scale(${focus.zoom})`,
    transformOrigin: `${focus.x}% ${focus.y}%`,
  };
}
