// Member-facing order self-service: cancel / change dates / change guest count.
// Ownership is verified against platform_members.user_id (auth user) -> orders.member_id,
// with a fallback on guest_email matching the authenticated email.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface Body {
  orderNumber: string;
  action: "cancel" | "change_dates" | "change_guests";
  newCheckIn?: string;
  newCheckOut?: string;
  guestCount?: number;
  reason?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.orderNumber || !body?.action) {
      return json({ success: false, message: "缺少必要參數" }, 400, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, message: "請先登入會員" }, 401, corsHeaders);
    }
    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user) return json({ success: false, message: "請先登入會員" }, 401, corsHeaders);

    const { data: member } = await supabase
      .from("platform_members")
      .select("id, email")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: order } = await supabase
      .from("orders")
      .select(
        "id, order_number, member_id, guest_email, guest_count, order_status, payment_status, paid_amount, check_in_date, check_out_date, notes, accommodation_id",
      )
      .eq("order_number", body.orderNumber)
      .maybeSingle();
    if (!order) return json({ success: false, message: "找不到訂單" }, 404, corsHeaders);

    const email = (user.email || member?.email || "").toLowerCase();
    const owns =
      (member?.id && order.member_id === member.id) ||
      (!!email && (order.guest_email || "").toLowerCase() === email);
    if (!owns) return json({ success: false, message: "此訂單不屬於目前登入的會員" }, 403, corsHeaders);

    if (order.order_status === "cancelled") {
      return json({ success: false, message: "此訂單已取消" }, 400, corsHeaders);
    }

    const today = new Date().toISOString().slice(0, 10);
    if (order.check_in_date <= today) {
      return json(
        { success: false, message: "入住日當天或之後無法線上異動，請直接聯繫住宿" },
        400,
        corsHeaders,
      );
    }

    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const appendNote = (line: string) => `${order.notes ? order.notes + "\n" : ""}${line}`;

    if (body.action === "cancel") {
      const needManualRefund = Number(order.paid_amount || 0) > 0;
      const note = appendNote(
        `🔒 ${stamp} 會員於前台自行取消訂單（${email}）${body.reason ? `：${body.reason}` : ""}${
          needManualRefund ? `｜已付款 NT$${Number(order.paid_amount).toLocaleString()}，待人工退款` : ""
        }`,
      );
      const { error } = await supabase
        .from("orders")
        .update({ order_status: "cancelled", notes: note })
        .eq("id", order.id);
      if (error) return json({ success: false, message: error.message }, 500, corsHeaders);
      return json(
        {
          success: true,
          message: needManualRefund ? "訂單已取消，退款將由客服人員協助處理" : "訂單已取消",
        },
        200,
        corsHeaders,
      );
    }

    if (body.action === "change_guests") {
      const n = Number(body.guestCount);
      if (!Number.isInteger(n) || n < 1 || n > 30) {
        return json({ success: false, message: "入住人數不正確" }, 400, corsHeaders);
      }
      const note = appendNote(
        `🔒 ${stamp} 會員自行調整入住人數：${order.guest_count} → ${n}（${email}）`,
      );
      const { error } = await supabase
        .from("orders")
        .update({ guest_count: n, notes: note })
        .eq("id", order.id);
      if (error) return json({ success: false, message: error.message }, 500, corsHeaders);
      return json({ success: true, message: "入住人數已更新" }, 200, corsHeaders);
    }

    // change_dates
    const { newCheckIn, newCheckOut } = body;
    if (!newCheckIn || !newCheckOut || !DATE_RE.test(newCheckIn) || !DATE_RE.test(newCheckOut)) {
      return json({ success: false, message: "日期格式必須為 yyyy-MM-dd" }, 400, corsHeaders);
    }
    if (newCheckOut <= newCheckIn) {
      return json({ success: false, message: "退房日必須晚於入住日" }, 400, corsHeaders);
    }
    if (newCheckIn <= today) {
      return json({ success: false, message: "入住日必須是未來日期" }, 400, corsHeaders);
    }
    if (order.payment_status === "paid") {
      return json(
        { success: false, message: "已付款訂單無法線上改期，請聯繫住宿客服協助" },
        400,
        corsHeaders,
      );
    }
    if (order.check_in_date === newCheckIn && order.check_out_date === newCheckOut) {
      return json({ success: false, message: "新舊日期相同" }, 400, corsHeaders);
    }

    const { error: rpcErr } = await supabase.rpc("change_order_dates", {
      _order_id: order.id,
      _new_check_in: newCheckIn,
      _new_check_out: newCheckOut,
    });
    if (rpcErr) {
      const msg = rpcErr.message || "改期失敗";
      const isInventory = /Inventory exceeded|Room not available|包棟|不能同時成立/i.test(msg);
      return json(
        { success: false, message: isInventory ? "新日期已無空房，請改選其他日期" : msg },
        isInventory ? 409 : 500,
        corsHeaders,
      );
    }

    await supabase
      .from("orders")
      .update({
        notes: appendNote(
          `🔒 ${stamp} 會員自行改期：${order.check_in_date}~${order.check_out_date} → ${newCheckIn}~${newCheckOut}（${email}）`,
        ),
      })
      .eq("id", order.id);

    return json({ success: true, message: "訂單日期已更新" }, 200, corsHeaders);
  } catch (e) {
    return json({ success: false, message: (e as Error).message }, 500, buildCorsHeaders(req));
  }
});
