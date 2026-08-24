// 團購信用卡付款保留「主動放棄」（Phase F2-D 補強）
//
// 用途：客人明確表示要修改訂房內容（日期／方案／間數）或放棄付款時，
// 立即安全釋放尚未開始付款的 Draft Hold，讓房況馬上回到可售狀態。
//
// 安全原則：
//   1. 只碰 group_buy_payment_drafts 與 group_buy_payment_events；不碰 orders、不退款、不呼叫 TapPay。
//   2. 一律以「原子條件式狀態轉換」執行：UPDATE ... WHERE status='pending' AND converted_order_id IS NULL
//      AND rec_trade_id IS NULL。0 rows 代表付款已開始／已完成，直接拒絕釋放，絕不覆蓋。
//   3. 身分驗證：draftId + 電話後四碼。
//   4. Idempotent：已是 cancelled 且為本人者回 released:true（already:true），不重覆寫 event。
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const FN = "group-buy-release-payment-draft";

/** 已進入付款生命週期後段：一律禁止前台釋放 */
const BLOCKED_STATUSES = ["payment_processing", "paid", "converted", "manual_review"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

const ipMap = new Map<string, { n: number; reset: number }>();
function rateOk(ip: string) {
  const now = Date.now();
  const rec = ipMap.get(ip);
  if (!rec || now > rec.reset) {
    ipMap.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  if (rec.n >= 20) return false;
  rec.n++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateOk(ip)) return json({ error: "操作過於頻繁，請稍後再試" }, 429);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const draftId = String(body.draftId ?? "").trim();
    const phoneLast4 = digits(body.phoneLast4).slice(-4);
    const reason = String(body.reason ?? "customer_abandoned_payment").trim().slice(0, 60);

    if (!draftId) return json({ error: "缺少付款保留資料" }, 400);
    if (phoneLast4.length !== 4) return json({ error: "請提供聯絡電話後四碼" }, 400);

    const { data: draft } = await admin
      .from("group_buy_payment_drafts")
      .select("id, campaign_id, status, guest_phone, guest_name, expires_at, amount_to_charge, converted_order_id, rec_trade_id")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || digits(draft.guest_phone).slice(-4) !== phoneLast4) {
      return json({ released: false, reason: "not_found" }, 404);
    }

    const status = String(draft.status ?? "");

    // Idempotent：已釋放／已逾時 → 直接回成功，不再寫 event
    if (status === "cancelled" || status === "expired") {
      return json({ released: true, already: true, status });
    }

    if (BLOCKED_STATUSES.includes(status) || draft.converted_order_id) {
      return json({
        released: false,
        reason: draft.converted_order_id || status === "converted"
          ? "converted"
          : status === "manual_review"
          ? "manual_review"
          : status === "paid"
          ? "paid"
          : "payment_processing",
        status,
      }, 409);
    }

    // ── 原子條件式狀態轉換：只有仍為 pending 且未開始付款者可被釋放 ──
    const { data: updated } = await admin
      .from("group_buy_payment_drafts")
      .update({ status: "cancelled", last_error: `released:${reason}` })
      .eq("id", draftId)
      .eq("status", "pending")
      .is("converted_order_id", null)
      .is("rec_trade_id", null)
      .select("id, campaign_id, amount_to_charge, guest_name")
      .maybeSingle();

    if (!updated) {
      // 競態：期間已被 start-payment claim 或已轉單 → 重讀最新狀態回報，絕不覆蓋
      const { data: fresh } = await admin
        .from("group_buy_payment_drafts")
        .select("status, converted_order_id")
        .eq("id", draftId)
        .maybeSingle();
      const s = String(fresh?.status ?? "");
      if (s === "cancelled" || s === "expired") return json({ released: true, already: true, status: s });
      return json({ released: false, reason: "status_changed", status: s }, 409);
    }

    await admin.from("group_buy_payment_events").insert({
      campaign_id: updated.campaign_id,
      order_id: null,
      event_type: "payment_draft_released",
      amount: updated.amount_to_charge,
      actor_label: updated.guest_name || "guest",
      note: `客人主動釋放付款保留（draft:${updated.id}／reason:${reason}）`,
    });

    return json({ released: true, status: "cancelled" });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ error: "目前無法釋放房況，請稍後再試或聯繫客服。" }, 500);
  }
});
