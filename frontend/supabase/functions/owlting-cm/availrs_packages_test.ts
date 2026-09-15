// Tests for OTA_HotelAvailRS RatePlan source (accommodation_packages).
// Verifies: (a) Yunxiu A1-A7 all expose RatePlans 1001-1007, (b) RatePlanCode
// matches owlting-order-push (packages.numeric_code namespace), (c) SENSAN
// grouped rooms are NOT in this path (handled by group branch in index.ts),
// (d) disabled / null-code packages are filtered out.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRatePlansForRoomType,
  findTemplateMappingGaps,
  type PackageRow,
  type TemplateRow,
} from "./availrs_packages.ts";

// Yunxiu real-data shape (numeric_code -> room_type membership).
const A1 = "2ab16f88-9c72-443a-9d7e-91831c618274";
const A2 = "54631347-095d-45c0-a066-e5e39211668e";
const A3 = "a6d49a3a-0b48-4465-ba0c-d643b4f6700a";
const A5 = "c65366d3-c1d6-4a93-b5c8-34a15c3ea8de";
const A6 = "ca578b7c-4dff-49da-b487-703cb5a94c1d";
const A7 = "1d5b12f2-7d90-43a2-8251-8d2341b5d04a";
const B1 = "01e27ccc-81fe-4135-aaad-fa100fcc6495";
const A_ALL = [A1, A2, A3, A5, A6, A7];

const yunxiuPackages: PackageRow[] = [
  { id: "p1001", name: "6人包棟",  numeric_code: 1001, room_type_ids: A_ALL, enabled: true, display_order: 1 },
  { id: "p1002", name: "海景四人房", numeric_code: 1002, room_type_ids: [B1], enabled: true, display_order: 2 },
  { id: "p1003", name: "8人包棟",  numeric_code: 1003, room_type_ids: A_ALL, enabled: true, display_order: 3 },
  { id: "p1004", name: "10人包棟", numeric_code: 1004, room_type_ids: A_ALL, enabled: true, display_order: 4 },
  { id: "p1005", name: "12人包棟", numeric_code: 1005, room_type_ids: A_ALL, enabled: true, display_order: 5 },
  { id: "p1006", name: "14人包棟", numeric_code: 1006, room_type_ids: A_ALL, enabled: true, display_order: 6 },
  { id: "p1007", name: "16人包棟", numeric_code: 1007, room_type_ids: [A2], enabled: true, display_order: 7 },
];

Deno.test("Yunxiu A1 exposes 1001/1003/1004/1005/1006 (not 1007 — A2-only)", () => {
  const codes = buildRatePlansForRoomType(A1, yunxiuPackages).map((p) => p.code);
  assertEquals(codes, [1001, 1003, 1004, 1005, 1006]);
});

Deno.test("Yunxiu A2 includes BOTH 14人(1006) and 16人(1007) — confirms 16人錯位來自 templates 非 packages", () => {
  const codes = buildRatePlansForRoomType(A2, yunxiuPackages).map((p) => p.code);
  assertEquals(codes, [1001, 1003, 1004, 1005, 1006, 1007]);
});

Deno.test("Yunxiu A3/A5/A6/A7 now expose RatePlans (regression: previously empty under templates)", () => {
  for (const rid of [A3, A5, A6, A7]) {
    const codes = buildRatePlansForRoomType(rid, yunxiuPackages).map((p) => p.code);
    assertEquals(codes, [1001, 1003, 1004, 1005, 1006], `room ${rid} should expose 5 non-A2-only packages`);
  }
});

Deno.test("Yunxiu B1 only exposes 海景四人房 (1002)", () => {
  const codes = buildRatePlansForRoomType(B1, yunxiuPackages).map((p) => p.code);
  assertEquals(codes, [1002]);
});

Deno.test("All Yunxiu RatePlanCodes fall in packages namespace 1001–1007 (==owlting-order-push)", () => {
  for (const rid of [...A_ALL, B1]) {
    const codes = buildRatePlansForRoomType(rid, yunxiuPackages).map((p) => p.code);
    for (const c of codes) assert(c >= 1001 && c <= 1007, `code ${c} out of packages range`);
  }
});

Deno.test("Disabled packages are filtered out", () => {
  const pkgs: PackageRow[] = [
    { id: "x", name: "停用", numeric_code: 2001, room_type_ids: [A1], enabled: false, display_order: 1 },
    { id: "y", name: "啟用", numeric_code: 2002, room_type_ids: [A1], enabled: true,  display_order: 2 },
  ];
  assertEquals(buildRatePlansForRoomType(A1, pkgs).map((p) => p.code), [2002]);
});

Deno.test("Packages without numeric_code are skipped (cannot be pushed)", () => {
  const pkgs: PackageRow[] = [
    { id: "x", name: "缺號", numeric_code: null, room_type_ids: [A1], enabled: true },
    { id: "y", name: "有號", numeric_code: 3001, room_type_ids: [A1], enabled: true },
  ];
  assertEquals(buildRatePlansForRoomType(A1, pkgs).map((p) => p.code), [3001]);
});

Deno.test("Room_type not in any package -> empty list (no crash, no fallback)", () => {
  assertEquals(buildRatePlansForRoomType("rt-unrelated", yunxiuPackages), []);
});

Deno.test("Ordering is deterministic: display_order asc, then numeric_code asc", () => {
  const pkgs: PackageRow[] = [
    { id: "a", name: "C", numeric_code: 1003, room_type_ids: [A1], enabled: true, display_order: 3 },
    { id: "b", name: "A", numeric_code: 1001, room_type_ids: [A1], enabled: true, display_order: 1 },
    { id: "c", name: "B", numeric_code: 1002, room_type_ids: [A1], enabled: true, display_order: 2 },
    { id: "d", name: "D", numeric_code: 1004, room_type_ids: [A1], enabled: true, display_order: 1 },
  ];
  assertEquals(buildRatePlansForRoomType(A1, pkgs).map((p) => p.code), [1001, 1004, 1002, 1003]);
});

Deno.test("Non-group property regression: room_type_ids=[self] packages still resolve normally", () => {
  // Mimics a simple property where each room_type has its own package(s).
  const RT = "rt-single";
  const pkgs: PackageRow[] = [
    { id: "p", name: "雙人房-含早", numeric_code: 1001, room_type_ids: [RT], enabled: true },
    { id: "q", name: "雙人房-純住", numeric_code: 1002, room_type_ids: [RT], enabled: true },
  ];
  assertEquals(buildRatePlansForRoomType(RT, pkgs).map((p) => p.code), [1001, 1002]);
});

// ---------------------------------------------------------------------------
// Regression (2026-07): SENSAN 散客房 (雙人房 1002 / 四人房 1003) — their only
// sellable "plan" lives in pricing_templates (一泊一食), NOT in packages'
// room_type_ids. RatePlan source MUST be UNION of (a) packages + (b) templates
// via default_package_id, deduped by package.id. RatePlanCode is ALWAYS the
// resolved packages.numeric_code (never template.numeric_code) so AvailRS
// matches owlting-order-push.
// ---------------------------------------------------------------------------

const SENSAN_DOUBLE = "b415b602-7cca-4f35-829e-2b9cc0cd0bac";    // 雙人房 (numeric_code 1002)
const SENSAN_QUAD   = "c483aafb-a22f-4252-a61d-c8f6878bf8f5";    // 四人房 (numeric_code 1003)
const SENSAN_G12    = "57861c83-09ae-4366-9ad5-56c0d511bbf3";    // 12人包區
const SENSAN_G14    = "958731dc-54d2-4087-b116-4b967a4923cf";    // 14人包區
const SENSAN_G16    = "83f6c7b7-b30d-4c54-ac01-5ddd02c31275";    // 16人包區
const SENSAN_G18    = "0b66c218-d211-4bb2-83f3-745d8205eb67";    // 18人包區

// Hypothetical package rows for SENSAN 散客房 (once 方案對應 is filled in).
const PKG_DOUBLE_ID = "pkg-sensan-double-1meal";
const PKG_QUAD_ID   = "pkg-sensan-quad-1meal";
const PKG_G12_ID    = "785240df-a614-4d8b-a1f4-768400134011";
const PKG_G14_ID    = "fa2904c7-b741-4aad-a716-faf8b78b6183";
const PKG_G16_ID    = "fa6d824c-f270-4ab7-b65e-5c5095c6da69";
const PKG_G18_ID    = "f5787406-15bf-45f3-a98e-c718c86e73cc";

const sensanPackages: PackageRow[] = [
  // 散客房 packages (room_type_ids intentionally EMPTY — this is the real-world shape).
  { id: PKG_DOUBLE_ID, name: "雙人一泊一食", numeric_code: 2001, room_type_ids: [], enabled: true, display_order: 10 },
  { id: PKG_QUAD_ID,   name: "四人一泊一食", numeric_code: 2002, room_type_ids: [], enabled: true, display_order: 11 },
  // 包區 packages (room_type_ids covers the group room).
  { id: PKG_G12_ID, name: "12人包區", numeric_code: 1003, room_type_ids: [SENSAN_G12], enabled: true, display_order: 3 },
  { id: PKG_G14_ID, name: "14人包區", numeric_code: 1004, room_type_ids: [SENSAN_G14], enabled: true, display_order: 4 },
  { id: PKG_G16_ID, name: "16人包區", numeric_code: 1005, room_type_ids: [SENSAN_G16], enabled: true, display_order: 5 },
  { id: PKG_G18_ID, name: "18人包區", numeric_code: 1006, room_type_ids: [SENSAN_G18], enabled: true, display_order: 6 },
];

const sensanTemplatesMapped: TemplateRow[] = [
  { id: "tpl-double", template_name: "一泊一食", room_type_id: SENSAN_DOUBLE, default_package_id: PKG_DOUBLE_ID },
  { id: "tpl-quad",   template_name: "一泊一食", room_type_id: SENSAN_QUAD,   default_package_id: PKG_QUAD_ID },
];

const sensanTemplatesUnmapped: TemplateRow[] = [
  { id: "tpl-double", template_name: "一泊一食", room_type_id: SENSAN_DOUBLE, default_package_id: null },
  { id: "tpl-quad",   template_name: "一泊一食", room_type_id: SENSAN_QUAD,   default_package_id: null },
];

Deno.test("SENSAN 雙人房 (template-based, mapped): RatePlan = packages.numeric_code via default_package_id", () => {
  const plans = buildRatePlansForRoomType(SENSAN_DOUBLE, sensanPackages, sensanTemplatesMapped);
  assertEquals(plans, [{ code: 2001, name: "雙人一泊一食" }]);
});

Deno.test("SENSAN 四人房 (template-based, mapped): RatePlan = packages.numeric_code via default_package_id", () => {
  const plans = buildRatePlansForRoomType(SENSAN_QUAD, sensanPackages, sensanTemplatesMapped);
  assertEquals(plans, [{ code: 2002, name: "四人一泊一食" }]);
});

Deno.test("SENSAN 雙人房/四人房: RatePlanCode must equal package.numeric_code, NEVER template.numeric_code", () => {
  // If a template accidentally carries a numeric_code we would have used pre-fix,
  // the resolver must still return the mapped PACKAGE code (not 9999).
  const tpls: TemplateRow[] = [
    { id: "tpl-double", template_name: "一泊一食", room_type_id: SENSAN_DOUBLE, default_package_id: PKG_DOUBLE_ID },
  ];
  const plans = buildRatePlansForRoomType(SENSAN_DOUBLE, sensanPackages, tpls);
  assertEquals(plans.length, 1);
  assertEquals(plans[0].code, 2001, "must be package.numeric_code, not template code");
});

Deno.test("SENSAN 包區房型: unaffected by template path — still 1 package each (regression guard)", () => {
  for (const [rid, code] of [
    [SENSAN_G12, 1003],
    [SENSAN_G14, 1004],
    [SENSAN_G16, 1005],
    [SENSAN_G18, 1006],
  ] as const) {
    const plans = buildRatePlansForRoomType(rid, sensanPackages, sensanTemplatesMapped);
    assertEquals(plans.map((p) => p.code), [code], `group room ${rid}`);
  }
});

Deno.test("Union path: packages AND matching template resolve to SAME package → deduped once", () => {
  // A room that is BOTH in a package's room_type_ids AND has a template
  // whose default_package_id points to the SAME package. Should appear once.
  const RT = "rt-hybrid";
  const pkgs: PackageRow[] = [
    { id: "p-hybrid", name: "混合", numeric_code: 1500, room_type_ids: [RT], enabled: true, display_order: 1 },
  ];
  const tpls: TemplateRow[] = [
    { id: "tpl", template_name: "含早", room_type_id: RT, default_package_id: "p-hybrid" },
  ];
  const plans = buildRatePlansForRoomType(RT, pkgs, tpls);
  assertEquals(plans, [{ code: 1500, name: "混合" }]);
});

Deno.test("Template with NULL default_package_id: silently skipped in resolver, listed by findTemplateMappingGaps", () => {
  const plans = buildRatePlansForRoomType(SENSAN_DOUBLE, sensanPackages, sensanTemplatesUnmapped);
  // No package covers 散客房 AND template lacks mapping → empty (documented data gap).
  assertEquals(plans, []);
  const gaps = findTemplateMappingGaps(sensanTemplatesUnmapped, sensanPackages);
  assertEquals(gaps.length, 2);
  assertEquals(gaps[0].roomTypeId, SENSAN_DOUBLE);
  assertEquals(gaps[1].roomTypeId, SENSAN_QUAD);
});

Deno.test("Template pointing at a disabled or missing package is reported as a gap", () => {
  const tpls: TemplateRow[] = [
    { id: "t1", template_name: "含早", room_type_id: "rt-x", default_package_id: "pkg-missing" },
    { id: "t2", template_name: "含早", room_type_id: "rt-y", default_package_id: "pkg-disabled" },
  ];
  const pkgs: PackageRow[] = [
    { id: "pkg-disabled", name: "停用", numeric_code: 9000, room_type_ids: [], enabled: false },
  ];
  assertEquals(buildRatePlansForRoomType("rt-x", pkgs, tpls), []);
  assertEquals(buildRatePlansForRoomType("rt-y", pkgs, tpls), []);
  const gaps = findTemplateMappingGaps(tpls, pkgs);
  assertEquals(gaps.length, 2);
});

Deno.test("Yunxiu regression: templates arg does not disturb existing package-only resolution (A1)", () => {
  // Yunxiu A-rooms are covered purely by packages via room_type_ids.
  // Passing an empty/irrelevant templates array must NOT change output.
  const codes = buildRatePlansForRoomType(A1, yunxiuPackages, []).map((p) => p.code);
  assertEquals(codes, [1001, 1003, 1004, 1005, 1006]);
});
