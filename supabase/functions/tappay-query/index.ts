import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

/**
 * 安全強化（Wave 6-A）：
 * 此端點供付款回跳頁面（用戶可能尚未登入）查詢交易狀態。
 * 為避免任意人用枚舉 rec_trade_id 探查 TapPay 帳號狀態，加上以下保護：
 *   1. recTradeId 必須在我方 orders.notes 內找得到對應訂單（綁定我方資料）
 *   2. 回傳僅暴露最小必要欄位（不含 auth_code / bank_transaction_id）
 *   3. 簡易 in-memory rate limit（每 IP 每分鐘 20 次）
 */

const RATE_LIMIT_PER_MINUTE = 20;
const ipRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = ipRateLimit.get(ip);
  if (!rec || now > rec.resetAt) {
    ipRateLimit.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (rec.count >= RATE_LIMIT_PER_MINUTE) return false;
  rec.count++;
  return true;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, message: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ success: false, message: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const recTradeId = typeof body?.recTradeId === "string" ? body.recTradeId.trim() : "";

    // Validate input format (TapPay rec_trade_id 通常是英數字，限制長度避免注入)
    if (!recTradeId || recTradeId.length < 8 || recTradeId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(recTradeId)) {
      return new Response(
        JSON.stringify({ success: false, message: "缺少或不合法的交易編號" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: 確認此 rec_trade_id 屬於我方訂單，避免外部濫用查詢任意交易
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: matchedOrder } = await supabase
      .from("orders")
      .select("id, order_number")
      .ilike("notes", `%${recTradeId}%`)
      .maybeSingle();

    if (!matchedOrder) {
      // 不洩漏「找不到訂單」與「未授權」的差異
      return new Response(
        JSON.stringify({ success: false, message: "查無此交易" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
    if (!partnerKey) {
      console.error("[tappay-query] TAPPAY_PARTNER_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, message: "付款服務暫時無法使用" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Call TapPay Record API
    const response = await fetch("https://prod.tappaysdk.com/tpc/transaction/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": partnerKey,
      },
      body: JSON.stringify({
        partner_key: partnerKey,
        filters: { rec_trade_id: recTradeId },
      }),
    });

    const result = await response.json();

    // status: 0 = success with more, 2 = success end of list
    if (result.status !== 0 && result.status !== 2) {
      return new Response(
        JSON.stringify({ success: false, message: "查詢失敗" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const record = result.trade_records?.[0];
    if (!record) {
      return new Response(
        JSON.stringify({ success: false, message: "找不到交易記錄" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isSuccess = record.record_status === 0 || record.record_status === 1;

    // Step 3: 回傳必要欄位（recTradeId/authCode 為下游 complete-3ds-booking 所需）
    // 已綁定我方訂單，且 rec_trade_id 是用戶自己傳入的，不算新增資訊洩漏
    return new Response(
      JSON.stringify({
        success: true,
        paymentSuccess: isSuccess,
        recTradeId: record.rec_trade_id,
        bankTransactionId: record.bank_transaction_id,
        orderNumber: matchedOrder.order_number,
        amount: record.amount,
        status: record.record_status,
        authCode: record.auth_code,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[tappay-query] Error:", error);
    return new Response(
      JSON.stringify({ success: false, message: "查詢失敗" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
