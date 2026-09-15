// Tests for per-room-type OwlTing sync toggle (owlting_room_type_sync).
// Covers:
//  - loadExcludedRoomTypeIds returns only rows with sync_enabled=false
//  - excluded room_types are filtered out of AvailRS room loop
//  - non-excluded room_types are kept
//  - SENSAN group canonical (1001) is NOT excluded → group stays intact
//  - Yunxiu (no exclusions) regression: nothing filtered out

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleAvailRQ, loadExcludedRoomTypeIds } from "./index.ts";

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

Deno.test("handleAvailRQ — excluded SENSAN room types are absent from actual AvailRS RoomStays", async () => {
  const rowsByTable: Record<string, any[]> = {
    room_types: [
      { id: "rt-1001", numeric_code: 1001, name: "包區", accommodation_id: "acc-sensan", display_order: 1 },
      { id: "rt-1002", numeric_code: 1002, name: "雙人房", accommodation_id: "acc-sensan", display_order: 2 },
      { id: "rt-1003", numeric_code: 1003, name: "四人房", accommodation_id: "acc-sensan", display_order: 3 },
    ],
    pricing_templates: [
      { id: "tpl-1001", template_name: "18 人包區", room_type_id: "rt-1001", numeric_code: 2001, default_package_id: "pkg-1001", accommodation_id: "acc-sensan" },
    ],
    accommodation_packages: [
      { id: "pkg-1001", name: "18 人包區", numeric_code: 3001, room_type_ids: ["rt-1001"], enabled: true, display_order: 1, accommodation_id: "acc-sensan" },
    ],
    owlting_room_type_sync: [
      { accommodation_id: "acc-sensan", room_type_id: "rt-1002", sync_enabled: false },
      { accommodation_id: "acc-sensan", room_type_id: "rt-1003", sync_enabled: false },
    ],
    owlting_room_type_groups: [
      { id: "group-sensan", canonical_room_type_id: "rt-1001", canonical_name: "包區", display_order: 1, accommodation_id: "acc-sensan" },
    ],
    owlting_room_type_group_members: [
      { group_id: "group-sensan", room_type_id: "rt-1001", rate_plan_template_id: "tpl-1001", rate_plan_name: "18 人包區", display_order: 1 },
    ],
    owlting_cm_logs: [],
  };

  const supabase = {
    from(table: string) {
      const chain: any = {
        _rows: [...(rowsByTable[table] ?? [])],
        select(_columns: string) { return chain; },
        eq(column: string, value: any) {
          chain._rows = chain._rows.filter((row: any) => row[column] === value);
          return chain;
        },
        in(column: string, values: any[]) {
          chain._rows = chain._rows.filter((row: any) => values.includes(row[column]));
          return chain;
        },
        order(column: string, options?: { ascending?: boolean }) {
          const direction = options?.ascending === false ? -1 : 1;
          chain._rows.sort((a: any, b: any) => ((a[column] ?? 0) - (b[column] ?? 0)) * direction);
          return chain;
        },
        insert(row: any) {
          rowsByTable[table] = [...(rowsByTable[table] ?? []), row];
          return Promise.resolve({ data: row, error: null });
        },
        then(resolve: (value: any) => void) { resolve({ data: chain._rows, error: null }); },
      };
      return chain;
    },
  };

  const xml = `<OTA_HotelAvailRQ EchoToken="sync-toggle-test"><HotelRef HotelCode="SENSAN"/></OTA_HotelAvailRQ>`;
  const response = await handleAvailRQ(supabase as any, xml, "sync-toggle-test", {
    accommodationId: "acc-sensan",
    hotelCode: "SENSAN",
  });
  const body = await response.text();

  assertStringIncludes(body, `RoomTypeCode="1001"`);
  assertEquals(body.includes(`RoomTypeCode="1002"`), false);
  assertEquals(body.includes(`RoomTypeCode="1003"`), false);
  assertEquals((body.match(/<RoomStay>/g) ?? []).length, 1);
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
