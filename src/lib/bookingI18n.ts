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
  "booking.villa.photos.viewAll": "查看全部照片",
  "booking.villa.photos.gridCount": "{total} 張照片",
  "booking.villa.photos.gridView": "全部照片",
  "booking.villa.photos.singleView": "單張檢視",
  "booking.villa.photos.thumbAlt": "{name} 縮圖 {index}",
  "booking.villa.photos.close": "關閉",

  "booking.villa.location.title": "交通建議",
  "booking.villa.location.zoomMap": "放大地圖",
  "booking.villa.location.copySuccess": "地址已複製",
  "booking.villa.location.copyError": "複製失敗",
  "booking.villa.location.tabs.transit": "大眾運輸",
  "booking.villa.location.tabs.driving": "自行開車",
  "booking.villa.location.tabs.landmark": "週邊景點",
  "booking.villa.location.empty": "暫無相關資訊",

  "booking.villa.ai.hint": "有疑問，請點我 👉",
  "booking.villa.ai.hint.close": "關閉提示",
  "booking.villa.ai.open": "開啟 AI 管家",
  "booking.villa.ai.clear": "清除對話",
  "booking.villa.ai.title": "AI 管家",
  "booking.villa.ai.subtitle": "・回答基本問題",
  "booking.villa.ai.human": "需要真人協助？點此轉接客服",
  "booking.villa.ai.placeholder": "輸入您的問題…",
  "booking.villa.ai.greeting": "您好，我是 {name} 的 AI 管家，",
  "booking.villa.ai.greetingSub": "可以回答房型、價格、設施等基本問題。",
  "booking.villa.ai.fallbackName": "本民宿",
  "booking.villa.ai.toast.rateLimit": "請稍候",
  "booking.villa.ai.toast.rateLimit.desc": "詢問太頻繁，請稍後再試",
  "booking.villa.ai.toast.unavailable": "AI 服務暫時不可用",
  "booking.villa.ai.toast.unavailable.desc": "請改用真人客服",
  "booking.villa.ai.toast.failed": "對話失敗",
  "booking.villa.ai.toast.network": "連線失敗",
  "booking.villa.ai.toast.retry": "請稍後再試",

  "booking.villa.similar.title": "您可能也喜歡",

  "booking.villa.ladder.scrollMore": "滑動看更多 ›",
  "booking.villa.ladder.scrollLeft": "向左滑動",
  "booking.villa.ladder.scrollRight": "向右滑動",

  "booking.villa.ladder.empty.all": "目前沒有可預訂的方案",
  "booking.villa.ladder.empty.tier": "此時段目前沒有可預訂的方案",
  "booking.villa.ladder.roomAllocation.kicker": "ROOM ALLOCATION",
  "booking.villa.ladder.perks.title": "尊榮禮遇",
  "booking.villa.ladder.childFee.title": "兒童加價明細",
  "booking.villa.ladder.childFee.rules": "您選擇的兒童年齡層規則",
  "booking.villa.ladder.childFee.total": "合計",
  "booking.villa.ladder.details.expand": "展開詳細計算",
  "booking.villa.ladder.details.collapse": "收合詳細計算",
  "booking.villa.ladder.cta.book": "預約這段專屬假期",
  "booking.villa.ladder.childBlocked.toastTitle": "兒童人數不符合此民宿規範",
  "booking.villa.ladder.childBlocked.toastDesc": "請點選上方搜尋條調整人數後再試。",
  "booking.villa.ladder.tag.earlyBird": "早鳥優惠",
  "booking.villa.ladder.tag.mealIncluded": "一泊二食",
  "booking.villa.ladder.tag.fewPeople": "少人數包棟",


  "booking.villa.searchSheet.decrease": "減少",
  "booking.villa.searchSheet.increase": "增加",
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
  "booking.villa.photos.viewAll": "View all photos",
  "booking.villa.photos.gridCount": "{total} photos",
  "booking.villa.photos.gridView": "All photos",
  "booking.villa.photos.singleView": "Single view",
  "booking.villa.photos.thumbAlt": "{name} thumbnail {index}",
  "booking.villa.photos.close": "Close",

  "booking.villa.location.title": "Getting Here",
  "booking.villa.location.zoomMap": "Enlarge map",
  "booking.villa.location.copySuccess": "Address copied",
  "booking.villa.location.copyError": "Copy failed",
  "booking.villa.location.tabs.transit": "Public Transit",
  "booking.villa.location.tabs.driving": "Driving",
  "booking.villa.location.tabs.landmark": "Nearby Attractions",
  "booking.villa.location.empty": "No information available",

  "booking.villa.ai.hint": "Questions? Tap here 👉",
  "booking.villa.ai.hint.close": "Dismiss hint",
  "booking.villa.ai.open": "Open AI concierge",
  "booking.villa.ai.clear": "Clear conversation",
  "booking.villa.ai.title": "AI Concierge",
  "booking.villa.ai.subtitle": "・Answers general questions",
  "booking.villa.ai.human": "Need a human? Contact our team",
  "booking.villa.ai.placeholder": "Type your question…",
  "booking.villa.ai.greeting": "Hello, I'm the AI concierge of {name},",
  "booking.villa.ai.greetingSub": "I can answer basic questions about room types, prices, and facilities.",
  "booking.villa.ai.fallbackName": "this property",
  "booking.villa.ai.toast.rateLimit": "Please wait",
  "booking.villa.ai.toast.rateLimit.desc": "Too many requests. Please try again later.",
  "booking.villa.ai.toast.unavailable": "AI service is temporarily unavailable",
  "booking.villa.ai.toast.unavailable.desc": "Please contact our human support instead",
  "booking.villa.ai.toast.failed": "Conversation failed",
  "booking.villa.ai.toast.network": "Connection failed",
  "booking.villa.ai.toast.retry": "Please try again later",

  "booking.villa.similar.title": "You may also like",

  "booking.villa.ladder.scrollMore": "Swipe for more ›",
  "booking.villa.ladder.scrollLeft": "Scroll left",
  "booking.villa.ladder.scrollRight": "Scroll right",

  "booking.villa.searchSheet.decrease": "Decrease",
  "booking.villa.searchSheet.increase": "Increase",
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
