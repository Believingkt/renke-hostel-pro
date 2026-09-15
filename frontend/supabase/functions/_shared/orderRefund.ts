// 訂單取消時的信用卡自動退刷共用邏輯。
// 適用：信用卡（立即請款 / 綁卡入住日請款）已成功扣款的訂單。
// 不適用：ATM 虛擬帳號、現金、銀行轉帳 → 一律維持人工退款流程。

import { refundTapPay } from "./tappay.ts";
import { isCardPaidOrderRule } from "./cardPaymentRule.ts";

export interface RefundableOrder {
  id: string;
  accommodation_id: string;
  order_number: string;
  notes?: string | null;
  paid_amount?: number | null;
  payment_method?: string | null;
  deposit_payment_method?: string | null;
  balance_payment_method?: string | null;
  room_charge_rec_trade_id?: string | null;
  /** 上一次退款時記錄的「原始」交易編號（buildRefundPatch 寫入），可供 TapPay Query 對帳 */
  refund_rec_trade_id?: string | null;
  atm_rec_trade_id?: string | null;
}


/** 這張訂單是否以信用卡收款（ATM／現金／轉帳一律回 false）
 *  規則本體在 ./cardPaymentRule.ts，前後端共用同一份實作。 */
export function isCardPaidOrder(order: RefundableOrder): boolean {
  return isCardPaidOrderRule(order);
}

/** 從 notes 解析 rec_trade_id（相容多種歷史寫法） */
export function extractRecTradeIdFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const direct = [...notes.matchAll(/rec_trade_id[:：\s]+([A-Za-z0-9_\-]+)/gi)];
  if (direct.length > 0) return direct[direct.length - 1][1];
  // [TapPay 交易: XXX] / TapPay 3DS 交易：XXX
  const legacy = [...notes.matchAll(/TapPay(?:\s*3DS)?\s*交易[:：]\s*([A-Za-z0-9_\-]+)/g)];
  if (legacy.length > 0) return legacy[legacy.length - 1][1];
  return null;
}

/**
 * 找出可退刷的 TapPay 交易編號。
 * 順序：orders.room_charge_rec_trade_id → deposit_charges 最新成功扣款 → notes 解析。
 * ATM 訂單一律回 null（銀行轉帳無法自動退）。
 */
export async function resolveCardRecTradeId(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  order: RefundableOrder,
): Promise<string | null> {
  if (!isCardPaidOrder(order)) return null;
  if (order.room_charge_rec_trade_id) return order.room_charge_rec_trade_id;

  const { data: charge } = await supabase
    .from("deposit_charges")
    .select("rec_trade_id")
    .eq("order_id", order.id)
    .in("action", ["charge", "deposit", "room_charge", "balance"])
    .eq("status", "success")
    .not("rec_trade_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (charge?.rec_trade_id) return charge.rec_trade_id;

  const fromNotes = extractRecTradeIdFromNotes(order.notes);
  if (fromNotes && fromNotes !== order.atm_rec_trade_id) return fromNotes;
  return null;
}

export type SyncRecTradeSource =
  | "refund_rec_trade_id"
  | "room_charge_rec_trade_id"
  | "deposit_charges"
  | "notes";

export interface SyncRecTradeResolution {
  recTradeId: string | null;
  source: SyncRecTradeSource | null;
  /** 找不到（或非信用卡）時的原因碼；呼叫端必須改走人工確認 */
  reason?: "not_card" | "no_rec_trade_id";
}

/**
 * TapPay 對帳（Query / reconciliation）用的原始交易編號解析。
 * 優先序：orders.refund_rec_trade_id → orders.room_charge_rec_trade_id
 *        → deposit_charges 最新成功扣款 → orders.notes（legacy fallback）
 *
 * 注意：
 *  - ATM／銀行轉帳／現金一律回 not_card，不得進入信用卡對帳流程。
 *  - 找不到時回 null，呼叫端必須標記人工確認，嚴禁猜測交易編號。
 *  - 本函式只做「查詢」用途，不會觸發任何 Refund API。
 */
export async function resolveSyncRecTradeId(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  order: RefundableOrder,
): Promise<SyncRecTradeResolution> {
  if (!isCardPaidOrder(order)) return { recTradeId: null, source: null, reason: "not_card" };

  // refund_rec_trade_id 記錄的是退款時使用的「原始」交易編號，可直接供 Query 使用
  if (order.refund_rec_trade_id && order.refund_rec_trade_id !== order.atm_rec_trade_id) {
    return { recTradeId: order.refund_rec_trade_id, source: "refund_rec_trade_id" };
  }
  if (order.room_charge_rec_trade_id) {
    return { recTradeId: order.room_charge_rec_trade_id, source: "room_charge_rec_trade_id" };
  }

  const { data: charge } = await supabase
    .from("deposit_charges")
    .select("rec_trade_id")
    .eq("order_id", order.id)
    .in("action", ["charge", "deposit", "room_charge", "balance"])
    .eq("status", "success")
    .not("rec_trade_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (charge?.rec_trade_id) return { recTradeId: charge.rec_trade_id, source: "deposit_charges" };

  const fromNotes = extractRecTradeIdFromNotes(order.notes);
  if (fromNotes && fromNotes !== order.atm_rec_trade_id) {
    return { recTradeId: fromNotes, source: "notes" };
  }
  return { recTradeId: null, source: null, reason: "no_rec_trade_id" };
}


export interface RefundOutcome {
  /** 是否實際呼叫了 TapPay */
  attempted: boolean;
  success: boolean;
  refunded: number;
  recTradeId: string | null;
  status?: number;
  msg?: string;
  /** 未能自動退款的原因 */
  reason?: "not_card" | "no_rec_trade_id" | "no_partner_key" | "zero_amount" | "tappay_error";
  /** true = 網路／timeout 等未知結果：禁止重試，必須以 tappay-sync-refund 對帳回正 */
  networkError?: boolean;
  note: string;
}

/**
 * 執行退刷並寫入 deposit_charges 稽核列。呼叫端負責更新 orders。
 */
export async function refundOrderCard(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  order: RefundableOrder,
  amount: number,
  triggerSource: string,
  /** 呼叫端已先行解析／驗證過的原付款交易編號（例如團購退款前置 Query），避免重複解析出不同結果 */
  opts?: { recTradeId?: string | null },
): Promise<RefundOutcome> {
  const refundAmount = Math.max(0, Math.round(amount || 0));
  if (refundAmount <= 0) {
    return {
      attempted: false,
      success: false,
      refunded: 0,
      recTradeId: null,
      reason: "zero_amount",
      note: "依取消政策不予退款",
    };
  }

  if (!isCardPaidOrder(order)) {
    return {
      attempted: false,
      success: false,
      refunded: 0,
      recTradeId: null,
      reason: "not_card",
      note: `應退款 NT$${refundAmount.toLocaleString()}，付款方式非信用卡（無法自動退），待人工退款`,
    };
  }

  const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
  if (!partnerKey) {
    return {
      attempted: false,
      success: false,
      refunded: 0,
      recTradeId: null,
      reason: "no_partner_key",
      note: `應退款 NT$${refundAmount.toLocaleString()}，TapPay 設定缺失，待人工退款`,
    };
  }

  const recTradeId = opts?.recTradeId ?? (await resolveCardRecTradeId(supabase, order));
  if (!recTradeId) {
    await supabase.from("deposit_charges").insert({
      order_id: order.id,
      accommodation_id: order.accommodation_id,
      action: "refund",
      amount: refundAmount,
      status: "failed",
      trigger_source: triggerSource,
      needs_manual_review: true,
      error_message: "無可退刷交易編號，需人工退款",
    });
    return {
      attempted: false,
      success: false,
      refunded: 0,
      recTradeId: null,
      reason: "no_rec_trade_id",
      note: `應退款 NT$${refundAmount.toLocaleString()}，查無可退刷交易編號，待人工退款`,
    };
  }

  const r = await refundTapPay(partnerKey, recTradeId, refundAmount);
  await supabase.from("deposit_charges").insert({
    order_id: order.id,
    accommodation_id: order.accommodation_id,
    action: "refund",
    amount: refundAmount,
    status: r.success ? "success" : "failed",
    trigger_source: triggerSource,
    rec_trade_id: recTradeId,
    webhook_status: r.success ? "pending" : "failed",
    needs_manual_review: !r.success,
    error_message: r.success ? null : (r.msg || `TapPay error ${r.status}`),
  });

  if (r.success) {
    return {
      attempted: true,
      success: true,
      refunded: refundAmount,
      recTradeId,
      status: r.status,
      msg: r.msg,
      note: `已自動退刷 NT$${refundAmount.toLocaleString()}（TapPay ${recTradeId}）`,
    };
  }

  return {
    attempted: true,
    success: false,
    refunded: 0,
    recTradeId,
    status: r.status,
    msg: r.msg,
    reason: "tappay_error",
    networkError: r.networkError,
    note:
      `自動退刷失敗（${r.msg || r.status}），應退 NT$${refundAmount.toLocaleString()}（rec_trade_id: ${recTradeId}），待人工處理`,
  };
}

/** 退款結果要寫回 orders 的欄位 */
export function buildRefundPatch(
  outcome: RefundOutcome,
  paidAmount: number,
): Record<string, unknown> {
  if (outcome.success) {
    const remaining = Math.max(0, Math.round(paidAmount) - outcome.refunded);
    return {
      refunded_amount: outcome.refunded,
      refund_rec_trade_id: outcome.recTradeId,
      refunded_at: new Date().toISOString(),
      refund_status: remaining > 0 ? "partial_refunded" : "refunded",
    };
  }
  if (outcome.reason === "zero_amount") {
    return { refund_status: "none" };
  }
  return {
    refund_rec_trade_id: outcome.recTradeId,
    refund_status: outcome.reason === "tappay_error" ? "failed" : "pending_manual",
  };
}

/** 退款失敗 → 建立客服待辦 + 後台通知，不可默默吞掉 */
export async function flagRefundNeedsManual(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  order: RefundableOrder,
  amount: number,
  outcome: RefundOutcome,
): Promise<void> {
  try {
    const title = "退款待處理：自動退刷未完成";
    const description =
      `訂單 ${order.order_number} 取消後應退 NT$${Math.round(amount).toLocaleString()}，` +
      `自動退刷未完成（${outcome.msg || outcome.reason || "unknown"}），請至 TapPay 後台或以人工方式退款。`;

    const { data: existingTask } = await supabase
      .from("order_manual_review_tasks")
      .select("id")
      .eq("order_id", order.id)
      .eq("task_type", "refund_failed")
      .in("status", ["pending", "in_progress"])
      .maybeSingle();

    if (!existingTask?.id) {
      await supabase.from("order_manual_review_tasks").insert({
        order_id: order.id,
        accommodation_id: order.accommodation_id,
        task_type: "refund_failed",
        reason_code: outcome.reason ?? "refund_failed",
        quote_snapshot: {
          refund_amount: Math.round(amount),
          rec_trade_id: outcome.recTradeId,
          tappay_status: outcome.status ?? null,
          tappay_msg: outcome.msg ?? null,
        },
        requester_note: description,
        status: "pending",
      });
    }

    const { data: existingNotif } = await supabase
      .from("notifications")
      .select("id")
      .eq("order_id", order.id)
      .eq("type", "refund_failed")
      .maybeSingle();
    const notifPayload = {
      accommodation_id: order.accommodation_id,
      order_id: order.id,
      type: "refund_failed",
      title,
      description,
      is_read: false,
    };
    if (existingNotif?.id) {
      await supabase.from("notifications").update(notifPayload).eq("id", existingNotif.id);
    } else {
      await supabase.from("notifications").insert(notifPayload);
    }
  } catch (e) {
    console.error("[orderRefund] flagRefundNeedsManual failed", e);
  }
}
