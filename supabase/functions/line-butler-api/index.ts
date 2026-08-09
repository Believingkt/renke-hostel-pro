/**
 * line-butler-api：供 LIFF 頁面（/liff/checkout、/liff/favorites）讀寫 LINE 管家資料。
 * 不含金流；金流仍由既有 BookingFlow / TapPay / LINE Pay Edge Functions 處理。
 *
 * actions:
 *  - config          取得 LIFF_ID（前端 liff.init 用）
 *  - get_cart        取回 line_sessions.state.cart
 *  - clear_cart      清空暫存購物
 *  - list_favorites  收藏清單
 *  - remove_favorite 移除收藏
 *  - link_member     綁定會員（user_id）並合併 line_user_id 收藏
 *  - mark_order      成單後記錄 order_meta.line_user_id 並推播訂單確認
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { linePush, textMsg } from "../_shared/lineButler.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405, cors);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400, cors);
  }

  const action = String(body.action ?? "");
  const lineUserId = body.line_user_id ? String(body.line_user_id) : null;

  try {
    if (action === "config") {
      return json({ liff_id: Deno.env.get("LIFF_ID") ?? null }, 200, cors);
    }

    if (!lineUserId) return json({ error: "line_user_id required" }, 400, cors);

    if (action === "get_cart") {
      const { data } = await supabase
        .from("line_sessions")
        .select("state, member_user_id")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      // deno-lint-ignore no-explicit-any
      const state = (data?.state as any) ?? {};
      return json({ cart: state.cart ?? [], state, member_user_id: data?.member_user_id ?? null }, 200, cors);
    }

    if (action === "clear_cart") {
      const { data } = await supabase
        .from("line_sessions")
        .select("state")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      // deno-lint-ignore no-explicit-any
      const state = { ...((data?.state as any) ?? {}), cart: [] };
      await supabase.from("line_sessions").update({ state }).eq("line_user_id", lineUserId);
      return json({ ok: true }, 200, cors);
    }

    if (action === "list_favorites") {
      const userId = body.user_id ? String(body.user_id) : null;
      const query = supabase
        .from("trip_favorites")
        .select("id, ref_type, ref_id, meta, created_at, user_id, line_user_id")
        .order("created_at", { ascending: false });
      const { data } = userId
        ? await query.or(`line_user_id.eq.${lineUserId},user_id.eq.${userId}`)
        : await query.eq("line_user_id", lineUserId);
      return json({ favorites: data ?? [] }, 200, cors);
    }

    if (action === "remove_favorite") {
      const id = String(body.id ?? "");
      if (!id) return json({ error: "id required" }, 400, cors);
      await supabase.from("trip_favorites").delete().eq("id", id).eq("line_user_id", lineUserId);
      return json({ ok: true }, 200, cors);
    }

    if (action === "link_member") {
      const userId = body.user_id ? String(body.user_id) : null;
      if (!userId) return json({ error: "user_id required" }, 400, cors);
      await supabase
        .from("line_sessions")
        .upsert({ line_user_id: lineUserId, member_user_id: userId }, { onConflict: "line_user_id" });
      await supabase
        .from("trip_favorites")
        .update({ user_id: userId })
        .eq("line_user_id", lineUserId)
        .is("user_id", null);
      return json({ ok: true }, 200, cors);
    }

    if (action === "mark_order") {
      const orderId = String(body.order_id ?? "");
      if (!orderId) return json({ error: "order_id required" }, 400, cors);
      await supabase
        .from("order_meta")
        .upsert({ order_id: orderId, line_user_id: lineUserId }, { onConflict: "order_id" });

      const { data: order } = await supabase
        .from("orders")
        .select("order_number, check_in_date, check_out_date, final_price")
        .eq("id", orderId)
        .maybeSingle();

      const token = Deno.env.get("LINE_BUTLER_ACCESS_TOKEN") ?? Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
      if (token && order) {
        await linePush(token, lineUserId, [
          textMsg(
            `訂房成功囉 🎉 訂單編號 ${order.order_number}\n${order.check_in_date} → ${order.check_out_date}\n金額 NT$ ${Number(
              order.final_price ?? 0,
            ).toLocaleString("en-US")}，期待與你相見 🧸`,
          ),
        ]);
      }
      return json({ ok: true }, 200, cors);
    }

    return json({ error: "unknown action" }, 400, cors);
  } catch (e) {
    console.error("[line-butler-api]", e);
    return json({ error: String(e) }, 500, cors);
  }
});
