// 2b：OTA 修改信只改差異 — 純函式（比對、產生明細、fail-closed、告警文字、先後判斷）
export interface ExistingRoom {
  id: string; room_type_id: string; quantity: number; room_price: number;
  room_unit_id: string | null; template_id: string | null; template_name: string | null;
}
export interface UnitLite { id: string; unit_number: string }
export interface PlanOrder {
  id: string; room_type_id: string | null; check_in_date: string; check_out_date: string;
  guest_count: number; total_price: number; payment_status: string; order_status: string;
}
export interface PlanMail {
  check_in_date: string | null; check_out_date: string | null; room_type_name: string | null;
  room_quantity: number | null; guest_count: number | null; total_amount: number | null;
  parser_diff_status: string | null;
}
export type BlockCode =
  | "multiple_active_orders" | "order_checked_in" | "order_checked_out" | "no_existing_rooms"
  | "multi_room_type_rows" | "non_unit_quantity_rows" | "order_room_type_mismatch"
  | "room_type_unmatched" | "room_type_ambiguous" | "unreliable_diff" | "stale_check_failed"
  | "quantity_out_of_range";
export interface DiffItem { field: string; label: string; before: string | number | null; after: string | number | null }
export type RoomsChange = "none" | "keep" | "resize" | "replace";
export interface Target { roomTypeId: string; qty: number; checkIn: string; checkOut: string }
export type Plan =
  | { kind: "blocked"; code: BlockCode }
  | { kind: "noop" }
  | { kind: "apply"; patch: Record<string, unknown>; diff: DiffItem[]; target: Target;
      roomsChange: RoomsChange; mailTotal: number | null; amountNeedsReview: boolean };
// sync_order_rooms_v1 回傳的 conflicts 元素（2b-1 本機實測欄位）
export interface OtaConflict {
  order_room_id: string; room_type_id: string; room_unit_id: string; reason: string; conflict_order_number: string;
}

export const MAX_OTA_ROOMS = 20;
const UNRELIABLE = new Set([null, "partial", "no_sections", "unparsable"]);
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toLowerCase();

// 同館房型比對：① 去空白小寫後完全相同 ② 否則「信件名稱剛好是唯一一個房型名稱的開頭」；不使用「包含」
export function matchRoomTypeForModification(
  roomTypes: { id: string; name: string }[],
  mailName: string,
): { ok: true; id: string } | { ok: false; code: "room_type_unmatched" | "room_type_ambiguous" } {
  const target = norm(mailName);
  if (!target) return { ok: false, code: "room_type_unmatched" };
  const exact = roomTypes.filter((t) => norm(t.name) === target);
  if (exact.length === 1) return { ok: true, id: exact[0].id };
  if (exact.length > 1) return { ok: false, code: "room_type_ambiguous" };
  const prefix = roomTypes.filter((t) => norm(t.name).startsWith(target));
  if (prefix.length === 1) return { ok: true, id: prefix[0].id };
  return { ok: false, code: prefix.length > 1 ? "room_type_ambiguous" : "room_type_unmatched" };
}

export function planOtaModification(i: {
  activeOrderCount: number; order: PlanOrder; rows: ExistingRoom[];
  roomTypes: { id: string; name: string }[]; mail: PlanMail;
}): Plan {
  const { order, rows, mail } = i;
  if (i.activeOrderCount > 1) return { kind: "blocked", code: "multiple_active_orders" };
  if (order.order_status === "checked_in") return { kind: "blocked", code: "order_checked_in" };
  if (order.order_status === "checked_out") return { kind: "blocked", code: "order_checked_out" };
  if (rows.length === 0) return { kind: "blocked", code: "no_existing_rooms" };
  if (new Set(rows.map((r) => r.room_type_id)).size > 1) return { kind: "blocked", code: "multi_room_type_rows" };
  if (rows.some((r) => r.quantity !== 1)) return { kind: "blocked", code: "non_unit_quantity_rows" };
  const curType = rows[0].room_type_id;
  if (order.room_type_id && order.room_type_id !== curType) return { kind: "blocked", code: "order_room_type_mismatch" };

  let targetType = curType;
  if (mail.room_type_name) {
    const m = matchRoomTypeForModification(i.roomTypes, mail.room_type_name);
    if (!m.ok) return { kind: "blocked", code: m.code };
    targetType = m.id;
  }
  const checkIn = mail.check_in_date ?? order.check_in_date;
  const checkOut = mail.check_out_date ?? order.check_out_date;
  const mq = Number(mail.room_quantity ?? 0);
  if (mq > MAX_OTA_ROOMS) return { kind: "blocked", code: "quantity_out_of_range" };
  const qty = mq > 0 ? mq : rows.length;
  const datesChanged = checkIn !== order.check_in_date || checkOut !== order.check_out_date;
  const typeChanged = targetType !== curType;
  const qtyChanged = qty !== rows.length;
  if ((datesChanged || typeChanged || qtyChanged) && UNRELIABLE.has(mail.parser_diff_status)) {
    return { kind: "blocked", code: "unreliable_diff" };
  }

  const patch: Record<string, unknown> = {};
  const diff: DiffItem[] = [];
  const push = (field: string, label: string, before: any, after: any) => diff.push({ field, label, before, after });
  if (checkIn !== order.check_in_date) { patch.check_in_date = checkIn; push("check_in_date", "入住日期", order.check_in_date, checkIn); }
  if (checkOut !== order.check_out_date) { patch.check_out_date = checkOut; push("check_out_date", "退房日期", order.check_out_date, checkOut); }
  const gc = Number(mail.guest_count ?? 0);
  if (gc > 0 && gc !== Number(order.guest_count)) { patch.guest_count = gc; push("guest_count", "人數", order.guest_count, gc); }
  if (typeChanged) {
    patch.room_type_id = targetType;
    const name = i.roomTypes.find((t) => t.id === targetType)?.name ?? targetType;
    push("room_type_id", "房型", curType, `${name}(${targetType})`);
  }
  if (qtyChanged) push("room_quantity", "房間數", rows.length, qty);
  const raw = Number(mail.total_amount);
  const mailTotal = mail.total_amount != null && Number.isFinite(raw) && Math.round(raw) > 0 ? Math.round(raw) : null;
  if (mailTotal != null && mailTotal !== Number(order.total_price)) {
    patch.total_price = mailTotal;
    patch.final_price = mailTotal;
    if (order.payment_status === "paid") patch.paid_amount = mailTotal;
    push("total_price", "金額", Number(order.total_price ?? 0), mailTotal);
  }
  if (diff.length === 0) return { kind: "noop" };
  const roomsChange: RoomsChange = typeChanged ? "replace" : qtyChanged ? "resize" : datesChanged ? "keep" : "none";
  return {
    kind: "apply", patch, diff, target: { roomTypeId: targetType, qty, checkIn, checkOut },
    roomsChange, mailTotal, amountNeedsReview: (typeChanged || qtyChanged) && mailTotal == null,
  };
}

export interface SyncRow {
  id: string | null; room_type_id: string; quantity: 1; room_price: number;
  room_unit_id: string | null; template_id: string | null; template_name: string | null;
}
const toRow = (r: ExistingRoom): SyncRow => ({
  id: r.id, room_type_id: r.room_type_id, quantity: 1, room_price: r.room_price,
  room_unit_id: r.room_unit_id, template_id: r.template_id, template_name: r.template_name,
});
const avgPrice = (rows: ExistingRoom[]) => Math.round(rows.reduce((s, r) => s + Number(r.room_price ?? 0), 0) / rows.length);

// units：目標房型啟用中的房號（已依 display_order、unit_number 排序）；busy：新日期被其他訂單佔用的房號
export function buildOtaRooms(i: {
  plan: Extract<Plan, { kind: "apply" }>; rows: ExistingRoom[]; units: UnitLite[]; busy: Set<string>;
  newTemplate: { template_id: string | null; template_name: string | null };
}): SyncRow[] {
  const { plan, rows, units, busy } = i;
  const pick = (taken: Set<string>) => {
    const u = units.find((x) => !busy.has(x.id) && !taken.has(x.id));
    if (u) taken.add(u.id);
    return u?.id ?? null;
  };
  if (plan.roomsChange === "keep") return rows.map(toRow);
  if (plan.roomsChange === "replace") {
    const price = plan.mailTotal != null ? Math.round(plan.mailTotal / plan.target.qty) : avgPrice(rows);
    const taken = new Set<string>();
    return Array.from({ length: plan.target.qty }, () => ({
      id: null, room_type_id: plan.target.roomTypeId, quantity: 1 as const, room_price: price,
      room_unit_id: pick(taken), ...i.newTemplate,
    }));
  }
  // resize
  if (plan.target.qty > rows.length) {
    const taken = new Set(rows.map((r) => r.room_unit_id).filter((x): x is string => !!x));
    const price = avgPrice(rows);
    const extra = Array.from({ length: plan.target.qty - rows.length }, () => ({
      id: null, room_type_id: rows[0].room_type_id, quantity: 1 as const, room_price: price,
      room_unit_id: pick(taken), template_id: rows[0].template_id, template_name: rows[0].template_name,
    }));
    return [...rows.map(toRow), ...extra];
  }
  const rank = (r: ExistingRoom) => (r.room_unit_id ? units.findIndex((u) => u.id === r.room_unit_id) : Number.MAX_SAFE_INTEGER);
  // 刪除順序：無房號者優先，其次房號排序最後一間；保留其餘
  const removeOrder = [...rows].sort((a, b) => rank(b) - rank(a));
  const removeIds = new Set(removeOrder.slice(0, rows.length - plan.target.qty).map((r) => r.id));
  return rows.filter((r) => !removeIds.has(r.id)).map(toRow);
}

export function classifyApplyError(msg: string, code?: string | null): string {
  if (/Inventory exceeded|Room not available/i.test(msg)) return "inventory_exceeded";
  if (/備品/.test(msg)) return "amenity_exceeded";
  if (code === "23505" || /重複寫入保護|重複送出/.test(msg)) return "double_submit";
  if (/ORDER_CHANGED/.test(msg)) return "order_changed";
  return "unknown";
}

export function formatNotApplied(i: {
  code: string; obe: string | null; orderNumber: string | null; mailChanges: string | null; diff: DiffItem[];
}): string {
  const changes = i.mailChanges || i.diff.map((d) => `${d.label}：${d.before ?? "—"} → ${d.after ?? "—"}`).join("；") || "（無法取得）";
  return `未套用，需人工處理｜原因代碼：${i.code}｜OBE：${i.obe ?? "—"}｜訂單：${i.orderNumber ?? "—"}｜信件修改內容：${changes}`;
}

export function formatRoomWarnings(i: {
  orderNumber: string; conflicts: OtaConflict[];
  newRowsWithoutUnit: { room_type_id: string }[]; typeName: (id: string) => string; unitNo: (id: string) => string;
  amountNeedsReview: boolean;
}): string | null {
  const items = [
    ...i.conflicts.map((c) => `${i.typeName(c.room_type_id)}（原指定 ${i.unitNo(c.room_unit_id)}，已被 ${c.conflict_order_number} 佔用）`),
    ...i.newRowsWithoutUnit.map((r) => `${i.typeName(r.room_type_id)}（無空房號）`),
  ];
  const parts: string[] = [];
  if (items.length) parts.push(`訂單 ${i.orderNumber} 已更新，但以下 ${items.length} 間未分配房號，請到訂單詳情手動安排：${items.join("、")}`);
  if (i.amountNeedsReview) parts.push(`訂單 ${i.orderNumber} 間數或房型已變更，但信件金額為 0 或空白，總金額未更新，請人工核對`);
  return parts.length ? parts.join("\n") : null;
}

// 只取「行首」的 Date 標頭，避開 DKIM 簽章 h= 清單裡的 Date:
export function parseMailSentAt(headers: unknown): string | null {
  if (typeof headers !== "string") return null;
  const m = headers.match(/^Date:[ \t]*([^\r\n]+)/im);
  if (!m) return null;
  const t = Date.parse(m[1].trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

type MailTime = { mail_sent_at: string | null; received_at: string };
// 兩邊都有 mail_sent_at 就比它，否則比 received_at；對方「嚴格較新」才算本封是舊信
export function isStaleMail(self: MailTime, others: MailTime[]): boolean {
  return others.some((o) => {
    const useSent = self.mail_sent_at && o.mail_sent_at;
    const a = Date.parse(useSent ? self.mail_sent_at! : self.received_at);
    const b = Date.parse(useSent ? o.mail_sent_at! : o.received_at);
    return b > a;
  });
}
