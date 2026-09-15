// Phase 2D — Channel Manager authorization matrix.
//
// These tests pin the *authorization gate* used by:
//   owlting-fillup-issue, owlting-selfpush-link, owlting-email-reparse-dates,
//   test-external-rooms-connection
// namely `isAccommodationAdmin` (+ `isSuperAdmin` for the null-accommodation
// self-push case), and prove that Staff with
// `staff_module_permissions.channel_manager = 'editable'` are DENIED.
//
// Run with: deno test --allow-net --allow-env

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canEditModule,
  isAccommodationAdmin,
  isSuperAdmin,
  type AuthContext,
} from "./authz.ts";

const ACC_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACC_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

interface Seed {
  userRoles: Array<{ user_id: string; accommodation_id: string | null; role: string }>;
  staffPerms: Array<{
    user_id: string;
    accommodation_id: string;
    module_key: string;
    permission_level: "hidden" | "readonly" | "editable";
  }>;
}

// deno-lint-ignore no-explicit-any
function makeAdmin(seed: Seed): any {
  function query(table: string) {
    // deno-lint-ignore no-explicit-any
    const filters: Array<(row: any) => boolean> = [];
    const source = table === "user_roles"
      ? seed.userRoles
      : table === "staff_module_permissions"
      ? seed.staffPerms
      : [];
    // deno-lint-ignore no-explicit-any
    const builder: any = {
      select: () => builder,
      eq(col: string, val: unknown) {
        // deno-lint-ignore no-explicit-any
        filters.push((row: any) => row[col] === val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        // deno-lint-ignore no-explicit-any
        filters.push((row: any) => vals.includes(row[col]));
        return builder;
      },
      async maybeSingle() {
        const rows = source.filter((r) => filters.every((f) => f(r)));
        return { data: rows[0] ?? null, error: null };
      },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        try {
          resolve({ data: source.filter((r) => filters.every((f) => f(r))), error: null });
        } catch (e) {
          reject(e);
        }
      },
    };
    return builder;
  }
  return { from: (table: string) => query(table) };
}

function ctxFor(userId: string | null, seed: Seed, opts?: { serviceRole?: boolean }): AuthContext {
  const globalRoles = userId
    ? seed.userRoles.filter((r) => r.user_id === userId).map((r) => r.role)
    : [];
  return {
    admin: makeAdmin(seed),
    userClient: null,
    userId,
    userEmail: null,
    isServiceRole: opts?.serviceRole === true,
    globalRoles,
  };
}

const SEED: Seed = {
  userRoles: [
    { user_id: "super", accommodation_id: ACC_A, role: "super_admin" },
    { user_id: "adminA", accommodation_id: ACC_A, role: "hotel_admin" },
    { user_id: "adminB", accommodation_id: ACC_B, role: "hotel_admin" },
    { user_id: "staffEditable", accommodation_id: ACC_A, role: "staff" },
    { user_id: "staffReadonly", accommodation_id: ACC_A, role: "staff" },
  ],
  staffPerms: [
    { user_id: "staffEditable", accommodation_id: ACC_A, module_key: "channel_manager", permission_level: "editable" },
    { user_id: "staffReadonly", accommodation_id: ACC_A, module_key: "channel_manager", permission_level: "readonly" },
  ],
};

// The gate every Channel Manager maintenance action now uses.
const gate = (ctx: AuthContext, accId: string) => isAccommodationAdmin(ctx, accId);

Deno.test("CASE A — super_admin: all maintenance actions ALLOW", async () => {
  const ctx = ctxFor("super", SEED);
  assertEquals(await gate(ctx, ACC_A), true);
  assertEquals(await gate(ctx, ACC_B), true); // global super_admin override
  assertEquals(isSuperAdmin(ctx), true); // selfpush with null accommodation
});

Deno.test("CASE B — target accommodation hotel_admin: ALLOW", async () => {
  const ctx = ctxFor("adminA", SEED);
  assertEquals(await gate(ctx, ACC_A), true);
});

Deno.test("CASE C — hotel_admin of another accommodation: DENY", async () => {
  const ctx = ctxFor("adminB", SEED);
  assertEquals(await gate(ctx, ACC_A), false);
});

Deno.test("CASE D — staff with channel_manager=editable: DENY (38 legacy rows neutralised)", async () => {
  const ctx = ctxFor("staffEditable", SEED);
  // Legacy gate would have allowed this…
  assertEquals(await canEditModule(ctx, ACC_A, "channel_manager"), true);
  // …the Phase 2D gate does not.
  assertEquals(await gate(ctx, ACC_A), false);
  assertEquals(isSuperAdmin(ctx), false);
});

Deno.test("CASE E — staff readonly: DENY", async () => {
  const ctx = ctxFor("staffReadonly", SEED);
  assertEquals(await gate(ctx, ACC_A), false);
  assertEquals(isSuperAdmin(ctx), false);
});

Deno.test("CASE F — service-role: ALLOW (owlting-email-ingest automation)", async () => {
  const ctx = ctxFor(null, SEED, { serviceRole: true });
  assertEquals(await gate(ctx, ACC_A), true);
  assertEquals(isSuperAdmin(ctx), true);
});

Deno.test("CASE G — selfpush with staging.accommodation_id = null", async () => {
  // Rule: super_admin / service-role ALLOW; hotel_admin and staff DENY.
  assertEquals(isSuperAdmin(ctxFor("super", SEED)), true);
  assertEquals(isSuperAdmin(ctxFor(null, SEED, { serviceRole: true })), true);
  assertEquals(isSuperAdmin(ctxFor("adminA", SEED)), false);
  assertEquals(isSuperAdmin(ctxFor("staffEditable", SEED)), false);
});

Deno.test("CASE I/J — admin test endpoint: anonymous & cross-venue admin DENY", async () => {
  // Anonymous never reaches the gate (resolveCaller → 401); modelled as no userId.
  const anon = ctxFor(null, SEED);
  assertEquals(await gate(anon, ACC_A), false);
  assertEquals(await gate(ctxFor("adminB", SEED), ACC_A), false);
});
