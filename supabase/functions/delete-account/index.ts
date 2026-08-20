// 會員自助刪除帳號（Apple Guideline 5.1.1）
// 由已登入的會員本人呼叫，使用 service role 進行去識別化與 auth 帳號刪除。
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const DELETED_NAME = "已刪除會員";

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ success: false, error: "未登入" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) return json({ success: false, error: "登入狀態已失效，請重新登入" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const userId = user.id;

    // 找出會員資料
    const { data: member } = await admin
      .from("platform_members")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const memberId: string | null = member?.id ?? null;
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); // 台北日期

    // 1) 檢查是否有未來即將入住的有效訂單
    if (memberId) {
      const { data: upcoming, error: upErr } = await admin
        .from("orders")
        .select("order_number, check_in_date")
        .eq("member_id", memberId)
        .neq("order_status", "cancelled")
        .gte("check_in_date", today)
        .order("check_in_date", { ascending: true })
        .limit(5);
      if (upErr) throw upErr;
      if (upcoming && upcoming.length > 0) {
        return json(
          {
            success: false,
            code: "UPCOMING_ORDERS",
            error: "您仍有即將入住的訂單，請先取消訂單或聯絡客服後再刪除帳號。",
            orders: upcoming,
          },
          409
        );
      }
    }

    const touched: string[] = [];

    if (memberId) {
      // 2) 刪除會員專屬資料（點數、優惠券、收藏、瀏覽、常用資訊、卡片）
      const hardDeletes: Array<[string, string]> = [
        ["member_point_transactions", "member_id"],
        ["member_points", "member_id"],
        ["member_coupon_distributions", "member_id"],
        ["member_favorites", "member_id"],
        ["member_recent_views", "member_id"],
        ["member_common_info", "member_id"],
        ["member_saved_cards", "member_id"],
      ];
      for (const [table, col] of hardDeletes) {
        const { error } = await admin.from(table).delete().eq(col, memberId);
        if (error) console.error(`delete ${table} failed`, error.message);
        else touched.push(table);
      }

      // 3) 訂單去識別化（依法令保留交易紀錄，但移除個資與會員連結）
      const { error: ordErr } = await admin
        .from("orders")
        .update({
          guest_name: DELETED_NAME,
          guest_email: null,
          guest_phone: null,
          guest_address: null,
          member_id: null,
        })
        .eq("member_id", memberId);
      if (ordErr) console.error("anonymize orders failed", ordErr.message);
      else touched.push("orders(去識別化)");

      // 4) 顧客名單去識別化
      const { error: custErr } = await admin
        .from("customers")
        .update({ name: DELETED_NAME, email: null, phone: null, member_id: null })
        .eq("member_id", memberId);
      if (custErr) console.error("anonymize customers failed", custErr.message);
      else touched.push("customers(去識別化)");

      // 5) 會員主檔去識別化（保留 id 以維持歷史關聯完整性）
      const { error: memErr } = await admin
        .from("platform_members")
        .update({
          name: DELETED_NAME,
          email: `deleted+${memberId}@deleted.lakeze.com`,
          phone: null,
          avatar_url: null,
          address: null,
          gender: null,
          nationality: null,
        })
        .eq("id", memberId);
      if (memErr) console.error("anonymize platform_members failed", memErr.message);
      else touched.push("platform_members(去識別化)");
    }

    // 6) 刪除推播裝置 token
    const { error: devErr } = await admin.from("device_tokens").delete().eq("user_id", userId);
    if (devErr) console.error("delete device_tokens failed", devErr.message);
    else touched.push("device_tokens");

    // 7) 刪除 auth 帳號
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error("deleteUser failed", delErr.message);
      return json({ success: false, error: "刪除帳號失敗，請聯絡客服" }, 500);
    }
    touched.push("auth.users");

    console.log("account deleted", { userId, memberId, touched });
    return json({ success: true, touched });
  } catch (e) {
    console.error("delete-account error", e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
