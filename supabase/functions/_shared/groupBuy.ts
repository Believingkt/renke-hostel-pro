// 團購模組共用邏輯：訂金／期限計算、訂單信件資料組裝。
// deno-lint-ignore-file no-explicit-any

import type { GroupBuyAtmInfo, GroupBuyBankInfo, GroupBuyEmailOrder } from "./groupBuyEmail.ts";
import { resolveCancellationPolicy } from "./cancellationPolicy.ts";
import { isCardPaidOrder } from "./orderRefund.ts";


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
  // 取消政策依「訂單實際付款制度」判定，不得依活動當下設定或金額反推
  const policy = resolveCancellationPolicy({
    order_source: order.order_source ?? GROUP_BUY_ORDER_SOURCE,
    payment_provider: order.payment_provider ?? null,
    payment_method: order.payment_method ?? null,
    deposit_payment_method: order.deposit_payment_method ?? null,
    balance_payment_method: order.balance_payment_method ?? null,
    room_charge_status: order.room_charge_status ?? null,
    paid_amount: Number(order.paid_amount ?? 0),
    final_price: Number(order.final_price ?? order.total_price ?? 0),
  }).policy;

  /**
   * Email 付款方式 SoT：與 server 退款分流同一份規則
   * （payment_provider = tappay 且 isCardPaidOrder）。ATM 不會被判為信用卡。
   */
  const isCardOrder = order.payment_provider === "tappay" && isCardPaidOrder(order);
  const paidAmount = Math.max(0, Math.round(Number(order.paid_amount ?? 0)));
  const fullPrepayment = isCardOrder && policy === "full_prepayment";

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
    paidAmount,
    // 原付款方式（非退款方式）：ATM 與銀行匯款皆為 manual provider，必須依 payment_method 分流
    paymentMethodText: isCardOrder
      ? "信用卡（3D 驗證）"
      : [order.balance_payment_method, order.payment_method, order.deposit_payment_method].some(
            (m) => typeof m === "string" && ["atm", "ATM", "atm_transfer", "atm_vacc"].includes(m),
          )
        ? "ATM 虛擬帳號"
        : "銀行匯款",
    // 退款管道與原付款方式分開輸出，不得反向覆蓋
    refundChannelText: isCardOrder ? "原信用卡退刷（TapPay）" : "人工匯款退款",
    isCardOrder,
    fullPrepayment,
    deadlineText: formatTaipei(deadline),
    orderUrl: `${origin}/g/order/${encodeURIComponent(order.order_number)}`,
    cancellationPolicy: policy,
  };
}



/** 後台 canonical 網域：2026-10 起前台與後台同在 booking.lakeze.com（/admin 為後台路徑） */
export const PMS_ADMIN_ORIGIN = "https://booking.lakeze.com";

/**
 * 後台團購訂單對帳深連結：直接定位到該活動的「訂單對帳」分頁並標示該筆訂單。
 * 注意：一律使用 PMS_ADMIN_ORIGIN，不可用旅客端傳入的 origin（可能是預覽或其他網域）。
 */
export function buildAdminGroupBuyUrl(params: {
  accommodationId?: string | null;
  campaignId?: string | null;
  orderNumber?: string | null;
}): string {
  const qs = new URLSearchParams({ tab: "orders" });
  if (params.accommodationId) qs.set("accId", params.accommodationId);
  if (params.campaignId) qs.set("campaignId", params.campaignId);
  if (params.orderNumber) qs.set("orderNumber", params.orderNumber);
  return `${PMS_ADMIN_ORIGIN}/admin/group-buy?${qs.toString()}`;
}

/**
 * 團購通知信「付款資訊」單一判定來源。
 *
 * 判定 SoT＝訂單本身（payment_provider / payment_method / atm_vacc_no），
 * 活動層 enable_bank_transfer 只作保險絲：活動未開放銀行匯款時，一律不塞共用帳號。
 * - channel="atm"        → 回傳該筆訂單的 TapPay 虛擬帳號（未配發則 atm=null，信件走 fallback 文案）
 * - channel="credit_card"→ 全額預收，無匯款資訊
 * - channel="bank"       → 才查 group_buy_bank_accounts 共用帳號
 */
export async function resolveGroupBuyPaymentDisplay(
  admin: any,
  order: any,
  campaignId: string | null | undefined,
): Promise<{
  channel: "atm" | "credit_card" | "bank";
  bank: GroupBuyBankInfo | null;
  atm: GroupBuyAtmInfo | null;
}> {
  const isCardOrder = order?.payment_provider === "tappay" && isCardPaidOrder(order);
  const paymentMethodRaw = String(order?.payment_method ?? "");
  const isAtmOrder = paymentMethodRaw === "atm" || !!order?.atm_vacc_no;
  const channel: "atm" | "credit_card" | "bank" = isCardOrder
    ? "credit_card"
    : isAtmOrder
    ? "atm"
    : "bank";

  if (channel === "credit_card") return { channel, bank: null, atm: null };

  if (channel === "atm") {
    const vaccNo = String(order?.atm_vacc_no ?? "").trim();
    return {
      channel,
      bank: null,
      atm: vaccNo
        ? {
          bankCode: order?.atm_vacc_bank_code ?? null,
          vaccNo,
          expireText: order?.atm_expire_at ? formatTaipei(new Date(order.atm_expire_at)) : null,
          amount: Number(order?.deposit_amount ?? 0) > 0 ? Math.round(Number(order.deposit_amount)) : null,
        }
        : null,
    };
  }

  if (!campaignId) return { channel, bank: null, atm: null };

  const { data: campaign } = await admin
    .from("group_buy_campaigns")
    .select("id, enable_bank_transfer")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaign && campaign.enable_bank_transfer === false) {
    return { channel, bank: null, atm: null };
  }

  const { data: bankRow } = await admin
    .from("group_buy_bank_accounts")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return { channel, bank: bankToInfo(bankRow), atm: null };
}
