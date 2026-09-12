/**
 * useTranslatedFields — 前台動態內容（後台維護的中文）自動翻譯顯示。
 *
 * 規則：
 * - 中文模式：完全不呼叫 translate-content，直接回原文。
 * - 英文模式：整批送出當頁動態文字；翻譯回來前先顯示原文（不閃爍、不做骨架）。
 * - 只影響顯示，不寫入任何業務資料、不觸發計價或建單。
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBookingLocale } from "@/contexts/BookingLocaleContext";

export interface TranslatableField {
  /** 來源資料表，例如 room_types */
  table: string;
  /** 來源欄位，例如 name */
  column: string;
  /** 來源資料 ID（沒有 ID 時可用穩定字串） */
  id: string;
  /** 原文（繁體中文） */
  text: string;
}

const keyOf = (f: { table: string; column: string; id: string }) =>
  `${f.table}.${f.column}.${f.id}`;

export interface UseTranslatedFieldsResult {
  /** 取顯示文字：翻譯好就給英文，否則給原文 */
  tf: (field: TranslatableField) => string;
  /** 是否正在翻譯（僅供需要時使用，預設不必顯示任何 loading） */
  translating: boolean;
}

export interface UseTranslatedFieldsOptions {
  /**
   * 冷啟動處理（可選，預設 false＝行為與過去完全相同）。
   * 開啟後：僅在英文模式且該欄位尚未取得譯文時，先回傳空字串，
   * 避免英文頁面先閃一下中文；中文模式完全不受影響。
   */
  deferUntilTranslated?: boolean;
}

export function useTranslatedFields(
  fields: TranslatableField[],
  options: UseTranslatedFieldsOptions = {},
): UseTranslatedFieldsResult {
  const { deferUntilTranslated = false } = options;
  const { lang } = useBookingLocale();
  const [map, setMap] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);
  const requestedRef = useRef<Set<string>>(new Set());

  const valid = fields.filter((f) => f.table && f.column && f.id && f.text?.trim());
  const signature = `${lang}|${valid.map((f) => `${keyOf(f)}:${f.text}`).join("|")}`;

  useEffect(() => {
    if (lang !== "en" || valid.length === 0) return;
    if (requestedRef.current.has(signature)) return;
    requestedRef.current.add(signature);

    let cancelled = false;
    setTranslating(true);
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("translate-content", {
          body: {
            lang: "en",
            items: valid.map((f) => ({
              table: f.table,
              column: f.column,
              id: f.id,
              text: f.text,
            })),
          },
        });
        if (cancelled) return;
        if (error) return;
        const translations = (data as { translations?: Record<string, string> })?.translations;
        if (translations && Object.keys(translations).length > 0) {
          setMap((prev) => ({ ...prev, ...translations }));
        }
      } catch {
        /* 翻譯失敗就維持原文顯示 */
      } finally {
        if (!cancelled) setTranslating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, lang]);

  const tf = (field: TranslatableField) => {
    if (lang !== "en") return field.text;
    return map[keyOf(field)] || field.text;
  };

  return { tf, translating };
}

export default useTranslatedFields;
