import { useLayoutEffect, RefObject } from "react";

/**
 * 訂房頁黏頂列高度變數（動態量測，避免硬寫 px 造成重疊）
 * --vb-header-h : 主 header 高度
 * --vb-search-h : 桌機搜尋列高度（手機為 0）
 * --vb-tabs-h   : 區塊分頁列高度
 */
export type StickyVar = "--vb-header-h" | "--vb-search-h" | "--vb-tabs-h";

/** 量測元素高度並寫入 :root CSS 變數；元素不存在／隱藏時寫 0px */
export function useStickyHeightVar(
  ref: RefObject<HTMLElement>,
  varName: StickyVar,
  enabled = true,
) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      root.style.setProperty(varName, "0px");
      return () => root.style.removeProperty(varName);
    }
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const h = el.getBoundingClientRect().height;
      root.style.setProperty(varName, `${Math.round(h)}px`);
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      root.style.removeProperty(varName);
    };
  }, [ref, varName, enabled]);
}

const readVar = (name: StickyVar, fallback: number) => {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/** header + 搜尋列高度（分頁列的 sticky top） */
export const getTabsTop = () => readVar("--vb-header-h", 64) + readVar("--vb-search-h", 0);

/** header + 搜尋列 + 分頁列高度（人數列的 sticky top / 捲動偏移） */
export const getLadderTop = () => getTabsTop() + readVar("--vb-tabs-h", 48);

export const TABS_TOP_CSS = "calc(var(--vb-header-h, 64px) + var(--vb-search-h, 0px))";
export const LADDER_TOP_CSS =
  "calc(var(--vb-header-h, 64px) + var(--vb-search-h, 0px) + var(--vb-tabs-h, 48px))";
