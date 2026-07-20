// Tests for `canEditModule` — regression guard for the "改期" (change-date)
// permission bug where non-admin staff with `orders=editable` were incorrectly
// blocked (server had reverted to "admins only").
//
// These tests exercise the pure authorization logic by injecting a fake
// service-role client whose query builder returns pre-seeded rows for
// `user_roles` and `staff_module_permissions`.
//
// Run with: deno test --allow-net --allow-env

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canEditModule, type AuthContext, type ModuleKey } from "./authz.ts";

interface Seed {
  userRoles: Array<{ user_id: string; accommodation_id: string | null; role: string }>;
  staffPerms: Array<{
    user_id: string;
    accommodation_id: string;
    module_key: string;
    permission_level: "hidden" | "readonly" | "editable";
  }>;
}

// Minimal chainable fake of the supabase-js query builder used by authz.ts.
// Supports .from(table).select(...).eq(col,val)*.in(col,vals)?.maybeSingle()?
function makeAdmin(seed: Seed) {
  function query(table: string) {
    let filters: Array<(row: any) => boolean> = [];
    const source =
      table === "user_roles"
        ? seed.userRoles
        : table === "staff_module_permissions"
        ? seed.staffPerms
        : [];

    const builder: any = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((row) => row[col] === val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push((row) => vals.includes(row[col]));
        return builder;
      },
      async maybeSingle() {
        const rows = source.filter((r) => filters.every((f) => f(r)));
        return { data: rows[0] ?? null, error: null };
      },
      // Awaiting the builder resolves to { data: rows }.
      then(resolve: (v: any) => void, reject: (e: any) => void) {
        try {
          const rows = source.filter((r) => filters.every((f) => f(r)));
          resolve({ data: rows, error: null });
        } catch (e) {
          reject(e);
        }
      },
    };
    return builder;
  }
  return { from: query };
}

function ctxFor(userId: string | null, seed: Seed, opts: {
  isServiceRole?: boolean;
  globalRoles?: string[];
} = {}): AuthContext {
  return {
    admin: makeAdmin(seed) as any,
    userClient: null,
    userId,
    isServiceRole: opts.isServiceRole ?? false,
    globalRoles: opts.globalRoles ?? [],
  };
}

const ACC = "acc-1";
const USER = "user-1";
const ORDERS: ModuleKey = "orders";

Deno.test("service-role short-circuits to allowed", async () => {
  const ctx = ctxFor(null, { userRoles: [], staffPerms: [] }, { isServiceRole: true });
  assertEquals(await canEditModule(ctx, ACC, ORDERS), true);
});

Deno.test("global super_admin is always allowed", async () => {
  const ctx = ctxFor(USER, { userRoles: [], staffPerms: [] }, { globalRoles: ["super_admin"] });
  assertEquals(await canEditModule(ctx, ACC, ORDERS), true);
});

Deno.test("hotel_admin on the accommodation is allowed without a perm row", async () => {
  const ctx = ctxFor(USER, {
    userRoles: [{ user_id: USER, accommodation_id: ACC, role: "hotel_admin" }],
    staffPerms: [],
  });
  assertEquals(await canEditModule(ctx, ACC, ORDERS), true);
});

Deno.test("staff with explicit orders=editable is allowed (改期回歸測試)", async () => {
  const ctx = ctxFor(USER, {
    userRoles: [{ user_id: USER, accommodation_id: ACC, role: "staff" }],
    staffPerms: [
      { user_id: USER, accommodation_id: ACC, module_key: "orders", permission_level: "editable" },
    ],
  });
  assertEquals(await canEditModule(ctx, ACC, ORDERS), true);
});

Deno.test("staff with orders=readonly is blocked", async () => {
  const ctx = ctxFor(USER, {
    userRoles: [{ user_id: USER, accommodation_id: ACC, role: "staff" }],
    staffPerms: [
      { user_id: USER, accommodation_id: ACC, module_key: "orders", permission_level: "readonly" },
    ],
  });
  assertEquals(await canEditModule(ctx, ACC, ORDERS), false);
});

Deno.test("staff with orders=hidden is blocked", async () => {
  const ctx = ctxFor(USER, {
    userRoles: [{ user_id: USER, accommodation_id: ACC, role: "staff" }],
    staffPerms: [
      { user_id: USER, accommodation_id: ACC, module_key: "orders", permission_level: "hidden" },
    ],
  });
  assertEquals(await canEditModule(ctx, ACC, ORDERS), false);
});

Deno.test("staff with NO perm row falls back to default (orders defaults to editable)", async () => {
  // Guards against the previous "admins only" regression: missing perm row
  // must not silently block staff on orders.
  const ctx = ctxFor(USER, {
    userRoles: [{ user_id: USER, accommodation_id: ACC, role: "staff" }],
    staffPerms: [],
  });
  assertEquals(await canEditModule(ctx, ACC, ORDERS), true);
});

Deno.test("non-staff, non-admin role (e.g. closer) is blocked from editing orders", async () => {
  const ctx = ctxFor(USER, {
    userRoles: [{ user_id: USER, accommodation_id: null, role: "closer" }],
    staffPerms: [],
  });
  assertEquals(await canEditModule(ctx, ACC, ORDERS), false);
});

Deno.test("staff on a DIFFERENT accommodation cannot edit this accommodation's orders", async () => {
  const ctx = ctxFor(USER, {
    userRoles: [{ user_id: USER, accommodation_id: "acc-other", role: "staff" }],
    staffPerms: [
      {
        user_id: USER,
        accommodation_id: "acc-other",
        module_key: "orders",
        permission_level: "editable",
      },
    ],
  });
  assertEquals(await canEditModule(ctx, ACC, ORDERS), false);
});

Deno.test("unauthenticated (no userId, no service role) is blocked", async () => {
  const ctx = ctxFor(null, { userRoles: [], staffPerms: [] });
  assertEquals(await canEditModule(ctx, ACC, ORDERS), false);
});

Deno.test("kol_quota default is hidden — staff without explicit editable is blocked", async () => {
  // Sanity check that the default table is respected per module, so a future
  // change to defaults won't silently widen access.
  const ctx = ctxFor(USER, {
    userRoles: [{ user_id: USER, accommodation_id: ACC, role: "staff" }],
    staffPerms: [],
  });
  assertEquals(await canEditModule(ctx, ACC, "kol_quota"), false);
});
