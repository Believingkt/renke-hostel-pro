/**
 * Booking 前台語言 Context（顯示層 only）。
 * 只保存 lang / setLang / t / 日期 locale，不保存任何 Booking business state。
 * 語言狀態只透過 localStorage（booking_lang）保存，不讀寫 URL、不 navigate。
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  BOOKING_LANG_STORAGE_KEY,
  DEFAULT_BOOKING_LANG,
  getBookingDateLocale,
  normalizeBookingLang,
  translate,
  type BookingI18nKey,
  type BookingLang,
} from "@lakeze/shared/lib/bookingI18n";
import type { Locale } from "date-fns";

interface BookingLocaleValue {
  lang: BookingLang;
  setLang: (lang: BookingLang) => void;
  t: (key: BookingI18nKey | string, vars?: Record<string, string | number>) => string;
  dateLocale: Locale;
}

const readStoredLang = (): BookingLang => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return DEFAULT_BOOKING_LANG;
    return normalizeBookingLang(window.localStorage.getItem(BOOKING_LANG_STORAGE_KEY));
  } catch {
    return DEFAULT_BOOKING_LANG;
  }
};

const BookingLocaleContext = createContext<BookingLocaleValue | null>(null);

export const BookingLocaleProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLangState] = useState<BookingLang>(readStoredLang);

  const setLang = useCallback((next: BookingLang) => {
    const safe = normalizeBookingLang(next);
    setLangState(safe);
    try {
      window.localStorage?.setItem(BOOKING_LANG_STORAGE_KEY, safe);
    } catch {
      /* localStorage 不可用時僅保留記憶體狀態 */
    }
  }, []);

  const value = useMemo<BookingLocaleValue>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      dateLocale: getBookingDateLocale(lang),
    }),
    [lang, setLang],
  );

  return (
    <BookingLocaleContext.Provider value={value}>{children}</BookingLocaleContext.Provider>
  );
};

/** 無 Provider 時安全回退為預設中文，不 throw */
export const useBookingLocale = (): BookingLocaleValue => {
  const ctx = useContext(BookingLocaleContext);
  if (ctx) return ctx;
  return {
    lang: DEFAULT_BOOKING_LANG,
    setLang: () => {},
    t: (key, vars) => translate(DEFAULT_BOOKING_LANG, key, vars),
    dateLocale: getBookingDateLocale(DEFAULT_BOOKING_LANG),
  };
};

export default BookingLocaleProvider;
