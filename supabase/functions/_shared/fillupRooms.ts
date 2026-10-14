// 補單房型明細：以 sync_order_rooms_v1 在單一交易內寫入全部列；失敗時一律保留訂單、不刪除
import { reportBackendError } from "./errorReporter.ts";
import { sendOrderRoomsAlertEmail } from "./orderRoomsAlert.ts";

export interface FillupAssignment { room_type_id: string; room_unit_id: string | null }
export interface FillupRow {
  id: null; room_type_id: string; quantity: 1; room_price: number;
  room_unit_id: string | null; template_id: null; template_name: null;
}
export interface UnassignedRoom { room_type_id: string; requested_unit: string | null; reason: "occupied" | "no_free_unit" }

// 沒有房號的列，依 display_order 挑選第一個未佔用、未被本次選走的房號（與原 Pass 2 相同規則）
export function pickFillupRows(
  assignments: FillupAssignment[],
  unitCache: Map<string, { id: string; unit_number: string }[]>,
  busyCache: Map<string, Set<string>>,
  pickedByType: Map<string, Set<string>>,
  perRoomPrice: number,
): FillupRow[] {
  return assignments.map((a) => {
    let unit = a.room_unit_id;
    if (!unit) {
      const units = unitCache.get(a.room_type_id) ?? [];
      const busy = busyCache.get(a.room_type_id) ?? new Set<string>();
      const picked = pickedByType.get(a.room_type_id) ?? new Set<string>();
      const free = units.find((u) => !busy.has(u.id) && !picked.has(u.id));
      if (free) {
        unit = free.id;
        picked.add(free.id);
        pickedByType.set(a.room_type_id, picked);
      }
    }
    return { id: null, room_type_id: a.room_type_id, quantity: 1, room_price: perRoomPrice, room_unit_id: unit, template_id: null, template_name: null };
  });
}

export type FillupRoomsResult =
  | { ok: true; unassigned: UnassignedRoom[] }
  | { ok: false; status: 500; body: { ok: false; code: "ROOMS_WRITE_FAILED"; case: "1a" | "1b"; error: string; order_number: string } };

export interface FillupRoomsDeps {
  reportError?: typeof reportBackendError;
  sendAlert?: typeof sendOrderRoomsAlertEmail;
}

export async function writeFillupRooms(admin: any, ctx: {
  orderId: string; orderNumber: string; updatedExisting: boolean; rows: FillupRow[];
  stagingId: string; obeNumber: string | null; accommodationId: string | null;
  unitNumberById: Map<string, string>;
}, deps: FillupRoomsDeps = {}): Promise<FillupRoomsResult> {
  const { data, error } = await admin.rpc("sync_order_rooms_v1", {
    p_order_id: ctx.orderId,
    p_expected_updated_at: null,
    p_rooms: ctx.rows,
  });

  if (!error) {
    const conflicts = ((data as any)?.conflicts ?? []) as any[];
    const unassigned: UnassignedRoom[] = [
      ...conflicts.map((c) => ({
        room_type_id: String(c.room_type_id),
        requested_unit: ctx.unitNumberById.get(String(c.room_unit_id)) ?? String(c.room_unit_id),
        reason: "occupied" as const,
      })),
      ...ctx.rows.filter((r) => !r.room_unit_id).map((r) => ({ room_type_id: r.room_type_id, requested_unit: null, reason: "no_free_unit" as const })),
    ];
    return { ok: true, unassigned };
  }

  const caseId: "1a" | "1b" = ctx.updatedExisting ? "1a" : "1b";
  const caseLabel = ctx.updatedExisting ? "1a 既有自動鎖房訂單" : "1b 補單新建訂單";
  const msg = error.message ?? String(error);
  const userError = ctx.updatedExisting
    ? `房型明細寫入失敗，訂單 ${ctx.orderNumber} 已保留，請重新送出`
    : `訂單 ${ctx.orderNumber} 已建立，但房型明細寫入失敗，請客服手動安排房間`;

  await (deps.reportError ?? reportBackendError)({
    functionName: "owlting-fillup-submit",
    category: "owlting_fillup_rooms",
    step: "sync_order_rooms_v1",
    errorMessage: `[${caseLabel}] ${msg}`,
    accommodationId: ctx.accommodationId,
    context: { case: caseId, order_id: ctx.orderId, order_number: ctx.orderNumber, staging_id: ctx.stagingId, rows: ctx.rows },
  });
  await admin.from("owlting_email_parsed_staging").update({
    review_status: "pending_review",
    review_notes: `[需人工] 補單房型明細寫入失敗（${caseLabel}）：訂單 ${ctx.orderNumber} 已保留、未刪除；${msg}`,
  }).eq("id", ctx.stagingId);
  await (deps.sendAlert ?? sendOrderRoomsAlertEmail)(admin, {
    orderNumber: ctx.orderNumber,
    orderId: ctx.orderId,
    obeNumber: ctx.obeNumber,
    stagingId: ctx.stagingId,
    error: `[${caseLabel}] 補單房型明細寫入失敗，訂單已保留：${msg}`,
  }).catch(() => false);

  return { ok: false, status: 500, body: { ok: false, code: "ROOMS_WRITE_FAILED", case: caseId, error: userError, order_number: ctx.orderNumber } };
}
