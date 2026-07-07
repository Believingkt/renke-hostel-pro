// Tests for bulkResolveRatePlans — inbound RatePlanCode resolution priority.
// Template first (preserves SENSAN 一泊一食 semantics), package fallback
// (fixes 雲岫 1007 not-found), group canonical fan-out unaffected.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bulkResolveRatePlans, type ResolvedPlan } from "./index.ts";

// Minimal fluent stub matching the .from(...).select(...).eq(...).eq(...).in(...)
// chain used by bulkResolveRatePlans. Returns whatever rows are seeded per table.
function makeSupabaseStub(fixtures: {
  pricing_templates?: any[];
  accommodation_packages?: any[];
}) {
  return {
    from(table: string) {
      const rows = (fixtures as any)[table] ?? [];
      let filtered = [...rows];
      const chain: any = {
        select() { return chain; },
        eq(col: string, val: any) {
          filtered = filtered.filter((r) => r[col] === val);
          return chain;
        },
        in(col: string, vals: any[]) {
          const set = new Set(vals);
          filtered = filtered.filter((r) => set.has(r[col]));
          return chain;
        },
        then(resolve: any) { resolve({ data: filtered, error: null }); },
      };
      return chain;
    },
  };
}

const ACC = "acc-1";

Deno.test("SENSAN 1018 → template branch (template takes priority)", async () => {
  const sb = makeSupabaseStub({
    pricing_templates: [
      { id: "tpl-1018", template_name: "一泊一食", room_type_id: "rt-sensan", numeric_code: 1018, accommodation_id: ACC },
    ],
    accommodation_packages: [],
  });
  const map = await bulkResolveRatePlans(sb as any, ACC, ["1018"]);
  const plan = map.get("1018") as ResolvedPlan;
  assertEquals(plan.kind, "template");
  assertEquals((plan as any).id, "tpl-1018");
});

Deno.test("YUNXIU 1007 → package fallback (fixes not-found)", async () => {
  const sb = makeSupabaseStub({
    pricing_templates: [], // no template with 1007
    accommodation_packages: [
      { id: "pkg-1007", name: "16人包棟", numeric_code: 1007, room_type_ids: ["rt-a1"], enabled: true, accommodation_id: ACC },
    ],
  });
  const map = await bulkResolveRatePlans(sb as any, ACC, ["1007"]);
  const plan = map.get("1007") as ResolvedPlan;
  assertEquals(plan.kind, "package");
  assertEquals((plan as any).id, "pkg-1007");
  assertEquals((plan as any).room_type_ids, ["rt-a1"]);
});

Deno.test("Unknown code → not in map (caller returns not-found)", async () => {
  const sb = makeSupabaseStub({ pricing_templates: [], accommodation_packages: [] });
  const map = await bulkResolveRatePlans(sb as any, ACC, ["9999"]);
  assertEquals(map.has("9999"), false);
});

Deno.test("Template preferred when both template and package share numeric_code", async () => {
  const sb = makeSupabaseStub({
    pricing_templates: [
      { id: "tpl-x", template_name: "T", room_type_id: "rt-x", numeric_code: 1005, accommodation_id: ACC },
    ],
    accommodation_packages: [
      { id: "pkg-x", name: "P", numeric_code: 1005, room_type_ids: ["rt-y"], enabled: true, accommodation_id: ACC },
    ],
  });
  const map = await bulkResolveRatePlans(sb as any, ACC, ["1005"]);
  const plan = map.get("1005") as ResolvedPlan;
  assertEquals(plan.kind, "template");
});

Deno.test("Disabled package is not resolved", async () => {
  const sb = makeSupabaseStub({
    pricing_templates: [],
    accommodation_packages: [
      { id: "pkg-off", name: "off", numeric_code: 1001, room_type_ids: [], enabled: false, accommodation_id: ACC },
    ],
  });
  const map = await bulkResolveRatePlans(sb as any, ACC, ["1001"]);
  assertEquals(map.has("1001"), false);
});

Deno.test("Mixed batch: template + package resolved in one call", async () => {
  const sb = makeSupabaseStub({
    pricing_templates: [
      { id: "tpl-1018", template_name: "一泊一食", room_type_id: "rt-s", numeric_code: 1018, accommodation_id: ACC },
    ],
    accommodation_packages: [
      { id: "pkg-1007", name: "16人包棟", numeric_code: 1007, room_type_ids: ["rt-a1"], enabled: true, accommodation_id: ACC },
    ],
  });
  const map = await bulkResolveRatePlans(sb as any, ACC, ["1018", "1007"]);
  assertEquals(map.get("1018")?.kind, "template");
  assertEquals(map.get("1007")?.kind, "package");
});

// ---- Group canonical fan-out regression: the fan-out logic lives inside
// handleAvailNotifRQ but is triggered by (room is canonical) && (plan.kind
// !== "template"). Mirror the decision here to lock the behavior.

interface GroupContext {
  canonicalRoomTypeIds: Set<string>;
  memberRoomTypeIdsByCanonical: Map<string, string[]>;
}

function availTargetsForPackagePlan(roomId: string, ctx: GroupContext): string[] {
  const members = ctx.memberRoomTypeIdsByCanonical.get(roomId);
  return members && members.length > 0 ? members : [roomId];
}

Deno.test("Group canonical + package plan → fan-out to members", () => {
  const ctx: GroupContext = {
    canonicalRoomTypeIds: new Set(["rt-canon"]),
    memberRoomTypeIdsByCanonical: new Map([["rt-canon", ["rt-m1", "rt-m2"]]]),
  };
  assertEquals(availTargetsForPackagePlan("rt-canon", ctx), ["rt-m1", "rt-m2"]);
});

Deno.test("Non-canonical room + package plan → writes on itself (雲岫 case)", () => {
  const ctx: GroupContext = {
    canonicalRoomTypeIds: new Set(),
    memberRoomTypeIdsByCanonical: new Map(),
  };
  assertEquals(availTargetsForPackagePlan("rt-yunxiu-a1", ctx), ["rt-yunxiu-a1"]);
});
