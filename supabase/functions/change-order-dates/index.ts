// Change order check-in/check-out dates.
// - Mode 'kol': KOL 互惠單，須 order_source='kol' 且 payment_status != 'paid'
// - Mode 'general': 一般訂單，須 super_admin / hotel_admin / admin，且 payment_status != 'paid'
// - 使用 SECURITY DEFINER RPC `change_order_dates` 進行原子化庫存重驗
// - KOL 單改期若跨月且新月已滿，須 client 帶 forceKolQuotaOverride=true 才可覆寫

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface Body {
  orderId: string;
  newCheckIn: string; // yyyy-MM-dd
  newCheckOut: string; // yyyy-MM-dd
  mode: "kol" | "general";
  reason?: string;
  forceKolQuotaOverride?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.orderId || !body?.newCheckIn || !body?.newCheckOut || !body?.mode) {
      return json({ success: false, message: "缺少必要參數" }, 400, corsHeaders);
    }
    if (!DATE_RE.test(body.newCheckIn) || !DATE_RE.test(body.newCheckOut)) {
      return json({ success: false, message: "日期格式必須為 yyyy-MM-dd" }, 400, corsHeaders);
    }
    if (body.newCheckOut <= body.newCheckIn) {
      return json({ success: false, message: "退房日必須晚於入住日" }, 400, corsHeaders);
    }
    if (body.mode !== "kol" && body.mode !== "general") {
      return json({ success: false, message: "mode 必須為 kol 或 general" }, 400, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, message: "未授權" }, 401, corsHeaders);
    }
    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userData?.user?.id;
    const userEmail = userData?.user?.email ?? "unknown";
    if (!userId) return json({ success: false, message: "未授權" }, 401, corsHeaders);

    // Load order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        "id, accommodation_id, order_number, order_status, order_source, payment_status, check_in_date, check_out_date, notes",
      )
      .eq("id", body.orderId)
      .maybeSingle();
    if (orderErr || !order) return json({ success: false, message: "找不到訂單" }, 404, corsHeaders);

    if (order.order_status === "cancelled") {
      return json({ success: false, message: "已取消的訂單無法改期" }, 400, corsHeaders);
    }
    if (order.payment_status === "paid") {
      return json({ success: false, message: "已付款訂單無法改期，請先辦理退款" }, 400, corsHeaders);
    }
    if (order.check_in_date === body.newCheckIn && order.check_out_date === body.newCheckOut) {
      return json({ success: false, message: "新舊日期相同" }, 400, corsHeaders);
    }

    // Permission
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("accommodation_id", order.accommodation_id);
    const roles = new Set<string>((roleRows ?? []).map((r: any) => r.role));
    const isAdmin =
      roles.has("super_admin") || roles.has("hotel_admin") || roles.has("admin");

    if (body.mode === "kol") {
      if (order.order_source !== "kol") {
        return json(
          { success: false, message: "此訂單非 KOL 互惠單，不能使用 KOL 改期" },
          400,
          corsHeaders,
        );
      }
      // KOL 改期：任何能存取此訂單的角色皆可（roles 陣列非空即可）
      if (roles.size === 0) {
        return json({ success: false, message: "無權限存取此訂單" }, 403, corsHeaders);
      }
    } else {
      if (!isAdmin) {
        return json({ success: false, message: "僅管理員可改動一般訂單日期" }, 403, corsHeaders);
      }
    }

    // KOL 額度處理（僅當訂單為 KOL 互惠單）
    let kolQuotaOverrideStatus: {
      year_month: string;
      quota: number;
      used: number;
    } | null = null;

    if (order.order_source === "kol") {
      const oldMonth = order.check_in_date.slice(0, 7);
      const newMonth = body.newCheckIn.slice(0, 7);
      if (oldMonth !== newMonth) {
        // 查新月份 quota
        const [quotaRes, countRes] = await Promise.all([
          supabase
            .from("kol_reciprocal_monthly_quotas")
            .select("quota")
            .eq("accommodation_id", order.accommodation_id)
            .eq("year_month", newMonth)
            .maybeSingle(),
          supabase.rpc("count_kol_reciprocal_orders", {
            _accommodation_id: order.accommodation_id,
            _year_month: newMonth,
            _exclude_order_id: order.id,
          }),
        ]);
        const quota = quotaRes.data?.quota ?? null;
        const used = (countRes.data as number | null) ?? 0;
        if (quota != null && used + 1 > quota) {
          if (!body.forceKolQuotaOverride) {
            return json(
              {
                success: false,
                code: "KOL_QUOTA_EXCEEDED",
                message: `${newMonth} KOL 互惠額度已滿 (${used}/${quota})，需確認後強制覆寫`,
                quota_status: { year_month: newMonth, quota, used },
              },
              409,
              corsHeaders,
            );
          }
          kolQuotaOverrideStatus = { year_month: newMonth, quota, used };
        }
      }
    }

    // 呼叫 RPC 執行原子改期
    const { data: rpcData, error: rpcErr } = await supabase.rpc("change_order_dates", {
      _order_id: order.id,
      _new_check_in: body.newCheckIn,
      _new_check_out: body.newCheckOut,
    });

    if (rpcErr) {
      const msg = rpcErr.message || "改期失敗";
      const isInventory = /Inventory exceeded|Room not available|包棟|不能同時成立/i.test(msg);
      return json(
        {
          success: false,
          code: isInventory ? "INVENTORY_CONFLICT" : "RPC_ERROR",
          message: msg,
        },
        isInventory ? 409 : 500,
        corsHeaders,
      );
    }

    // 取得操作者名稱
    let operatorName = userEmail;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.name) operatorName = profile.name;
    } catch (_) {
      /* ignore */
    }

    // Audit log
    const auditDetails: Record<string, unknown> = {
      type: "order_date_change",
      mode: body.mode,
      operator_name: operatorName,
      reason: body.reason ?? null,
      changes: [
        {
          field: "check_in_date",
          label: "入住日期",
          before: order.check_in_date,
          after: body.newCheckIn,
        },
        {
          field: "check_out_date",
          label: "退房日期",
          before: order.check_out_date,
          after: body.newCheckOut,
        },
      ],
    };
    if (kolQuotaOverrideStatus) {
      auditDetails.kol_quota_override = kolQuotaOverrideStatus;
      (auditDetails.changes as any[]).push({
        field: "kol_quota_override",
        label: "KOL 互惠額度覆寫",
        before: `${kolQuotaOverrideStatus.used}/${kolQuotaOverrideStatus.quota}（${kolQuotaOverrideStatus.year_month}）`,
        after: `強制覆寫 (+1)`,
      });
    }

    await supabase.from("audit_logs").insert([
      {
        user_id: userId,
        user_email: userEmail,
        action_type: "update",
        action_category: "order",
        entity_type: "order",
        entity_id: order.id,
        entity_name: order.order_number,
        accommodation_id: order.accommodation_id,
        details: auditDetails,
      },
    ]);

    // 於 notes 追加 🔒 改期紀錄行，供 OrderAuditLogCard 顯示
    try {
      const stamp = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
      const line = `🔒 [${stamp}] 改期：${order.check_in_date} → ${body.newCheckIn}｜${order.check_out_date} → ${body.newCheckOut}｜操作：${operatorName}${body.reason ? `｜備註：${body.reason}` : ""}`;
      const newNotes = order.notes ? `${order.notes}\n${line}` : line;
      await supabase.from("orders").update({ notes: newNotes }).eq("id", order.id);
    } catch (e) {
      console.error("[change-order-dates] append notes failed", e);
    }

    return json(
      {
        success: true,
        data: rpcData,
        kol_quota_override: kolQuotaOverrideStatus,
      },
      200,
      corsHeaders,
    );
  } catch (e: any) {
    console.error("[change-order-dates] fatal", e);
    return json({ success: false, message: e?.message ?? "改期發生未知錯誤" }, 500, corsHeaders);
  }
});
