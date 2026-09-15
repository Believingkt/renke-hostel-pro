import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveOrderForQueueRow, classifyCancelResponse } from "./deletedSnapshot.ts";

const fullSnapshot = {
  id: "ord-1",
  order_number: "AB12CD34",
  accommodation_id: "acc-1",
  check_in_date: "2026-01-10",
  check_out_date: "2026-01-11",
  guest_count: 2,
  guest_name: "測試 王",
  guest_phone: "0912345678",
  guest_email: null,
  total_price: 3000,
  final_price: 3000,
  deposit_amount: 0,
  payment_status: "unpaid",
  notes: "test",
  room_type_id: "rt-1",
  package_id: "pkg-1",
  meal_plan: null,
  owlting_unique_id: "AB12CD34",
  order_status: "cancelled",
  order_rooms: [{ room_type_id: "rt-1", quantity: 1, room_price: 3000 }],
};

// CASE 1 — normal order still present: unchanged path
Deno.test("CASE 1: live order present -> db path", () => {
  const r = resolveOrderForQueueRow({ res_status: "Cancel", order_snapshot: fullSnapshot }, { id: "ord-1" });
  assertEquals(r.kind, "db");
});

// CASE 2 — delete queue, order_id NULL, snapshot complete
Deno.test("CASE 2: deleted order + complete snapshot -> snapshot path", () => {
  const r = resolveOrderForQueueRow({ res_status: "Cancel", order_snapshot: fullSnapshot }, null);
  assert(r.kind === "snapshot");
  if (r.kind === "snapshot") {
    assertEquals(r.order.owlting_unique_id, "AB12CD34");
    assertEquals(r.order.order_status, "cancelled");
    assertEquals(r.order.__snapshot_rooms.length, 1);
    assertEquals(r.order.__from_snapshot, true);
  }
});

// CASE 3 — order_id set but row gone
Deno.test("CASE 3: order_id present but orders row missing -> snapshot path", () => {
  const r = resolveOrderForQueueRow({ res_status: "Cancel", order_snapshot: fullSnapshot }, null);
  assertEquals(r.kind, "snapshot");
});

// CASE 4 — snapshot missing PMS identity
Deno.test("CASE 4: snapshot without owlting_unique_id -> manual review, no HTTP", () => {
  const s = { ...fullSnapshot, owlting_unique_id: null };
  const r = resolveOrderForQueueRow({ res_status: "Cancel", order_snapshot: s }, null);
  assert(r.kind === "fail");
  if (r.kind === "fail") {
    assert(r.manualReview);
    assert(r.permanent);
    assertStringIncludes(r.reason, "PMS identity");
  }
});

Deno.test("CASE 4b: snapshot missing core fields -> manual review", () => {
  const s = { ...fullSnapshot, check_out_date: null };
  const r = resolveOrderForQueueRow({ res_status: "Cancel", order_snapshot: s }, null);
  assert(r.kind === "fail");
  if (r.kind === "fail") assertStringIncludes(r.reason, "incomplete");
});

Deno.test("CASE 4c: no snapshot at all -> manual review", () => {
  const r = resolveOrderForQueueRow({ res_status: "Cancel", order_snapshot: null }, null);
  assert(r.kind === "fail");
  if (r.kind === "fail") assert(r.manualReview);
});

// CASE 7 — idempotent responses (snapshot replay only)
Deno.test("CASE 6/7: response classification", () => {
  assertEquals(classifyCancelResponse(200, "<Success/>", true), "success");
  assertEquals(classifyCancelResponse(200, "<Errors><Error>Reservation already cancelled</Error></Errors>", false), "already_cancelled");
  assertEquals(classifyCancelResponse(200, "<Errors><Error>reservation not found</Error></Errors>", false), "not_found");
  assertEquals(classifyCancelResponse(500, "boom", false), "error");
});

// CASE 8 — New / Modify never use snapshot fallback
Deno.test("CASE 8: New/Modify with missing order -> plain failure, no snapshot", () => {
  for (const st of ["Commit", "Modify"]) {
    const r = resolveOrderForQueueRow({ res_status: st, order_snapshot: fullSnapshot }, null);
    assert(r.kind === "fail");
    if (r.kind === "fail") {
      assertEquals(r.reason, "order not found");
      assertEquals(r.manualReview, false);
    }
  }
});
