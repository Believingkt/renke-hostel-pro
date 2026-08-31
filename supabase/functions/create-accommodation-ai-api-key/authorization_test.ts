// Authorization contract tests for create-accommodation-ai-api-key.
// Contract: ONLY super_admin may create an AI API key. Accommodation access
// (hotel_admin / staff) must never grant this ability.
//
// These tests exercise the pure authorization predicate that mirrors the
// edge function branch: a `user_roles` lookup for role = 'super_admin'.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type RoleRow = { user_id: string; accommodation_id: string | null; role: string };

/** Mirrors the edge function's authorization branch (fail-closed). */
function isAuthorized(userId: string | null, roles: RoleRow[]): boolean {
  if (!userId) return false; // missing auth / invalid JWT
  return roles.some((r) => r.user_id === userId && r.role === "super_admin");
}

const ACC = "11111111-1111-4111-8111-111111111111";
const OTHER_ACC = "22222222-2222-4222-8222-222222222222";
const U = "user-1";

Deno.test("CASE A: super_admin is allowed", () => {
  assertEquals(isAuthorized(U, [{ user_id: U, accommodation_id: null, role: "super_admin" }]), true);
});

Deno.test("CASE B: pure hotel_admin with target accommodation access is denied", () => {
  assertEquals(isAuthorized(U, [{ user_id: U, accommodation_id: ACC, role: "hotel_admin" }]), false);
});

Deno.test("CASE C: ordinary staff with target accommodation access is denied", () => {
  assertEquals(isAuthorized(U, [{ user_id: U, accommodation_id: ACC, role: "staff" }]), false);
});

Deno.test("CASE D: finance is denied", () => {
  assertEquals(isAuthorized(U, [{ user_id: U, accommodation_id: null, role: "finance" }]), false);
});

Deno.test("CASE E: unrelated authenticated user is denied", () => {
  assertEquals(isAuthorized(U, []), false);
});

Deno.test("CASE F: anon / missing auth is denied", () => {
  assertEquals(isAuthorized(null, [{ user_id: U, accommodation_id: null, role: "super_admin" }]), false);
});

Deno.test("CASE G: super_admin with arbitrary valid target accommodation is allowed", () => {
  const roles: RoleRow[] = [{ user_id: U, accommodation_id: OTHER_ACC, role: "super_admin" }];
  assertEquals(isAuthorized(U, roles), true);
});

Deno.test("team roles (closer / scout) are denied even with accommodation rows", () => {
  assertEquals(isAuthorized(U, [{ user_id: U, accommodation_id: ACC, role: "closer" }]), false);
  assertEquals(isAuthorized(U, [{ user_id: U, accommodation_id: ACC, role: "scout_manager" }]), false);
});

Deno.test("source guard: no accommodation-access authorization remains in the function", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(src.includes("user_has_access_to_accommodation"), false);
  assertEquals(src.includes("is_admin_or_super"), false);
  assertEquals(src.includes('.eq("role", "super_admin")'), true);
  // authorization must precede key generation and DB insert
  const authIdx = src.indexOf('.eq("role", "super_admin")');
  assertEquals(authIdx > -1 && authIdx < src.indexOf("generateKey()"), true);
  assertEquals(authIdx < src.indexOf("accommodation_ai_api_keys"), true);
});
