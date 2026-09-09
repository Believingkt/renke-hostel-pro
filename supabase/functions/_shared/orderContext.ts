// 共用：所有「系統自動更新 orders」都必須透過 update_order_with_context RPC，
// 以便 zzz_order_change_log trigger 能記錄來源／原因／操作者。
// deno-lint-ignore-file no-explicit-any

export interface OrderChangeContext {
  source: string;
  reason?: string | null;
  actorLabel?: string | null;
  actorType?: "system" | "user";
}

/**
 * 以帶 context 的方式更新單筆訂單。失敗時 throw（由呼叫端決定要不要中斷）。
 */
export async function updateOrderWithContext(
  admin: any,
  orderId: string,
  patch: Record<string, unknown>,
  ctx: OrderChangeContext,
): Promise<void> {
  const { error } = await admin.rpc("update_order_with_context", {
    p_order_id: orderId,
    p_patch: patch,
    p_source: ctx.source,
    p_reason: ctx.reason ?? null,
    p_actor_label: ctx.actorLabel ?? null,
    p_actor_type: ctx.actorType ?? "system",
  });
  if (error) throw new Error(error.message);
}

/** 只保留白名單內的欄位（用於 HotelNabe 這種「整包 payload」的呼叫端）。 */
export const ORDER_CONTEXT_UPDATABLE_FIELDS: readonly string[] = [
  "payment_status", "paid_amount", "refunded_amount", "payment_method",
  "balance_payment_method", "deposit_payment_method",
  "order_status", "cancelled_at", "confirmed_at",
  "refund_status", "refunded_at", "refund_rec_trade_id",
  "deposit_status", "deposit_method", "deposit_charged_amount", "deposit_charged_at",
  "deposit_refunded_amount", "deposit_refunded_at",
  "room_charge_status", "room_charge_scheduled_date",
  "room_charge_at", "room_charge_rec_trade_id", "room_charge_error",
  "notes",
  "room_type_id", "package_id", "check_in_date", "check_out_date", "guest_count",
  "guest_name", "guest_phone", "guest_email",
  "total_price", "final_price", "discount_amount",
  "ota_channel", "owlting_reservation_id", "owlting_unique_id", "owlting_sync_state",
  "hotelnabe_res_id", "hotelnabe_last_modify", "hotelnabe_sync_state",
  "is_pii_pending", "requires_owner_review", "internal_email_sent", "internal_email_sent_at",
];

export function pickUpdatableOrderFields(
  patch: Record<string, unknown>,
): { picked: Record<string, unknown>; dropped: string[] } {
  const picked: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (ORDER_CONTEXT_UPDATABLE_FIELDS.includes(k)) picked[k] = v;
    else dropped.push(k);
  }
  return { picked, dropped };
}
