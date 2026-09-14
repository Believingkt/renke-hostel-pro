/**
 * 上架引導 15 步驟的完成度判定 —— 純函式，無任何 I/O。
 *
 * 判定型別：
 *  - "auto"：純讀既有表推導（A 型）
 *  - "confirm"：讀 accommodation_onboarding_steps 的業主確認狀態（B 型）
 *  - "hq"：總部設定，唯讀顯示，不計入完成度分母
 *
 * 重要規則（已定案）：
 *  - 第 7、9 步：在「未來 30 天」這個視窗內，需有 **至少 7 個不重複的可售日期**。
 *    視窗是 30 天，門檻是 7 天，兩者不可混淆。
 *  - 第 3 步：讀 accommodation_facilities 自己的 is_available，
 *    **不讀** accommodation_info.is_active（該欄位語意有已知缺陷，另案處理）。
 *  - 第 13 步：選填，不計入完成度分母，不擋上架。
 *  - 第 15 步：需 1–10 全綠 **且** 第 14 步已確認才可按。
 */

// 取價與平假日分級：直接沿用前台／驗價實際在跑的既有函式，不另外重寫一份規則。
import {
  resolvePackagePriceForDate,
  resolvePackageAvailabilityForDate,
  overrideKey,
  type PackageDatePriceMap,
} from "@/lib/packageDatePrice";
import { classifyDayTier } from "@/utils/templatePriceResolverPure";
import type { PackageTier } from "@/hooks/use-accommodation-packages";

export const ONBOARDING_WINDOW_DAYS = 30;
export const ONBOARDING_MIN_SELLABLE_DAYS = 7;

export type StepKind = "auto" | "confirm" | "hq";
export type StepStatus = "completed" | "pending" | "hq";

export interface StepDef {
  no: number;
  key: string;
  title: string;
  kind: StepKind;
  /** 選填步驟不計入完成度分母、不擋上架 */
  optional?: boolean;
  /** 引導頁上的「前往設定」連結 */
  link?: string;
  hint: string;
}

export const ONBOARDING_STEPS: StepDef[] = [
  { no: 1, key: "basic_info", title: "基本資料", kind: "auto", link: "/admin/website-content?tab=basic-info", hint: "民宿名稱、地址、電話、簡介都要填。" },
  { no: 2, key: "about_photos", title: "介紹與照片", kind: "auto", link: "/admin/website-content?tab=gallery", hint: "填寫民宿介紹，並上傳至少 3 張照片。" },
  { no: 3, key: "facilities", title: "設施服務", kind: "auto", link: "/admin/website-content?tab=facilities", hint: "至少勾選一項提供的設施。" },
  { no: 4, key: "room_types", title: "房型與房間照片", kind: "auto", link: "/admin/pricing?tab=rooms", hint: "每個房型都要有名稱與至少一張照片。" },
  { no: 5, key: "capacity", title: "入住人數", kind: "auto", link: "/admin/pricing?tab=rooms", hint: "每個房型都要設定可住人數。" },
  { no: 6, key: "pricing_template", title: "房價設定", kind: "auto", link: "/admin/projects", hint: "建立房價並綁定到房型。" },
  { no: 7, key: "inventory", title: "開放庫存", kind: "auto", link: "/admin/room-price-calendar", hint: `未來 ${ONBOARDING_WINDOW_DAYS} 天內，至少要有 ${ONBOARDING_MIN_SELLABLE_DAYS} 天開放可訂。` },
  { no: 8, key: "packages", title: "訂房方案", kind: "auto", link: "/admin/packages", hint: "至少建立並啟用一個訂房方案。" },
  { no: 9, key: "package_prices", title: "前台訂房價格", kind: "auto", link: "/admin/package-price-calendar", hint: `未來 ${ONBOARDING_WINDOW_DAYS} 天內，至少要有 ${ONBOARDING_MIN_SELLABLE_DAYS} 天標好價格。` },
  { no: 10, key: "payment_methods", title: "付款方式", kind: "auto", link: "/admin/website-content?tab=booking-info", hint: "至少開啟一種付款方式。" },
  { no: 11, key: "deposit_percentage", title: "訂金比例", kind: "hq", hint: "由總部設定，需要調整請聯絡總部。" },
  { no: 12, key: "security_deposit", title: "入住押金", kind: "hq", hint: "由總部設定，需要調整請聯絡總部。" },
  { no: 13, key: "notification_emails", title: "訂房通知信箱", kind: "auto", optional: true, link: "/admin/website-content?tab=email-notification", hint: "選填。填了之後，客人訂房成功時民宿端也會收到一份副本。" },
  { no: 14, key: "cancellation_policy", title: "取消政策與注意事項", kind: "confirm", link: "/admin/website-content?tab=booking-info", hint: "請確認取消政策與注意事項內容正確，確認後按下按鈕。" },
  { no: 15, key: "final_check", title: "上架前最終確認", kind: "confirm", hint: "前面必要項目都完成後，按下最終確認。" },
];

/** 判定所需的原始資料（由 hook 取得後餵進來） */
export interface OnboardingPackage {
  id: string;
  enabled: boolean | null;
  sale_price?: number | null;
  original_price?: number | null;
  tier_prices?: any;
  applicable_tiers?: PackageTier[] | null;
  /** 結構化房型分配（縮圖來源，優先） */
  room_type_allocation?: Array<{ room_type_id?: string | null }> | null;
  room_type_ids?: string[] | null;
  primary_room_type_id?: string | null;
}

export interface OnboardingSource {
  /** 今日（台北）yyyy-MM-dd */
  today: string;
  info: { name?: string | null; address?: string | null; phone?: string | null; description?: string | null } | null;
  about: { section_title?: string | null; section_description?: string | null } | null;
  photoCount: number;
  /** accommodation_facilities：該館別的列（含 is_available） */
  facilities: Array<{ is_available: boolean | null }>;
  roomTypes: Array<{ id: string; name: string | null; capacity: number | null }>;
  roomPhotoRoomTypeIds: string[];
  pricingTemplates: Array<{ room_type_ids: string[] | null }>;
  /** 未來 30 天內的庫存＋逐日房價列（已由查詢限定日期區間與本館房型） */
  inventoryRows: Array<{
    date: string;
    available_rooms: number | null;
    price?: number | null;
    price_2_meals?: number | null;
    price_3_meals?: number | null;
  }>;
  packages: OnboardingPackage[];
  /** 未來 30 天內的方案單日覆寫列（已由查詢限定日期區間與本館） */
  packagePriceRows: Array<{
    date: string;
    package_id: string;
    sale_price: number | null;
    original_price?: number | null;
    is_available: boolean | null;
  }>;
  /** 國定假日 yyyy-MM-dd（用於平假日分級，與前台同一套 classifyDayTier） */
  publicHolidays?: string[];
  bookingSettings: { payment_methods: string[] | null; deposit_percentage: number | null; security_deposit_amount: number | null; free_cancel_days: number | null } | null;
  notificationEmails: string[];
  /** accommodation_onboarding_steps：step_key → status */
  confirmations: Record<string, string>;
}

export interface StepResult extends StepDef {
  status: StepStatus;
  /** HQ 步驟顯示的現值 */
  hqValue?: string;
}

const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/** 未來 N 天的日期字串集合（含今天） */
export function futureWindow(today: string, days = ONBOARDING_WINDOW_DAYS): Set<string> {
  const out = new Set<string>();
  const base = new Date(`${today}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    out.add(d.toISOString().slice(0, 10));
  }
  return out;
}

const dayOnly = (d: string) => (d.includes("T") ? d.split("T")[0] : d);

export function evaluateSteps(src: OnboardingSource): StepResult[] {
  const window = futureWindow(src.today);

  // 第 7 步：視窗 30 天內，available_rooms > 0 的「不重複日期」數
  const sellableInventoryDays = new Set(
    src.inventoryRows
      .filter((r) => Number(r.available_rooms ?? 0) > 0 && window.has(dayOnly(r.date)))
      .map((r) => dayOnly(r.date)),
  ).size;

  const enabledPackageIds = new Set(src.packages.filter((p) => p.enabled === true).map((p) => p.id));

  // 第 9 步：視窗 30 天內，啟用方案且有正價格的「不重複日期」數
  const pricedPackageDays = new Set(
    src.packagePriceRows
      .filter(
        (r) =>
          enabledPackageIds.has(r.package_id) &&
          r.is_available !== false &&
          Number(r.sale_price ?? 0) > 0 &&
          window.has(dayOnly(r.date)),
      )
      .map((r) => dayOnly(r.date)),
  ).size;

  const roomPhotoSet = new Set(src.roomPhotoRoomTypeIds);
  const roomTypeIds = new Set(src.roomTypes.map((r) => r.id));

  const auto: Record<string, boolean> = {
    basic_info:
      nonEmpty(src.info?.name) && nonEmpty(src.info?.address) && nonEmpty(src.info?.phone) && nonEmpty(src.info?.description),
    about_photos:
      (nonEmpty(src.about?.section_title) || nonEmpty(src.about?.section_description)) && src.photoCount >= 3,
    // 讀設施自己的 is_available，不讀 accommodation_info.is_active
    facilities: src.facilities.some((f) => f.is_available !== false),
    room_types: src.roomTypes.length > 0 && src.roomTypes.every((rt) => nonEmpty(rt.name) && roomPhotoSet.has(rt.id)),
    capacity: src.roomTypes.length > 0 && src.roomTypes.every((rt) => Number(rt.capacity ?? 0) > 0),
    pricing_template: src.pricingTemplates.some((t) => (t.room_type_ids ?? []).some((id) => roomTypeIds.has(id))),
    inventory: sellableInventoryDays >= ONBOARDING_MIN_SELLABLE_DAYS,
    packages: enabledPackageIds.size > 0,
    package_prices: pricedPackageDays >= ONBOARDING_MIN_SELLABLE_DAYS,
    payment_methods: Array.isArray(src.bookingSettings?.payment_methods)
      ? src.bookingSettings!.payment_methods!.length > 0
      : false,
    notification_emails: src.notificationEmails.length > 0,
  };

  const hqValue: Record<string, string> = {
    deposit_percentage:
      src.bookingSettings?.deposit_percentage != null ? `目前：訂金 ${src.bookingSettings.deposit_percentage}%` : "尚未設定",
    security_deposit:
      src.bookingSettings?.security_deposit_amount != null
        ? `目前：押金 NT$${Number(src.bookingSettings.security_deposit_amount).toLocaleString()}`
        : "尚未設定",
  };

  return ONBOARDING_STEPS.map((def) => {
    if (def.kind === "hq") return { ...def, status: "hq" as StepStatus, hqValue: hqValue[def.key] };
    if (def.kind === "confirm") {
      return { ...def, status: src.confirmations[def.key] === "confirmed" ? "completed" : "pending" };
    }
    return { ...def, status: auto[def.key] ? "completed" : "pending" };
  });
}

/** 完成度分母＝必要的 auto 步驟（排除選填與 HQ 與 confirm） */
export function requiredAutoSteps(results: StepResult[]): StepResult[] {
  return results.filter((r) => r.kind === "auto" && !r.optional);
}

export function progressOf(results: StepResult[]): { done: number; total: number } {
  const req = requiredAutoSteps(results);
  return { done: req.filter((r) => r.status === "completed").length, total: req.length };
}

/** 第 15 步可否按下：1–10 全綠 且 第 14 步已確認 */
export function canFinalConfirm(results: StepResult[]): boolean {
  const { done, total } = progressOf(results);
  const step14 = results.find((r) => r.key === "cancellation_policy");
  return done === total && step14?.status === "completed";
}
