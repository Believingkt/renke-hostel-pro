// 團購模組共用邏輯：訂金／期限計算、訂單信件資料組裝。
// deno-lint-ignore-file no-explicit-any

import type { GroupBuyBankInfo, GroupBuyEmailOrder } from "./groupBuyEmail.ts";

export const GROUP_BUY_ORDER_SOURCE = "group_buy";

/** 依活動設定計算訂金／尾款 */
export function splitDeposit(total: number, depositPercentage: number) {
  const safeTotal = Math.max(0, Math.round(Number(total) || 0));
  const pct = Math.min(100, Math.max(1, Number(depositPercentage) || 30));
  const deposit = pct >= 100 ? safeTotal : Math.min(safeTotal, Math.round((safeTotal * pct) / 100));
  return { total: safeTotal, deposit, balance: Math.max(0, safeTotal - deposit), percentage: pct };
}

/** 建單時間 + 期限時數 */
export function paymentDeadline(createdAtIso: string, hours: number): Date {
  const base = new Date(createdAtIso);
  return new Date(base.getTime() + (Number(hours) || 72) * 3600 * 1000);
}

export function formatTaipei(d: Date): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function nights(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime();
  const b = new Date(`${checkOut}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86400000));
}

export function nightDates(checkIn: string, n: number): string[] {
  const out: string[] = [];
  const [y, m, d] = checkIn.split("-").map(Number);
  for (let i = 0; i < n; i++) {
    out.push(new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + i)).toISOString().split("T")[0]);
  }
  return out;
}

export interface InventoryRow {
  date_value?: string | null;
  date?: string | null;
  available_rooms?: number | null;
  is_blocked?: boolean | null;
  blocked_by_room_name?: string | null;
}

/** 與前台 exclusiveAvailability.verifyAdjustedInventory 相同判定 */
export function verifyInventory(
  rows: InventoryRow[] | null | undefined,
  requiredQuantity: number,
  postBooking = false,
): { ok: boolean; message?: string } {
  for (const row of rows ?? []) {
    if (row?.is_blocked === true) {
      const name = row.blocked_by_room_name || "";
      return {
        ok: false,
        message: name ? `該日期已被「${name}」預訂，無法重複預訂` : "該日期房況已關閉",
      };
    }
  }
  for (const row of rows ?? []) {
    const available = Number(row?.available_rooms ?? 0);
    if (postBooking) {
      if (available < 0) return { ok: false, message: "同時間已被其他訂單佔用（超賣）" };
    } else if (available < requiredQuantity) {
      return { ok: false, message: `該日期僅剩 ${Math.max(0, available)} 間，不足所需 ${requiredQuantity} 間` };
    }
  }
  return { ok: true };
}

export function bankToInfo(row: any): GroupBuyBankInfo | null {
  if (!row) return null;
  return {
    bankName: row.bank_name,
    bankCode: row.bank_code,
    branchName: row.branch_name,
    accountName: row.account_name,
    accountNumber: row.account_number,
    note: row.note,
  };
}

export function buildEmailOrder(params: {
  order: any;
  campaign: any;
  accommodationName?: string | null;
  packageName?: string | null;
  frontendOrigin?: string | null;
}): GroupBuyEmailOrder {
  const { order, campaign } = params;
  const { total, deposit, balance } = splitDeposit(
    Number(order.final_price ?? order.total_price ?? 0),
    campaign?.deposit_percentage ?? 30,
  );
  const deadline = paymentDeadline(
    order.created_at ?? order.order_date ?? new Date().toISOString(),
    campaign?.payment_deadline_hours ?? 72,
  );
  const origin = params.frontendOrigin || "https://booking.lakeze.com";
  return {
    orderNumber: order.order_number,
    guestName: order.guest_name,
    campaignTitle: campaign?.title ?? "團購活動",
    accommodationName: params.accommodationName ?? null,
    packageName: params.packageName ?? null,
    checkInDate: order.check_in_date,
    checkOutDate: order.check_out_date,
    guestCount: order.guest_count,
    totalPrice: total,
    depositAmount: Number(order.deposit_amount) > 0 ? Number(order.deposit_amount) : deposit,
    balanceAmount: balance,
    deadlineText: formatTaipei(deadline),
    orderUrl: `${origin}/g/order/${encodeURIComponent(order.order_number)}`,
  };
}
