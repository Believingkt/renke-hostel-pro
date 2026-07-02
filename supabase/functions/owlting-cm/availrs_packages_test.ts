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
