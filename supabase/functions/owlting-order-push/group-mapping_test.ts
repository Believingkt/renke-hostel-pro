// Pure unit tests for outbound package-group mapping (no network, no DB).
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMappingTables, mapOutboundStay } from "./group-mapping.ts";

// SENSAN-shaped fixture: canonical = 18人包區 (room_type 1001),
// members = 12/14/16/18人 with rate plan templates 1004/1003/1002/1001.
const groups = [{
  id: "g1",
  canonical_room_type_id: "rt-1001",
  canonical_name: "包區",
}];
const canonicalRts = [{ id: "rt-1001", numeric_code: 1001 }];
const members = [
  { group_id: "g1", room_type_id: "rt-1006", rate_plan_template_id: "tpl-1004", rate_plan_name: "12人・一泊二食", rate_plan_template_numeric_code: 1004 },
  { group_id: "g1", room_type_id: "rt-1005", rate_plan_template_id: "tpl-1003", rate_plan_name: "14人・一泊二食", rate_plan_template_numeric_code: 1003 },
  { group_id: "g1", room_type_id: "rt-1004", rate_plan_template_id: "tpl-1002", rate_plan_name: "16人・一泊二食", rate_plan_template_numeric_code: 1002 },
  { group_id: "g1", room_type_id: "rt-1001-mem", rate_plan_template_id: "tpl-1001", rate_plan_name: "18人・一泊二食", rate_plan_template_numeric_code: 1001 },
];
const tables = buildMappingTables(groups, canonicalRts, members);

Deno.test("outbound: 14人包區 (room_type 1005) → canonical 1001 + RatePlanCode 1003", () => {
  const out = mapOutboundStay({
    room_type_id: "rt-1005",
    original_room_type_code: 1005,
    fallback_rate_plan_code: null, // no package_id on order — mapping must still succeed
  }, tables);
  if ("error" in out) throw new Error(out.error);
  assertEquals(out.roomTypeCode, 1001);
  assertEquals(out.ratePlanCode, 1003);
  assertEquals(out.roomTypeName, "包區");
  assertEquals(out.ratePlanName, "14人・一泊二食");
  assert(out.remapped);
  assertEquals(out.original.room_type_code, 1005);
  assertEquals(out.converted.canonical_room_type_code, 1001);
  assertEquals(out.converted.rate_plan_code, 1003);
});

Deno.test("outbound: 12人 → 1001 + 1004; 16人 → 1001 + 1002; 18人 → 1001 + 1001", () => {
  for (const [memberRt, memberPlan] of [
    ["rt-1006", 1004], ["rt-1004", 1002], ["rt-1001-mem", 1001],
  ] as [string, number][]) {
    const out = mapOutboundStay({
      room_type_id: memberRt,
      original_room_type_code: 0,
      fallback_rate_plan_code: null,
    }, tables);
    if ("error" in out) throw new Error(out.error);
    assertEquals(out.roomTypeCode, 1001);
    assertEquals(out.ratePlanCode, memberPlan);
  }
});

Deno.test("outbound non-group room_type: keeps original codes, uses fallback rate plan", () => {
  const out = mapOutboundStay({
    room_type_id: "rt-other",
    original_room_type_code: 2002,
    fallback_rate_plan_code: 9001,
    fallback_rate_plan_name: "一般方案",
    fallback_room_type_name: "雙人房",
  }, tables);
  if ("error" in out) throw new Error(out.error);
  assertEquals(out.roomTypeCode, 2002);
  assertEquals(out.ratePlanCode, 9001);
  assertEquals(out.remapped, false);
});

Deno.test("outbound non-group room_type without fallback: error (no rate plan)", () => {
  const out = mapOutboundStay({
    room_type_id: "rt-other",
    original_room_type_code: 2002,
    fallback_rate_plan_code: null,
  }, tables);
  assert("error" in out);
});

Deno.test("regression: accommodation with NO groups behaves as pass-through", () => {
  const empty = buildMappingTables([], [], []);
  const out = mapOutboundStay({
    room_type_id: "yunxiu-rt-A1",
    original_room_type_code: 1001,
    fallback_rate_plan_code: 1001,
    fallback_rate_plan_name: "一泊二食",
  }, empty);
  if ("error" in out) throw new Error(out.error);
  assertEquals(out.roomTypeCode, 1001);
  assertEquals(out.ratePlanCode, 1001);
  assertEquals(out.remapped, false);
});
