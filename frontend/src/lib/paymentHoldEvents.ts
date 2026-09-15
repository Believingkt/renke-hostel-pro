// 團購信用卡「付款保留」→ 預定管理月曆顯示事件（純顯示，不參與任何庫存計算）
//
// 庫存 SoT 不變：
//   base     = room_inventory_pricing.available_rooms
//   adjusted = get_adjusted_room_inventory_batch
//   hold 規則 = group_buy_payment_drafts 的 active hold 條件
// 這裡只把 active draft 轉成月曆可畫的顯示事件。

/** 與後端 live hold 規則一致的狀態集合 */
export const ACTIVE_HOLD_STATUSES = ["pending", "payment_processing"] as const;

export interface PaymentHoldDraft {
  id: string;
  room_type_id: string | null;
  room_quantity: number | null;
  check_in_date: string;
  check_out_date: string;
  status: string;
  expires_at: string;
  converted_order_id: string | null;
  guest_name: string | null;
}

export interface PaymentHoldEvent {
  /** 顯示用唯一 id（draftId + 房間序號），非訂單 id */
  id: string;
  draftId: string;
  roomTypeId: string;
  guestName: string;
  check_in_date: string;
  check_out_date: string;
  expiresAt: string;
  /** 第幾間（1-based） */
  index: number;
  /** 本次保留共幾間 */
  total: number;
}

/**
 * active hold 判定：
 *  - converted_order_id IS NULL（已轉單交由正式訂單顯示，避免 double display）
 *  - status ∈ pending / payment_processing（failed / cancelled / expired 不顯示）
 *  - expires_at > now（過期即不顯示）
 */
export function isActiveHold(d: PaymentHoldDraft, now: number = Date.now()): boolean {
  if (d.converted_order_id) return false;
  if (!(ACTIVE_HOLD_STATUSES as readonly string[]).includes(String(d.status))) return false;
  const exp = new Date(d.expires_at).getTime();
  if (!Number.isFinite(exp) || exp <= now) return false;
  return !!d.room_type_id;
}

/** 依 room_quantity 展開成多筆顯示事件（room_quantity = 2 → 2 張卡） */
export function expandPaymentHoldEvents(
  drafts: PaymentHoldDraft[],
  now: number = Date.now(),
): PaymentHoldEvent[] {
  const out: PaymentHoldEvent[] = [];
  for (const d of drafts) {
    if (!isActiveHold(d, now)) continue;
    const total = Math.max(1, Number(d.room_quantity ?? 1));
    for (let i = 0; i < total; i++) {
      out.push({
        id: `${d.id}_${i}`,
        draftId: d.id,
        roomTypeId: String(d.room_type_id),
        guestName: d.guest_name || "旅客",
        check_in_date: d.check_in_date,
        check_out_date: d.check_out_date,
        expiresAt: d.expires_at,
        index: i + 1,
        total,
      });
    }
  }
  return out;
}

/** [check_in, check_out)：退房日不占用 */
export function holdOccupiesDate(e: { check_in_date: string; check_out_date: string }, date: string) {
  return e.check_in_date <= date && e.check_out_date > date;
}

/** 依不重疊原則把事件排入列（與訂單列的排版邏輯一致） */
export function packHoldRows(events: PaymentHoldEvent[]): PaymentHoldEvent[][] {
  const rows: PaymentHoldEvent[][] = [];
  [...events]
    .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date) || a.index - b.index)
    .forEach((e) => {
      const row = rows.find((r) => r[r.length - 1].check_out_date <= e.check_in_date);
      if (row) row.push(e);
      else rows.push([e]);
    });
  return rows;
}

/** 剩餘時間 mm:ss（純顯示；是否仍占房以 DB expires_at 為準） */
export function remainingText(expiresAt: string, now: number = Date.now()) {
  const s = Math.floor((new Date(expiresAt).getTime() - now) / 1000);
  if (s <= 0) return "00:00";
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
