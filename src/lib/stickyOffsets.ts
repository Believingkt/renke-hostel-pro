import { useLayoutEffect, useState, useCallback, RefObject } from "react";

/**
 * 訂房頁黏頂列高度變數（動態量測，避免硬寫 px 造成重疊）
 * --vb-header-h : 主 header 高度
 * --vb-search-h : 桌機搜尋列高度（手機為 0）
 * --vb-tabs-h   : 區塊分頁列高度
 */
export type StickyVar = "--vb-header-h" | "--vb-search-h" | "--vb-tabs-h";

/** 量測元素高度並寫入 :root CSS 變數；元素不存在／隱藏時寫 0px */
export function useStickyHeightVar(
  refOrEl: RefObject<HTMLElement> | HTMLElement | null,
  varName: StickyVar,
  enabled = true,
) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      root.style.setProperty(varName, "0px");
      return () => root.style.removeProperty(varName);
    }
    const el =
      refOrEl && "current" in (refOrEl as RefObject<HTMLElement>)
        ? (refOrEl as RefObject<HTMLElement>).current
        : (refOrEl as HTMLElement | null);
    if (!el) return;

    // 用 ceil 避免縮放（zoom）時小數高度被無條件捨去而產生 1px 重疊
    const update = () => {
      const h = el.getBoundingClientRect().height;
      root.style.setProperty(varName, `${Math.ceil(h)}px`);
    };
    // 旋轉／視窗縮放時瀏覽器回報的尺寸可能仍是舊值，延後一幀再量一次
    const updateDeferred = () => {
      update();
      requestAnimationFrame(update);
      setTimeout(update, 250);
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", updateDeferred);
    window.addEventListener("orientationchange", updateDeferred);
    // 手機瀏覽器網址列收合／雙指縮放只會觸發 visualViewport 事件
    const vv = window.visualViewport;
    vv?.addEventListener("resize", updateDeferred);
    vv?.addEventListener("scroll", update);
    // 字型載入完成後高度可能改變
    (document as any).fonts?.ready?.then?.(update).catch?.(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateDeferred);
      window.removeEventListener("orientationchange", updateDeferred);
      vv?.removeEventListener("resize", updateDeferred);
      vv?.removeEventListener("scroll", update);
      root.style.removeProperty(varName);
    };

  }, [refOrEl, varName, enabled]);
}

/** 回傳 callback ref，元素掛載/卸載時自動更新 CSS 變數（適用條件渲染的元素） */
export function useStickyHeightRef<T extends HTMLElement>(varName: StickyVar, enabled = true) {
  const [el, setEl] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useStickyHeightVar(el, varName, enabled);
  return ref;
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
