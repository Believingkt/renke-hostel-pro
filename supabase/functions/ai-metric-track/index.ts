// 公開事件端點：防灌數據（event_type 白名單、ref_id 存在性驗證、去重/限流），
// 後台登入者/測試帳號標為 is_internal。回應快速、fire-and-forget。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { writeMetric, METRIC_EVENTS } from "../_shared/metric.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  try {
    const body = await req.json().catch(() => ({}));
    const eventType = String(body?.event_type ?? "");
    if (!METRIC_EVENTS.has(eventType)) {
      return new Response(JSON.stringify({ ok: false, reason: "unknown_event" }), { status: 200, headers: cors });
    }

    // is_internal：只有「後台員工角色」才算內部；一般會員（有登入但無後台角色）與未登入一律 false。
    const INTERNAL_STAFF_ROLES = ["super_admin", "admin", "hotel_admin", "staff", "finance", "am", "am_manager", "venue_manager"];
    let isInternal = false;
    const authz = req.headers.get("authorization") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (token && token !== anonKey) {
      const { data } = await admin.auth.getUser(token);
      if (data?.user) {
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
        isInternal = (roles ?? []).some((r: any) => INTERNAL_STAFF_ROLES.includes(r.role));
      }
    }

    // ref_id 存在性驗證（未知 ref_type 不阻擋，但 trip/product 需存在）
    const refType = body?.ref_type ? String(body.ref_type) : null;
    const refId = body?.ref_id ? String(body.ref_id) : null;
    if (refId && refType === "product") {
      const { count } = await admin.from("trip_products").select("id", { head: true, count: "exact" }).eq("id", refId);
      if (!count) {
        const { count: c2 } = await admin.from("addon_settings").select("id", { head: true, count: "exact" }).eq("id", refId);
        if (!c2) return new Response(JSON.stringify({ ok: false, reason: "ref_not_found" }), { status: 200, headers: cors });
      }
    }

    const ok = await writeMetric(admin, {
      event_type: eventType,
      accommodation_id: body?.accommodation_id ?? null,
      ref_type: refType,
      ref_id: refId,
      channel: body?.channel === "line" || body?.channel === "email" ? body.channel : "web",
      session_key: body?.session_key ? String(body.session_key).slice(0, 80) : null,
      line_user_id: body?.line_user_id ? String(body.line_user_id).slice(0, 80) : null,
      is_internal: isInternal,
      metadata: typeof body?.metadata === "object" && body.metadata ? body.metadata : {},
    });
    return new Response(JSON.stringify({ ok }), { status: 200, headers: cors });
  } catch (e) {
    console.warn("[ai-metric-track] error", e);
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers: cors });
  }
});
