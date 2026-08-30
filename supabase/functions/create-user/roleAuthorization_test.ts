import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizeRoleGrant } from "./roleAuthorization.ts";

const superAdmin = {
  isServiceRole: false,
  isSuperAdmin: true,
  isTargetAccommodationAdmin: true,
};
const targetHotelAdmin = {
  isServiceRole: false,
  isSuperAdmin: false,
  isTargetAccommodationAdmin: true,
};
// hotel_admin of a DIFFERENT accommodation: isAccommodationAdmin(target) === false
const otherHotelAdmin = {
  isServiceRole: false,
  isSuperAdmin: false,
  isTargetAccommodationAdmin: false,
};
const staffCaller = {
  isServiceRole: false,
  isSuperAdmin: false,
  isTargetAccommodationAdmin: false,
};
const serviceRole = {
  isServiceRole: true,
  isSuperAdmin: false,
  isTargetAccommodationAdmin: false,
};

// CASE A — super_admin caller may grant super_admin
Deno.test("A: super_admin can grant super_admin", () => {
  assertEquals(authorizeRoleGrant("super_admin", superAdmin).allowed, true);
});

// CASE B — target-accommodation hotel_admin forging role=super_admin is denied
Deno.test("B: hotel_admin cannot grant super_admin (forged request)", () => {
  const d = authorizeRoleGrant("super_admin", targetHotelAdmin);
  assertEquals(d.allowed, false);
  if (!d.allowed) {
    assertEquals(d.status, 403);
    assertEquals(d.error, "此操作僅限超級管理員");
  }
});

// CASE C — hotel_admin of another accommodation cannot grant super_admin
Deno.test("C: cross-accommodation hotel_admin cannot grant super_admin", () => {
  const d = authorizeRoleGrant("super_admin", otherHotelAdmin);
  assertEquals(d.allowed, false);
  if (!d.allowed) assertEquals(d.status, 403);
});

// CASE D — staff cannot grant super_admin
Deno.test("D: staff cannot grant super_admin", () => {
  assertEquals(authorizeRoleGrant("super_admin", staffCaller).allowed, false);
});

// CASE F — hotel_admin can still create staff on their own accommodation
Deno.test("F: hotel_admin can grant staff on own accommodation", () => {
  assertEquals(authorizeRoleGrant("staff", targetHotelAdmin).allowed, true);
});

// CASE G — existing contract: hotel_admin may grant hotel_admin on own accommodation
Deno.test("G: hotel_admin can grant hotel_admin on own accommodation", () => {
  assertEquals(authorizeRoleGrant("hotel_admin", targetHotelAdmin).allowed, true);
});

// CASE H — cross-accommodation staff creation is denied
Deno.test("H: hotel_admin cannot grant staff on another accommodation", () => {
  const d = authorizeRoleGrant("staff", otherHotelAdmin);
  assertEquals(d.allowed, false);
  if (!d.allowed) {
    assertEquals(d.status, 403);
    assertEquals(d.error, "需要管理員權限");
  }
});

// super_admin regression on normal roles
Deno.test("super_admin can still grant hotel_admin and staff", () => {
  assertEquals(authorizeRoleGrant("hotel_admin", superAdmin).allowed, true);
  assertEquals(authorizeRoleGrant("staff", superAdmin).allowed, true);
});

// trusted backend
Deno.test("service-role caller is allowed", () => {
  assertEquals(authorizeRoleGrant("super_admin", serviceRole).allowed, true);
});

// unknown / high-privilege roles are never grantable through this endpoint
Deno.test("unknown roles are denied even for super_admin", () => {
  for (const role of ["admin", "finance", "am_manager", "scout_manager", "closer_manager", ""]) {
    assertEquals(authorizeRoleGrant(role, superAdmin).allowed, false, role);
  }
});

// error messages must not leak internals
Deno.test("error messages do not leak caller or policy detail", () => {
  const d = authorizeRoleGrant("super_admin", targetHotelAdmin);
  if (!d.allowed) {
    for (const leak of ["user_id", "service", "role_id", "policy", "uuid"]) {
      assertEquals(d.error.toLowerCase().includes(leak), false, leak);
    }
  }
});
