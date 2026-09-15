/**
 * deletedSnapshot.ts
 *
 * NARROW special branch for "order already hard-deleted locally, but its
 * OwlTing Cancel was never delivered".
 *
 * Background: `trg_orders_owlting_enqueue_delete` enqueues a Cancel row with a
 * full `order_snapshot` BEFORE the row is hard-deleted. The FK is
 * `ON DELETE SET NULL`, so afterwards `queue.order_id` is NULL and the worker
 * used to permanently fail with "order not found" — the PMS Cancel never went out.
 *
 * This module is *only* consulted when the live `orders` row is missing.
 * Normal orders (row still in `orders`) never touch this code path, and
 * New / Modify never fall back to a snapshot (that could resurrect or mutate a
 * deleted reservation).
 *
 * Pure functions only — unit tested, no I/O.
 */

export interface QueueRowLike {
  res_status: string;
  order_snapshot: any;
}

export type SnapshotOrder = {
  id: string | null;
  order_number: string;
  accommodation_id: string;
  check_in_date: string;
  check_out_date: string;
  guest_count: number | null;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  total_price: number | null;
  final_price: number | null;
  deposit_amount: number | null;
  paid_amount: number | null;
  payment_status: string | null;
  notes: string | null;
  room_type_id: string | null;
  package_id: string | null;
  meal_plan: string | null;
  owlting_unique_id: string;
  order_status: string;
  order_source: string | null;
  /** rooms captured by the delete trigger */
  __snapshot_rooms: Array<{ room_type_id: string; quantity: number; room_price: number }>;
  /** marks the narrow deleted-order branch */
  __from_snapshot: true;
};

export type OrderResolution =
  | { kind: "db"; order: any }
  | { kind: "snapshot"; order: SnapshotOrder }
  | { kind: "fail"; reason: string; permanent: boolean; manualReview: boolean };

/**
 * Decide the data source for a queue row.
 *   - live `orders` row present  -> unchanged production path
 *   - missing + Cancel + usable snapshot -> snapshot fallback
 *   - anything else -> failure (as before)
 */
export function resolveOrderForQueueRow(
  row: QueueRowLike,
  dbOrder: any | null,
): OrderResolution {
  if (dbOrder) return { kind: "db", order: dbOrder };

  if (row.res_status !== "Cancel") {
    // New / Modify must never resurrect a deleted order from a snapshot.
    return {
      kind: "fail",
      reason: "order not found",
      permanent: true,
      manualReview: false,
    };
  }

  const s = row.order_snapshot;
  if (!s || typeof s !== "object") {
    return {
      kind: "fail",
      reason: "order not found (deleted) and no order_snapshot",
      permanent: true,
      manualReview: true,
    };
  }

  const uniqueId = s.owlting_unique_id;
  if (!uniqueId || typeof uniqueId !== "string" || !uniqueId.trim()) {
    return {
      kind: "fail",
      reason: "manual review: deleted-order snapshot has no OwlTing PMS identity (owlting_unique_id)",
      permanent: true,
      manualReview: true,
    };
  }

  const rooms = Array.isArray(s.order_rooms)
    ? s.order_rooms
        .filter((r: any) => r && r.room_type_id)
        .map((r: any) => ({
          room_type_id: String(r.room_type_id),
          quantity: Number(r.quantity ?? 1),
          room_price: Number(r.room_price ?? 0),
        }))
    : [];

  const missing: string[] = [];
  for (const f of ["order_number", "accommodation_id", "check_in_date", "check_out_date", "guest_name"]) {
    if (!s[f]) missing.push(f);
  }
  if (rooms.length === 0 && !s.room_type_id) missing.push("rooms");
  if (missing.length > 0) {
    return {
      kind: "fail",
      reason: `manual review: deleted-order snapshot incomplete (missing ${missing.join(", ")})`,
      permanent: true,
      manualReview: true,
    };
  }

  return {
    kind: "snapshot",
    order: {
      id: s.id ?? null,
      order_number: String(s.order_number),
      accommodation_id: String(s.accommodation_id),
      check_in_date: String(s.check_in_date),
      check_out_date: String(s.check_out_date),
      guest_count: s.guest_count ?? null,
      guest_name: String(s.guest_name),
      guest_phone: s.guest_phone ?? null,
      guest_email: s.guest_email ?? null,
      total_price: s.total_price ?? null,
      final_price: s.final_price ?? null,
      deposit_amount: s.deposit_amount ?? null,
      paid_amount: s.paid_amount ?? null,
      payment_status: s.payment_status ?? null,
      notes: s.notes ?? null,
      room_type_id: s.room_type_id ?? null,
      package_id: s.package_id ?? null,
      meal_plan: s.meal_plan ?? null,
      owlting_unique_id: uniqueId,
      order_status: "cancelled",
      order_source: s.order_source ?? null,
      __snapshot_rooms: rooms,
      __from_snapshot: true,
    },
  };
}

/**
 * Interpret an OwlTing Cancel response for the deleted-order replay path only.
 * Normal Cancel handling is untouched.
 */
export type CancelResponseKind =
  | "success"
  | "already_cancelled"
  | "not_found"
  | "error";

export function classifyCancelResponse(
  httpStatus: number,
  text: string,
  isSuccessRs: boolean,
): CancelResponseKind {
  if (httpStatus >= 200 && httpStatus < 300 && isSuccessRs) return "success";
  const t = (text ?? "").toLowerCase();
  if (/already\s+cancel|has\s+been\s+cancel|cancelled\s+already/.test(t)) return "already_cancelled";
  if (/reservation\s+not\s+found|booking\s+not\s+found|no\s+such\s+reservation/.test(t)) return "not_found";
  return "error";
}
