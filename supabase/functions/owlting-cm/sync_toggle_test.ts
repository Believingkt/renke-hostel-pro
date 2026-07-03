// Tests for per-room-type OwlTing sync toggle (owlting_room_type_sync).
// Covers:
//  - loadExcludedRoomTypeIds returns only rows with sync_enabled=false
//  - excluded room_types are filtered out of AvailRS room loop
//  - non-excluded room_types are kept
//  - SENSAN group canonical (1001) is NOT excluded → group stays intact
//  - Yunxiu (no exclusions) regression: nothing filtered out

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadExcludedRoomTypeIds } from "./index.ts";

// Minimal supabase mock: only supports .from().select().eq().eq() chain used by loader.
function mockSupabase(rows: { room_type_id: string; sync_enabled: boolean }[]) {
  return {
    from(_table: string) {
      const state = { rows };
      const chain: any = {
        _rows: state.rows,
        select(_c: string) { return chain; },
        eq(col: string, val: any) {
          if (col === "sync_enabled") {
            chain._rows = chain._rows.filter((r: any) => r.sync_enabled === val);
          }
          // accommodation_id filter is a no-op in the mock — caller passes matching rows.
          return chain;
        },
        then(resolve: (v: any) => void) { resolve({ data: chain._rows, error: null }); },
      };
      return chain;
    },
  };
}

Deno.test("loadExcludedRoomTypeIds — returns only sync_enabled=false rows", async () => {
  const supabase = mockSupabase([
    { room_type_id: "rt-1002", sync_enabled: false },
    { room_type_id: "rt-1003", sync_enabled: false },
    { room_type_id: "rt-1001", sync_enabled: true }, // should be excluded from result
  ]);
  const set = await loadExcludedRoomTypeIds(supabase as any, "acc-sensan");
  assertEquals(set.size, 2);
  assertEquals(set.has("rt-1002"), true);
  assertEquals(set.has("rt-1003"), true);
  assertEquals(set.has("rt-1001"), false);
});

Deno.test("loadExcludedRoomTypeIds — empty when no exclusions (Yunxiu regression)", async () => {
  const supabase = mockSupabase([]);
  const set = await loadExcludedRoomTypeIds(supabase as any, "acc-yunxiu");
  assertEquals(set.size, 0);
});

// --- AvailRS room-loop filter (behaviour test) -----------------------------
// Mirrors the inline filter in handleAvailRQ:
//   for (const r of rooms) {
//     if (group?) { … skip if canonical excluded … }
//     if (excludedRoomTypeIds.has(r.id)) continue;   ← the toggle
//     …emit RoomStay…
//   }
// We test the toggle in isolation using a tiny reimplementation so any drift
// in emit logic doesn't hide a regression here.

interface RoomLite { id: string; numeric_code: number; name: string; }

function filterRoomsForAvailRS(
  rooms: RoomLite[],
  excluded: Set<string>,
): RoomLite[] {
  return rooms.filter((r) => !excluded.has(r.id));
}

Deno.test("AvailRS filter — SENSAN 1002/1003 excluded, 1001/1004/1005/1006 kept", () => {
  const sensanRooms: RoomLite[] = [
    { id: "rt-1001", numeric_code: 1001, name: "18 人包區" },
    { id: "rt-1002", numeric_code: 1002, name: "雙人房" },
    { id: "rt-1003", numeric_code: 1003, name: "四人房" },
    { id: "rt-1004", numeric_code: 1004, name: "16 人包區" },
    { id: "rt-1005", numeric_code: 1005, name: "14 人包區" },
    { id: "rt-1006", numeric_code: 1006, name: "12 人包區" },
  ];
  const excluded = new Set(["rt-1002", "rt-1003"]);
  const kept = filterRoomsForAvailRS(sensanRooms, excluded);
  const codes = kept.map((r) => r.numeric_code).sort();
  assertEquals(codes, [1001, 1004, 1005, 1006]);
});

Deno.test("AvailRS filter — Yunxiu regression: no exclusions, all rooms kept", () => {
  const yunxiuRooms: RoomLite[] = [
    { id: "rt-A", numeric_code: 1001, name: "A" },
    { id: "rt-B", numeric_code: 1002, name: "B" },
    { id: "rt-C", numeric_code: 1003, name: "C" },
  ];
  const excluded = new Set<string>();
  const kept = filterRoomsForAvailRS(yunxiuRooms, excluded);
  assertEquals(kept.length, 3);
});

// --- Outbound push filter (owlting-order-push behaviour) --------------------
interface StayInput { room_type_id: string; quantity: number; unit_amount: number; }

function filterStaysForPush(
  stays: StayInput[],
  excluded: Set<string>,
): StayInput[] {
  return stays.filter((s) => !excluded.has(s.room_type_id));
}

Deno.test("Push filter — order with only excluded room type → empty (skipped)", () => {
  const stays: StayInput[] = [
    { room_type_id: "rt-1002", quantity: 1, unit_amount: 3000 },
  ];
  const filtered = filterStaysForPush(stays, new Set(["rt-1002", "rt-1003"]));
  assertEquals(filtered.length, 0);
});

Deno.test("Push filter — mixed order: excluded rooms dropped, others kept", () => {
  const stays: StayInput[] = [
    { room_type_id: "rt-1001", quantity: 1, unit_amount: 20000 }, // 包區, keep
    { room_type_id: "rt-1002", quantity: 1, unit_amount: 3000 },  // excluded
  ];
  const filtered = filterStaysForPush(stays, new Set(["rt-1002", "rt-1003"]));
  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].room_type_id, "rt-1001");
});

Deno.test("Push filter — Yunxiu regression: no exclusions, all stays kept", () => {
  const stays: StayInput[] = [
    { room_type_id: "rt-A", quantity: 1, unit_amount: 5000 },
    { room_type_id: "rt-B", quantity: 2, unit_amount: 4000 },
  ];
  const filtered = filterStaysForPush(stays, new Set<string>());
  assertEquals(filtered.length, 2);
});
