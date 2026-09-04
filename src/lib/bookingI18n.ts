/**
 * Booking 前台專用 i18n（顯示層）。
 * - 僅存放顯示文案，不含任何 business enum / 價格 / 房量 / ID / 計價規則
 * - key 一律使用穩定英文命名，禁止以中文原文作 key
 * - missing key：development 會 console.warn，production 回傳中文 fallback，永不顯示 raw key
 */
import { zhTW, enUS } from "date-fns/locale";
import type { Locale } from "date-fns";

export type BookingLang = "zh-TW" | "en";

export const BOOKING_LANGS: BookingLang[] = ["zh-TW", "en"];
export const DEFAULT_BOOKING_LANG: BookingLang = "zh-TW";
export const BOOKING_LANG_STORAGE_KEY = "booking_lang";

export const isBookingLang = (v: unknown): v is BookingLang =>
  typeof v === "string" && (BOOKING_LANGS as string[]).includes(v);

export const normalizeBookingLang = (v: unknown): BookingLang =>
  isBookingLang(v) ? v : DEFAULT_BOOKING_LANG;

const zh = {
  "booking.common.language": "語言選擇",
  "booking.common.language.zh": "繁中",
  "booking.common.language.en": "EN",
  "booking.common.language.switchTo.zh": "切換為繁體中文",
  "booking.common.language.switchTo.en": "Switch to English",

  "booking.villa.header.back": "返回",
  "booking.villa.header.share": "分享",
  "booking.villa.header.member": "會員中心",
  "booking.villa.header.login": "登入",
  "booking.villa.header.logoAlt": "Lakeze 人客多",
  "booking.villa.header.shareCopied": "已複製連結",
  "booking.villa.header.shareError": "無法分享，請手動複製網址",

  "booking.villa.error.title": "無法載入資料",
  "booking.villa.error.retry": "重新整理",

  "booking.villa.tabs.nav": "區塊導覽",
  "booking.villa.tabs.plans": "入住方案",
  "booking.villa.tabs.facilities": "設施",
  "booking.villa.tabs.location": "交通建議",
  "booking.villa.tabs.reviews": "Google 評論",
  "booking.villa.tabs.faq": "常見問題",
  "booking.villa.tabs.about": "描述",
  "booking.villa.tabs.policy": "訂房須知",
  "booking.villa.tabs.similar": "鄰近住宿",

  "booking.villa.overview.rooms": "三代同堂剛剛好",
  "booking.villa.overview.capacity": "人都住得下",
  "booking.villa.overview.size": "坪・烤肉派對 ok",
  "booking.villa.overview.region": "景觀環繞",

  "booking.villa.photos.prev": "上一張",
  "booking.villa.photos.next": "下一張",
  "booking.villa.photos.alt": "住宿照片 {index}",
  "booking.villa.photos.counter": "{current} / {total}",
} as const;

export type BookingI18nKey = keyof typeof zh;

const en: Record<BookingI18nKey, string> = {
  "booking.common.language": "Language",
  "booking.common.language.zh": "繁中",
  "booking.common.language.en": "EN",
  "booking.common.language.switchTo.zh": "切換為繁體中文",
  "booking.common.language.switchTo.en": "Switch to English",

  "booking.villa.header.back": "Back",
  "booking.villa.header.share": "Share",
  "booking.villa.header.member": "Member Center",
  "booking.villa.header.login": "Log In",
  "booking.villa.header.logoAlt": "Lakeze",
  "booking.villa.header.shareCopied": "Link copied",
  "booking.villa.header.shareError": "Unable to share. Please copy the URL manually.",

  "booking.villa.error.title": "Unable to load this page",
  "booking.villa.error.retry": "Reload",

  "booking.villa.tabs.nav": "Section navigation",
  "booking.villa.tabs.plans": "Stay Options",
  "booking.villa.tabs.facilities": "Facilities",
  "booking.villa.tabs.location": "Getting Here",
  "booking.villa.tabs.reviews": "Google Reviews",
  "booking.villa.tabs.faq": "FAQ",
  "booking.villa.tabs.about": "About",
  "booking.villa.tabs.policy": "Booking Info",
  "booking.villa.tabs.similar": "Nearby Stays",

  "booking.villa.overview.rooms": "rooms in total",
  "booking.villa.overview.capacity": "guests can stay",
  "booking.villa.overview.size": "ping of space",
  "booking.villa.overview.region": "surrounding area",

  "booking.villa.photos.prev": "Previous photo",
  "booking.villa.photos.next": "Next photo",
  "booking.villa.photos.alt": "Stay photo {index}",
  "booking.villa.photos.counter": "{current} / {total}",
};

const DICTS: Record<BookingLang, Record<string, string>> = {
  "zh-TW": zh as unknown as Record<string, string>,
  en,
};

const interpolate = (template: string, vars?: Record<string, string | number>) => {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (raw, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? raw : String(v);
  });
};

/** 取得顯示文案；缺 key 時 fallback 中文，永不回傳 raw key */
export const translate = (
  lang: BookingLang,
  key: BookingI18nKey | string,
  vars?: Record<string, string | number>,
): string => {
  const dict = DICTS[normalizeBookingLang(lang)];
  const zhDict = DICTS["zh-TW"];
  const value = dict[key] ?? zhDict[key];
  if (value === undefined) {
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[bookingI18n] missing key: ${key}`);
    }
    return "";
  }
  return interpolate(value, vars);
};

export const getBookingDateLocale = (lang: BookingLang): Locale =>
  normalizeBookingLang(lang) === "en" ? enUS : zhTW;
