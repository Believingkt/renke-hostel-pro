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
  "booking.villa.ladder.summary.capacity.prefix": "可入住",
  "booking.villa.ladder.summary.capacity.rangeSeparator": "~",
  "booking.villa.ladder.summary.capacity.unit": "位",
  "booking.villa.ladder.summary.price.singleNight": "單晚總價",
  "booking.villa.ladder.summary.price.multipleNights": "{nights} 晚總價",
  "booking.villa.ladder.childFee.included": "含兒童加價 +NT${amount}",
  "booking.villa.ladder.childFee.line": "{label} × {count} 位",
  "booking.villa.ladder.childFee.nightMultiplier": "× {nights} 晚",
  "booking.villa.ladder.childFee.breakdownTotal": "合計（{breakdownNights} 晚）",


  "booking.villa.searchSheet.decrease": "減少",
  "booking.villa.searchSheet.increase": "增加",

  "booking.payment.loading.title": "正在確認付款結果...",
  "booking.payment.loading.desc": "請稍候，我們正在向銀行確認您的交易狀態",
  "booking.payment.creating.title": "付款成功！",
  "booking.payment.creating.desc": "正在為您建立訂單，請稍候...",
  "booking.payment.booking.title": "訂房成功！",
  "booking.payment.booking.desc": "感謝您的預訂，期待您的到來",
  "booking.payment.booking.emailSent": "確認郵件已發送至您的信箱",
  "booking.payment.field.orderNumber": "訂單編號",
  "booking.payment.field.roomType": "房型：",
  "booking.payment.field.checkIn": "入住：",
  "booking.payment.field.checkOut": "退房：",
  "booking.payment.field.nights": "共 {nights} 晚",
  "booking.payment.field.paidAmount": "已付金額",
  "booking.payment.field.amount": "付款金額",
  "booking.payment.field.transactionId": "交易編號",
  "booking.payment.field.authCode": "授權碼",
  "booking.payment.success.title": "付款成功！",
  "booking.payment.success.desc.admin": "訂單付款已完成，付款狀態已自動更新",
  "booking.payment.success.desc.general": "您的付款已完成，感謝您的訂購",
  "booking.payment.failed.title": "付款未完成",
  "booking.payment.failed.desc": "您的付款未能成功完成",
  "booking.payment.error.title": "處理失敗",
  "booking.payment.error.desc": "無法確認付款狀態",
  "booking.payment.error.contact": "如果您已完成付款，請聯繫客服確認訂單狀態。",
  "booking.payment.action.home": "返回首頁",
  "booking.payment.action.retryPayment": "重新付款",
  "booking.payment.action.retry": "重試",
  "booking.payment.action.orders": "返回訂單管理",
  "booking.payment.msg.missingRecTradeId": "缺少交易編號，無法查詢付款結果",
  "booking.payment.msg.verifyFailed": "付款驗證失敗",
  "booking.payment.msg.queryError": "查詢交易狀態時發生錯誤",
  "booking.payment.msg.orderCreateFailed": "訂單建立失敗",
  "booking.payment.msg.paidButOrderFailed": "付款成功但訂單建立失敗，請聯繫客服",
  "booking.payment.msg.groupBuyConfirmFailed": "付款結果確認失敗，請至訂單查詢頁確認或聯繫客服。",
  "booking.payment.msg.groupBuyNetworkFailed": "無法確認付款結果，請稍後至訂單查詢頁確認或聯繫客服。",
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

  "booking.villa.ladder.empty.all": "No bookable plans available",
  "booking.villa.ladder.empty.tier": "No plans available for this period",
  "booking.villa.ladder.roomAllocation.kicker": "ROOM ALLOCATION",
  "booking.villa.ladder.perks.title": "Exclusive Perks",
  "booking.villa.ladder.childFee.title": "Child surcharge details",
  "booking.villa.ladder.childFee.rules": "Rules for the selected child age groups",
  "booking.villa.ladder.childFee.total": "Total",
  "booking.villa.ladder.details.expand": "Show breakdown",
  "booking.villa.ladder.details.collapse": "Hide breakdown",
  "booking.villa.ladder.cta.book": "Book this stay",
  "booking.villa.ladder.childBlocked.toastTitle":
    "The selected number of children does not meet this property's policy",
  "booking.villa.ladder.childBlocked.toastDesc":
    "Please adjust the guest count in the search bar above and try again.",
  "booking.villa.ladder.tag.earlyBird": "Early Bird Offer",
  "booking.villa.ladder.tag.mealIncluded": "Two Meals Included",
  "booking.villa.ladder.tag.fewPeople": "Private Stay for Small Groups",
  "booking.villa.ladder.summary.capacity.prefix": "Sleeps",
  "booking.villa.ladder.summary.capacity.rangeSeparator": "–",
  "booking.villa.ladder.summary.capacity.unit": "guests",
  "booking.villa.ladder.summary.price.singleNight": "Total for 1 night",
  "booking.villa.ladder.summary.price.multipleNights": "{nights}-night total",
  "booking.villa.ladder.childFee.included": "Includes child surcharge +NT${amount}",
  "booking.villa.ladder.childFee.line": "{label} × {count}",
  "booking.villa.ladder.childFee.nightMultiplier": "× {nights} nights",
  "booking.villa.ladder.childFee.breakdownTotal": "Total ({breakdownNights}-night stay)",


  "booking.villa.searchSheet.decrease": "Decrease",
  "booking.villa.searchSheet.increase": "Increase",

  "booking.payment.loading.title": "Confirming your payment…",
  "booking.payment.loading.desc": "Please wait while we verify the transaction with your bank.",
  "booking.payment.creating.title": "Payment successful!",
  "booking.payment.creating.desc": "Creating your booking, please wait…",
  "booking.payment.booking.title": "Booking confirmed!",
  "booking.payment.booking.desc": "Thank you for your reservation. We look forward to welcoming you.",
  "booking.payment.booking.emailSent": "A confirmation email has been sent to your inbox.",
  "booking.payment.field.orderNumber": "Order number",
  "booking.payment.field.roomType": "Room type: ",
  "booking.payment.field.checkIn": "Check-in: ",
  "booking.payment.field.checkOut": "Check-out: ",
  "booking.payment.field.nights": "{nights} night(s)",
  "booking.payment.field.paidAmount": "Amount paid",
  "booking.payment.field.amount": "Payment amount",
  "booking.payment.field.transactionId": "Transaction ID",
  "booking.payment.field.authCode": "Auth code",
  "booking.payment.success.title": "Payment successful!",
  "booking.payment.success.desc.admin": "The order has been paid and its payment status is updated.",
  "booking.payment.success.desc.general": "Your payment is complete. Thank you for your order.",
  "booking.payment.failed.title": "Payment not completed",
  "booking.payment.failed.desc": "Your payment could not be completed.",
  "booking.payment.error.title": "Something went wrong",
  "booking.payment.error.desc": "We could not confirm the payment status.",
  "booking.payment.error.contact":
    "If you have already paid, please contact our team to confirm your order.",
  "booking.payment.action.home": "Back to home",
  "booking.payment.action.retryPayment": "Pay again",
  "booking.payment.action.retry": "Try again",
  "booking.payment.action.orders": "Back to order management",
  "booking.payment.msg.missingRecTradeId":
    "Transaction ID is missing, so the payment result cannot be checked.",
  "booking.payment.msg.verifyFailed": "Payment verification failed.",
  "booking.payment.msg.queryError": "An error occurred while checking the transaction status.",
  "booking.payment.msg.orderCreateFailed": "Order creation failed.",
  "booking.payment.msg.paidButOrderFailed":
    "Payment succeeded but the order could not be created. Please contact our team.",
  "booking.payment.msg.groupBuyConfirmFailed":
    "We could not confirm the payment result. Please check the order lookup page or contact our team.",
  "booking.payment.msg.groupBuyNetworkFailed":
    "Unable to confirm the payment result. Please check the order lookup page later or contact our team.",
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
