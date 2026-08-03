/**
 * 行程模組三語工具。
 * 多語內容一律以 jsonb {zh, ja, en} 儲存，前端用 pickLang 取值。
 */

export type TripLang = "zh" | "ja" | "en";

export const TRIP_LANGS: { code: TripLang; label: string }[] = [
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "en", label: "EN" },
];

export function normalizeLang(value: string | null | undefined): TripLang {
  if (value === "ja" || value === "en") return value;
  return "zh";
}

type LangMap = Partial<Record<TripLang, string>> | null | undefined;

/** 取指定語言字串，缺漏時依 zh → en → ja 順序 fallback */
export function pickLang(value: unknown, lang: TripLang): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const map = value as LangMap;
  return map?.[lang] || map?.zh || map?.en || map?.ja || "";
}

/** 行程模組 UI 字串（不引入額外 i18n 套件，維持既有專案輕量做法） */
export const TRIP_UI_TEXT = {
  zh: {
    tripsTitle: "精選行程",
    tripsSubtitle: "小安幫你排好的日月潭主題行程",
    match: "匹配度",
    spots: (n: number) => `${n} 個精選景點（已排序）`,
    total: "行程總價",
    totalDuration: (h: string) => `總時長約 ${h} 小時`,
    cta: "加入行程／預約",
    day: (n: number) => `第 ${n} 天`,
    stayLabel: "住宿",
    remain: (n: number) => `餘 ${n} 間`,
    soldOut: "已滿",
    checking: "查詢中",
    notFound: "找不到這個行程",
    back: "返回行程列表",
    free: "免費",
    share: "分享",
    shareTitle: "分享這個行程",
    copyLink: "複製",
    copied: "已複製連結",
    qrHint: "掃描 QR code 或複製連結分享給朋友",
    remainStock: (n: number) => `剩餘 ${n}`,
    soldOutProduct: "已售完",
    syncedAt: (time: string) => `已同步 ${time}`,
    lvtuTitle: "台灣旅圖 · 可預約",
    lvtuCta: "立即預約",
    viewOnly: "分享檢視（唯讀）",
    soldOutBlocked: "已滿的項目無法加入購物車",
  },
  ja: {
    tripsTitle: "おすすめ旅程",
    tripsSubtitle: "アンさんが組んだ日月潭テーマ旅程",
    match: "マッチ度",
    spots: (n: number) => `厳選スポット ${n} ヶ所（順路済み）`,
    total: "旅程合計",
    totalDuration: (h: string) => `所要時間 約 ${h} 時間`,
    cta: "旅程に追加／予約",
    day: (n: number) => `${n} 日目`,
    stayLabel: "宿泊",
    remain: (n: number) => `残り ${n} 室`,
    soldOut: "満室",
    checking: "確認中",
    notFound: "旅程が見つかりません",
    back: "旅程一覧へ戻る",
    free: "無料",
    share: "シェア",
    shareTitle: "この旅程をシェア",
    copyLink: "コピー",
    copied: "リンクをコピーしました",
    qrHint: "QR コードを読み取るか、リンクをコピーして共有",
    remainStock: (n: number) => `残り ${n}`,
    soldOutProduct: "完売",
    syncedAt: (time: string) => `同期済み ${time}`,
    lvtuTitle: "台湾旅圖 · 予約可能",
    lvtuCta: "今すぐ予約",
    viewOnly: "共有ビュー（閲覧のみ）",
    soldOutBlocked: "満室の項目はカートに追加できません",
  },
  en: {
    tripsTitle: "Curated Trips",
    tripsSubtitle: "Sun Moon Lake itineraries planned by An",
    match: "Match",
    spots: (n: number) => `${n} curated stops (sequenced)`,
    total: "Trip total",
    totalDuration: (h: string) => `About ${h} hours in total`,
    cta: "Add trip / Book",
    day: (n: number) => `Day ${n}`,
    stayLabel: "Stay",
    remain: (n: number) => `${n} left`,
    soldOut: "Sold out",
    checking: "Checking",
    notFound: "Trip not found",
    back: "Back to trips",
    free: "Free",
    share: "Share",
    shareTitle: "Share this trip",
    copyLink: "Copy",
    copied: "Link copied",
    qrHint: "Scan the QR code or copy the link to share",
    remainStock: (n: number) => `${n} left`,
    soldOutProduct: "Sold out",
    syncedAt: (time: string) => `Synced ${time}`,
    lvtuTitle: "Taiwan LvTu · Available",
    lvtuCta: "Book now",
    viewOnly: "Shared view (read-only)",
    soldOutBlocked: "Sold-out items cannot be added to the cart",
  },
} as const;

export function tripText(lang: TripLang) {
  return TRIP_UI_TEXT[lang];
}
