/**
 * 共用區塊（設施／常見問題／評價／訂房須知／交通）的「可選」雙語介面。
 *
 * 設計原則：
 * - 呼叫端**未傳** localize 時，元件渲染結果與過去完全相同（原樣繁中）。
 *   因此民宿官網首頁 Index.tsx、團購頁 GroupBuyCampaign.tsx 等範圍外頁面零影響。
 * - 只影響顯示文字，不改資料抓取、篩選、排序或任何業務邏輯。
 */
import { useEffect, useRef, useState } from "react";
import { useBookingLocale } from "@/contexts/BookingLocaleContext";
import { useTranslatedFields, type TranslatableField } from "@/hooks/use-translated-fields";

export interface SectionLocalize {
  /** 固定介面文字（字典 key） */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** 後台維護的動態內容（欄位、資料 ID、原文） */
  tf: (column: string, id: string, text: string) => string;
}

export function makeSectionText(localize?: SectionLocalize) {
  return {
    /** 固定文字：未傳 localize 時回傳原本的中文 fallback */
    ui: (key: string, fallback: string, vars?: Record<string, string | number>) =>
      localize ? localize.t(key, vars) : fallback,
    /** 動態內容：未傳 localize 時原樣回傳 */
    dyn: (column: string, id: string, text: string) =>
      localize && text ? localize.tf(column, id, text) : text,
  };
}


/* ------------------------------------------------------------------ *
 * 共用區塊的「延遲登記」翻譯：子元件自行抓資料時使用。
 * 子元件第一次要顯示某段動態文字時才登記，翻譯回來後自動換成英文。
 * 中文模式完全不呼叫翻譯，行為與過去相同。
 * ------------------------------------------------------------------ */
export function useLazySectionLocalize(table: string): SectionLocalize {
  const { t, lang } = useBookingLocale();
  const [fields, setFields] = useState<TranslatableField[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const pending = useRef<TranslatableField[]>([]);
  const { tf } = useTranslatedFields(fields);

  useEffect(() => {
    if (pending.current.length === 0) return;
    const add = pending.current;
    pending.current = [];
    setFields((prev) => [...prev, ...add]);
  });

  return {
    t: (key, vars) => t(key as never, vars),
    tf: (column, id, text) => {
      if (!text) return text;
      const key = `${table}.${column}.${id}`;
      if (lang === "en" && !seen.current.has(key)) {
        seen.current.add(key);
        pending.current.push({ table, column, id, text });
      }
      return tf({ table, column, id, text });
    },
  };
}
