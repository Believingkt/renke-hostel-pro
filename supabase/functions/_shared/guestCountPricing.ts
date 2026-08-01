// 會員自助變更入住人數時的價格重算工具。
// 規則：人數對應「訂房入住方案」(accommodation_packages.guest_count)，
// 換人數等同換方案 → 需重新以每晚 tier 價（含單日指定價覆寫）計算房費。
// 若找不到對應方案（非方案型訂單），回傳 needsManualReview，交由客服處理。

export type GuestCountQuote = {
  /** 是否能自動算出新價格 */
  canAutoPrice: boolean;
  needsManualReview: boolean;
  reason?: string;
  nights: number;
  currentGuestCount: number;
  newGuestCount: number;
  currentPackageId: string | null;
  currentPackageName: string | null;
  newPackageId: string | null;
  newPackageName: string | null;
  /** 目前訂單房費（orders.total_price） */
  currentRoomTotal: number;
  /** 依新人數重算後的房費 */
  newRoomTotal: number;
  /** 房費差額：> 0 需補差額，< 0 需退差額 */
  diff: number;
  /** 重算後訂單應付總額（房費 − 折扣 + 其他既有加價） */
  newFinalPrice: number;
  currentFinalPrice: number;
  paidAmount: number;
  /** 重算後仍需支付的金額（含尚未付清的尾款） */
  newOutstanding: number;
};

type Client = {
  from: (t: string) => any;
};

function enumerateNights(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const start = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function tierOf(date: string, holidaySet: Set<string>): "weekday" | "friday_sunday" | "weekend" {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (holidaySet.has(date) || day === 6) return "weekend";
  if (day === 5 || day === 0) return "friday_sunday";
  return "weekday";
}

/** 依每晚 tier 價（單日指定價 > tier 價 > 方案預設價）計算方案房費總額 */
export async function computePackageRoomTotal(
  supabase: Client,
  pkg: { id: string; sale_price: number; tier_prices: Record<string, any> | null },
  accommodationId: string,
  dates: string[],
): Promise<number> {
  const [{ data: holidayRows }, { data: overrideRows }] = await Promise.all([
    supabase
      .from("public_holidays")
      .select("holiday_date")
      .eq("accommodation_id", accommodationId)
      .in("holiday_type", ["holiday", "compensatory_day_off"]),
    supabase
      .from("package_date_prices")
      .select("date, sale_price")
      .eq("package_id", pkg.id)
      .in("date", dates),
  ]);

  const holidaySet = new Set(((holidayRows || []) as any[]).map((h) => h.holiday_date));
  const overrideMap = new Map<string, number>();
  for (const r of (overrideRows || []) as any[]) overrideMap.set(r.date, Number(r.sale_price));

  let total = 0;
  for (const date of dates) {
    const ov = overrideMap.get(date);
    if (ov != null) {
      total += ov;
      continue;
    }
    const tierSale = (pkg.tier_prices || {})?.[tierOf(date, holidaySet)]?.sale;
    total += tierSale != null ? Number(tierSale) : Number(pkg.sale_price || 0);
  }
  return Math.round(total);
}

export interface OrderForQuote {
  id: string;
  accommodation_id: string;
  package_id?: string | null;
  guest_count: number;
  check_in_date: string;
  check_out_date: string;
  total_price: number;
  final_price: number;
  discount_amount?: number | null;
  paid_amount?: number | null;
}

/** 試算「改人數」後的價格差額 */
export async function quoteGuestCountChange(
  supabase: Client,
  order: OrderForQuote,
  newGuestCount: number,
): Promise<GuestCountQuote> {
  const dates = enumerateNights(order.check_in_date, order.check_out_date);
  const currentRoomTotal = Number(order.total_price || 0);
  const currentFinalPrice = Number(order.final_price || 0);
  const paidAmount = Number(order.paid_amount || 0);
  /** final_price 與 total_price 的固定差額（折扣、加購等） */
  const priceOffset = currentFinalPrice - currentRoomTotal;

  const base: GuestCountQuote = {
    canAutoPrice: false,
    needsManualReview: true,
    nights: dates.length,
    currentGuestCount: Number(order.guest_count || 0),
    newGuestCount,
    currentPackageId: order.package_id ?? null,
    currentPackageName: null,
    newPackageId: null,
    newPackageName: null,
    currentRoomTotal,
    newRoomTotal: currentRoomTotal,
    diff: 0,
    newFinalPrice: currentFinalPrice,
    currentFinalPrice,
    paidAmount,
    newOutstanding: Math.max(0, currentFinalPrice - paidAmount),
  };

  const { data: packages } = await supabase
    .from("accommodation_packages")
    .select("id, name, guest_count, guest_count_max, sale_price, tier_prices, enabled")
    .eq("accommodation_id", order.accommodation_id)
    .eq("enabled", true);

  const list = (packages || []) as any[];
  const current = list.find((p) => p.id === order.package_id) || null;
  base.currentPackageName = current?.name ?? null;

  if (!order.package_id || !current) {
    return {
      ...base,
      reason: "此訂單非方案型計價，變更人數後的金額需由客服重新確認。",
    };
  }

  const target =
    list.find((p) => Number(p.guest_count) === newGuestCount) ||
    list.find(
      (p) =>
        Number(p.guest_count) <= newGuestCount &&
        p.guest_count_max != null &&
        Number(p.guest_count_max) >= newGuestCount,
    ) ||
    null;

  if (!target) {
    return {
      ...base,
      reason: `目前沒有對應 ${newGuestCount} 人的訂房方案，請聯繫客服協助調整。`,
    };
  }

  const newRoomTotal = await computePackageRoomTotal(
    supabase,
    target,
    order.accommodation_id,
    dates,
  );
  const newFinalPrice = Math.max(0, Math.round(newRoomTotal + priceOffset));

  return {
    ...base,
    canAutoPrice: true,
    needsManualReview: false,
    newPackageId: target.id,
    newPackageName: target.name,
    newRoomTotal,
    diff: newRoomTotal - currentRoomTotal,
    newFinalPrice,
    newOutstanding: Math.max(0, newFinalPrice - paidAmount),
  };
}
