// 旅客資料匯流（CDP）身分綁定＋交易回填
// POST /functions/v1/traveler-sync
// body: { mode?: "full" | "single", customer_key?: string, email?: string, phone?: string }
// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCustomerKey, normalizeEmail, normalizePhone } from "../_shared/travelerKey.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function fetchAll(admin: any, table: string, columns: string) {
  const out: any[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

interface Draft {
  customer_key: string;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  identities: Map<string, any>;
  orders: any[];
  needs: Set<string>;
  discountCodes: Set<string>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearer !== serviceKey) {
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
      const allowed = (roles ?? []).some((r: any) =>
        ["super_admin", "admin", "hotel_admin"].includes(r.role)
      );
      if (!allowed) return json({ error: "Forbidden" }, 403);
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* 允許空 body */ }
    const mode = body?.mode === "single" ? "single" : "full";
    const targetKey = mode === "single"
      ? (typeof body?.customer_key === "string" && body.customer_key
        ? body.customer_key
        : buildCustomerKey(body?.email, body?.phone))
      : "";
    if (mode === "single" && !targetKey) return json({ error: "single 模式需要 customer_key 或 email/phone" }, 400);

    const drafts = new Map<string, Draft>();
    const getDraft = (key: string): Draft | null => {
      if (!key) return null;
      if (mode === "single" && key !== targetKey) return null;
      let d = drafts.get(key);
      if (!d) {
        d = {
          customer_key: key,
          user_id: null,
          display_name: null,
          email: key.startsWith("email:") ? key.slice(6) : null,
          phone: key.startsWith("phone:") ? key.slice(6) : null,
          identities: new Map(),
          orders: [],
          needs: new Set(),
          discountCodes: new Set(),
        };
        drafts.set(key, d);
      }
      return d;
    };

    // 1) 平台會員
    const members = await fetchAll(admin, "platform_members", "id,user_id,name,email,phone,created_at");
    for (const m of members) {
      const d = getDraft(buildCustomerKey(m.email, m.phone));
      if (!d) continue;
      d.user_id = d.user_id ?? m.user_id ?? null;
      d.display_name = d.display_name ?? m.name ?? null;
      d.email = d.email ?? normalizeEmail(m.email) || d.email;
      d.phone = d.phone ?? normalizePhone(m.phone) || d.phone;
      d.identities.set(`member:${m.id}`, {
        type: "member", ref: m.id, label: m.name ?? m.email ?? "", bound_at: m.created_at ?? null,
      });
    }

    // 2) 既有 CRM 客戶（訪客身分）
    const customers = await fetchAll(
      admin,
      "customers",
      "id,name,email,phone,notes,member_id,accommodation_id,created_at",
    );
    for (const c of customers) {
      const d = getDraft(buildCustomerKey(c.email, c.phone));
      if (!d) continue;
      d.display_name = d.display_name ?? c.name ?? null;
      d.identities.set(`guest:${c.id}`, {
        type: "guest", ref: c.id, label: c.name ?? "", accommodation_id: c.accommodation_id,
        bound_at: c.created_at ?? null,
      });
      if (typeof c.notes === "string" && c.notes.trim()) d.needs.add(c.notes.trim().slice(0, 200));
    }

    // 3) 訂單（交易摘要、折扣碼身分、客製化需求）
    const orders = await fetchAll(
      admin,
      "orders",
      "id,order_number,guest_name,guest_email,guest_phone,final_price,discount_code,order_status,order_date,check_in_date,notes,accommodation_id",
    );
    for (const o of orders) {
      const d = getDraft(buildCustomerKey(o.guest_email, o.guest_phone));
      if (!d) continue;
      d.display_name = d.display_name ?? o.guest_name ?? null;
      d.orders.push(o);
      if (typeof o.notes === "string" && o.notes.trim()) d.needs.add(o.notes.trim().slice(0, 200));
      if (typeof o.discount_code === "string" && o.discount_code.trim()) {
        const code = o.discount_code.trim();
        d.discountCodes.add(code);
        d.identities.set(`discount_code:${code}`, {
          type: "discount_code", ref: code, label: code, bound_at: o.order_date ?? null,
        });
      }
    }

    // 4) 既有檔案（保留人工/AI 標籤，不覆蓋）
    const existing = await fetchAll(admin, "traveler_profiles", "id,customer_key,custom_needs,interest_tags");
    const existingMap = new Map<string, any>(existing.map((e: any) => [e.customer_key, e]));

    const nowIso = new Date().toISOString();
    const rows = Array.from(drafts.values()).map((d) => {
      const valid = d.orders.filter((o) => o.order_status !== "cancelled");
      const total = valid.reduce((s, o) => s + Number(o.final_price || 0), 0);
      const lastOrderAt = valid
        .map((o) => o.order_date || o.check_in_date)
        .filter(Boolean)
        .sort()
        .pop() ?? null;
      const prev = existingMap.get(d.customer_key);
      const prevNeeds: string[] = prev?.custom_needs ?? [];
      const needs = Array.from(new Set([...prevNeeds, ...d.needs])).slice(0, 30);
      return {
        customer_key: d.customer_key,
        user_id: d.user_id,
        display_name: d.display_name,
        email: d.email,
        phone: d.phone,
        bound_identities: Array.from(d.identities.values()),
        custom_needs: needs,
        consumption: {
          total_amount: Math.round(total),
          order_count: valid.length,
          last_order_at: lastOrderAt,
          avg_amount: valid.length ? Math.round(total / valid.length) : 0,
          used_discount_codes: Array.from(d.discountCodes),
        },
        last_synced_at: nowIso,
      };
    });

    let upserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await admin
        .from("traveler_profiles")
        .upsert(chunk, { onConflict: "customer_key" });
      if (error) return json({ error: error.message }, 500);
      upserted += chunk.length;
    }

    return json({
      success: true,
      mode,
      upserted,
      scanned: { members: members.length, customers: customers.length, orders: orders.length },
      synced_at: nowIso,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
