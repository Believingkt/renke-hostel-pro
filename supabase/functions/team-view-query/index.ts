// 管理員「檢視其他成員 TeamHome」用的唯讀查詢代理。
//
// 背景：TeamHome 的獎金試算全部在前端以使用者身分查表，受 RLS 限制，
// 管理員無法代看其他成員的數字（orders / accommodation_info 等政策不涵蓋一般 admin）。
// 這支函式以 service role 執行相同的查詢，但：
//   1. 只接受 super_admin / admin（全域角色）呼叫
//   2. 只允許白名單資料表
//   3. 只允許唯讀的查詢方法（沒有 insert / update / delete / rpc）
//
// 前端以 src/lib/teamViewClient.ts 的 proxy client 送出「查詢鏈」JSON，
// 這裡原樣重放，確保與前端既有計算邏輯完全一致（不重寫任何獎金公式）。

// deno-lint-ignore-file no-explicit-any
import { resolveCaller } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** 只允許 TeamHome 試算會用到的資料表，且一律唯讀 */
const ALLOWED_TABLES = new Set<string>([
  "team_member_profiles",
  "user_roles",
  "scout_discount_codes",
  "orders",
  "order_meta",
  "closer_team_bonus_settings",
  "closer_team_bonus_distribution",
  "kol_profiles",
  "kol_venues",
  "scout_tier_settings",
  "scout_rarity_settings",
  "kol_rarity_settings",
  "scout_salary_settings",
  "scout_team_targets",
  "franchise_orders",
  "franchise_external_orders",
  "starlink_orders",
  "accommodation_info",
  "bonus_multiplier_settings",
  "teamcommission_bonus_rate_settings",
  "teamcommission_role_bindings",
  "teamcommission_shared_revenue_source_whitelist",
  "teamcommission_kol_revenue_source_whitelist",
  "teamcommission_venue_closing_assignments",
  "owner_settlement_pricing_rules",
  "closer_commission_snapshots",
  "closer_commission_adjustments",
  "teamcommission_bonus_snapshots",
  "accommodation_partnership_periods",
  "scout_discount_code_payouts",
  "team_base_salaries",
]);

/** 只允許 PostgREST 唯讀的鏈式方法 */
const ALLOWED_FILTERS = new Set<string>([
  "select",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "not",
  "or",
  "contains",
  "overlaps",
  "order",
  "limit",
  "range",
]);

const TERMINALS = new Set<string>(["maybeSingle", "single"]);

interface Op {
  fn: string;
  args: unknown[];
}

/** 主管可向下檢視的角色範圍 */
const MANAGER_SCOPES: Record<string, string[]> = {
  am_manager: ["am", "am_manager"],
  scout_manager: ["scout", "scout_manager"],
  closer_manager: ["closer", "closer_manager"],
  franchise_manager: ["franchise", "franchise_internal", "franchise_external", "franchise_manager"],
};

/** 主管列成員清單時只允許讀這兩張表 */
const ROSTER_TABLES = new Set<string>(["team_member_profiles", "user_roles"]);

async function runOne(admin: any, table: string, ops: Op[]) {
  if (!ALLOWED_TABLES.has(table)) {
    return { data: null, error: { message: `Table not allowed: ${table}` } };
  }
  if (ops.length === 0 || ops.length > 30) {
    return { data: null, error: { message: "Invalid ops" } };
  }

  let query: any = admin.from(table);
  let terminal: string | null = null;

  for (const op of ops) {
    const fn = String(op?.fn ?? "");
    const args = Array.isArray(op?.args) ? op.args : [];
    if (TERMINALS.has(fn)) {
      terminal = fn;
      continue;
    }
    if (!ALLOWED_FILTERS.has(fn)) {
      return { data: null, error: { message: `Method not allowed: ${fn}` } };
    }
    if (typeof query[fn] !== "function") {
      return { data: null, error: { message: `Method unavailable: ${fn}` } };
    }
    query = query[fn](...args);
  }

  if (terminal === "maybeSingle") query = query.maybeSingle();
  else if (terminal === "single") query = query.single();

  const { data, error } = await query;
  if (error) return { data: null, error: { message: error.message } };
  return { data: data ?? null, error: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authRes = await resolveCaller(req);
    if (!authRes.ok) return json({ error: authRes.error }, authRes.status);
    const ctx = authRes.ctx;

    const roles = ctx.globalRoles ?? [];
    const isAdminViewer =
      ctx.isServiceRole || roles.includes("super_admin") || roles.includes("admin");
    const managerScope = Array.from(
      new Set(roles.flatMap((r) => MANAGER_SCOPES[r] ?? [])),
    );
    if (!isAdminViewer && managerScope.length === 0) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({} as any));
    const viewUserId = typeof body?.viewUserId === "string" ? body.viewUserId : null;

    const rawBatch: Array<{ table: string; ops: Op[] }> = Array.isArray(body?.batch)
      ? body.batch
      : [{ table: String(body?.table ?? ""), ops: Array.isArray(body?.ops) ? body.ops : [] }];

    if (rawBatch.length === 0 || rawBatch.length > 12) {
      return json({ error: "Invalid batch" }, 400);
    }

    // 底薪僅限總部管理員檢視
    if (!isAdminViewer && rawBatch.some((b) => String(b?.table ?? "") === "team_base_salaries")) {
      return json({ error: "Forbidden" }, 403);
    }

    // 非全域管理員（各組主管）：只能檢視自己或所屬組別的成員資料
    if (!isAdminViewer) {
      const rosterOnly = rawBatch.every((b) => ROSTER_TABLES.has(String(b?.table ?? "")));
      if (!rosterOnly) {
        if (!viewUserId) return json({ error: "Forbidden" }, 403);
        if (viewUserId !== ctx.userId) {
          const { data: targetRoles } = await ctx.admin
            .from("user_roles")
            .select("role")
            .eq("user_id", viewUserId);
          const tRoles = (targetRoles ?? []).map((r: any) => String(r.role));
          const allowed = tRoles.some((r) => managerScope.includes(r));
          if (!allowed) return json({ error: "Forbidden" }, 403);
        }
      }
    }

    const results = await Promise.all(
      rawBatch.map((b) =>
        runOne(ctx.admin, String(b?.table ?? ""), Array.isArray(b?.ops) ? b.ops : []),
      ),
    );

    // 舊格式（單筆 table/ops）相容：同時回傳 data/error
    if (!Array.isArray(body?.batch)) {
      return json({ ...results[0], results }, 200);
    }
    return json({ results }, 200);
  } catch (e) {
    return json({ data: null, error: { message: String((e as Error)?.message ?? e) } }, 200);
  }
});

