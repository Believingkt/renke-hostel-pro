// Shared authorization helper for edge functions.
//
// Rationale: many edge functions historically hard-coded a
//   `role in ('super_admin', 'hotel_admin')`
// check, which incorrectly blocks `staff` users who have been granted
// `editable` on the relevant module via `staff_module_permissions`.
//
// Use these helpers so authorization stays consistent with the frontend
// `useStaffPermissions` hook and the sidebar module keys defined in
// `src/constants/staffPermissions.ts`.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

export type ModuleKey =
  | "analytics"
  | "reception"
  | "orders"
  | "kol_quota"
  | "website_content"
  | "pricing"
  | "room_price"
  | "customers"
  | "discount_codes"
  | "settlement"
  | "owner_settlement"
  | "addon_center"
  | "channel_manager"
  | "ai_training"
  | "accounts";

const DEFAULT_STAFF_PERMISSIONS: Record<ModuleKey, "hidden" | "readonly" | "editable"> = {
  orders: "editable",
  kol_quota: "hidden",
  reception: "editable",
  room_price: "editable",
  customers: "editable",
  analytics: "readonly",
  discount_codes: "readonly",
  settlement: "readonly",
  owner_settlement: "hidden",
  addon_center: "editable",
  website_content: "hidden",
  pricing: "hidden",
  channel_manager: "hidden",
  ai_training: "hidden",
  accounts: "hidden",
};

export interface AuthContext {
  admin: any; // service-role client
  userClient: any; // user-scoped client (nullable when service-role call)
  userId: string | null;
  userEmail: string | null;
  isServiceRole: boolean;
  globalRoles: string[]; // roles across all accommodations
}

/**
 * Resolve caller identity from the request. Returns `null` for `userId` when
 * the caller is service-role (server-to-server), so downstream checks can
 * short-circuit.
 */
export async function resolveCaller(req: Request): Promise<
  | { ok: true; ctx: AuthContext }
  | { ok: false; status: number; error: string }
> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return { ok: false, status: 500, error: "Supabase env not configured" };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = !!bearer && bearer === serviceKey;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  if (isServiceRole) {
    return {
      ok: true,
      ctx: { admin, userClient: null, userId: null, userEmail: null, isServiceRole: true, globalRoles: [] },
    };
  }

  if (!authHeader) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: roleData } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  const globalRoles = (roleData ?? []).map((r: any) => r.role as string);

  return {
    ok: true,
    ctx: {
      admin,
      userClient,
      userId: userData.user.id,
      userEmail: userData.user.email ?? null,
      isServiceRole: false,
      globalRoles,
    },
  };
}

/**
 * Returns true when the caller is `super_admin` on any accommodation. This is
 * a global override for cross-tenant maintenance operations.
 */
export function isSuperAdmin(ctx: AuthContext): boolean {
  return ctx.isServiceRole || ctx.globalRoles.includes("super_admin");
}

/**
 * Returns true when the caller has `super_admin` or `hotel_admin` on the given
 * accommodation (or is super_admin globally / service-role).
 */
export async function isAccommodationAdmin(
  ctx: AuthContext,
  accommodationId: string,
): Promise<boolean> {
  if (ctx.isServiceRole) return true;
  if (!ctx.userId) return false;
  if (ctx.globalRoles.includes("super_admin")) return true;
  const { data } = await ctx.admin
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("accommodation_id", accommodationId)
    .in("role", ["super_admin", "hotel_admin"]);
  return (data ?? []).length > 0;
}

/**
 * Returns true when the caller is authorized to *edit* the given module for
 * the given accommodation. This matches the frontend permission model:
 *   - super_admin / hotel_admin on the accommodation → always allowed
 *   - staff on the accommodation → allowed iff
 *     staff_module_permissions.permission_level === 'editable'
 *     (falling back to DEFAULT_STAFF_PERMISSIONS if no row exists)
 */
export async function canEditModule(
  ctx: AuthContext,
  accommodationId: string,
  moduleKey: ModuleKey,
): Promise<boolean> {
  if (ctx.isServiceRole) return true;
  if (!ctx.userId) return false;
  if (ctx.globalRoles.includes("super_admin")) return true;

  const { data: roleRows } = await ctx.admin
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("accommodation_id", accommodationId);
  const roles = (roleRows ?? []).map((r: any) => r.role as string);

  if (roles.includes("super_admin") || roles.includes("hotel_admin")) return true;
  if (!roles.includes("staff")) return false;

  const { data: perm } = await ctx.admin
    .from("staff_module_permissions")
    .select("permission_level")
    .eq("user_id", ctx.userId)
    .eq("accommodation_id", accommodationId)
    .eq("module_key", moduleKey)
    .maybeSingle();
  const level = (perm?.permission_level as string | undefined)
    ?? DEFAULT_STAFF_PERMISSIONS[moduleKey]
    ?? "hidden";
  return level === "editable";
}

/**
 * Utility that returns a Response with the given error / status and standard
 * JSON headers. Convenience for the "if (!allowed) return ..." pattern.
 */
export function forbiddenResponse(
  corsHeaders: Record<string, string>,
  message = "Forbidden",
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function unauthorizedResponse(
  corsHeaders: Record<string, string>,
  message = "Unauthorized",
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
