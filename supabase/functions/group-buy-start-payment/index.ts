// 團購線上付款 Server-side 入口（Phase G1：只支援 ATM 虛擬帳號）
//
// 設計原則：
// 1. 前端不得決定金額。應收金額一律由 server 讀 orders.deposit_amount 決定。
// 2. 活動層級開關（group_buy_campaigns.enable_atm）為唯一 gate。
// 3. 實際開立虛擬帳號仍共用既有正式函式 tappay-atm-create（不改其原有 website 行為）。
// 4. 付款狀態 source of truth 永遠是 orders；group_buy_payment_events 僅為 audit。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { splitDeposit } from "../_shared/groupBuy.ts";

const FN = "group-buy-start-payment";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function digits(s: unknown) {
  return String(s ?? "").replace(/\D/g, "");
}

const ipMap = new Map<string, { n: number; reset: number }>();
function rateOk(ip: string) {
  const now = Date.now();
  const rec = ipMap.get(ip);
  if (!rec || now > rec.reset) {
    ipMap.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  if (rec.n >= 10) return false;
  rec.n++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateOk(ip)) return json({ success: false, error: "操作過於頻繁，請稍後再試" }, 429);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const orderNumber = String(body.orderNumber ?? "").trim().toUpperCase();
    const phoneLast4 = digits(body.phoneLast4).slice(-4);
    const paymentType = String(body.paymentType ?? "atm");
    const prime = String(body.prime ?? "").trim();

    if (paymentType !== "atm") {
      return json({ success: false, error: "目前僅支援 ATM 虛擬帳號付款" }, 400);
    }
    if (!orderNumber || phoneLast4.length !== 4) {
      return json({ success: false, error: "請提供訂單編號與聯絡電話後四碼" }, 400);
    }
    if (!prime || prime.length < 10) {
      return json({ success: false, error: "付款授權資訊無效，請重新操作" }, 400);
    }

    // ── 1) 取單並驗證身分（公開端點：訂單編號 + 電話後四碼） ──
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select(
        "id, order_number, order_source, order_status, payment_status, guest_name, guest_phone, guest_email, total_price, final_price, deposit_amount, paid_amount",
      )
      .eq("order_number", orderNumber)
      .eq("order_source", "group_buy")
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order || digits(order.guest_phone).slice(-4) !== phoneLast4) {
      return json({ success: false, error: "查無此訂單，請確認訂單編號與電話後四碼" }, 404);
    }
    if (order.order_status === "cancelled") {
      return json({ success: false, error: "此訂單已取消，無法付款" }, 400);
    }
    if (order.payment_status === "paid") {
      return json({ success: false, error: "此訂單已付清，無需重複付款" }, 400);
    }

    // ── 2) 活動關聯與 ATM 開關（唯一 gate） ──
    const { data: commission } = await admin
      .from("group_buy_commissions")
      .select("campaign_id")
      .eq("order_id", order.id)
      .maybeSingle();
    const { data: campaign } = commission?.campaign_id
      ? await admin
        .from("group_buy_campaigns")
        .select("id, title, enable_atm, deposit_percentage")
        .eq("id", commission.campaign_id)
        .maybeSingle()
      : { data: null as any };

    if (!campaign?.enable_atm) {
      return json({ success: false, error: "此活動未開放 ATM 虛擬帳號付款" }, 400);
    }

    // ── 3) 應收金額：唯一 SoT = orders.deposit_amount（不再 fallback 重算） ──
    const due = resolveGroupBuyAtmDue(order);
    if (!due.ok) return json({ success: false, error: due.error }, due.status);
    const dueAmount = due.dueAmount;


    // ── 4) 共用既有正式 ATM 函式（含既有 reuse／上限／驗價行為） ──
    const resp = await fetch(`${supabaseUrl}/functions/v1/tappay-atm-create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        prime,
        orderId: order.id,
        orderNumber: order.order_number,
        amount: dueAmount,
        cardholder: {
          name: order.guest_name || "訂購人",
          email: order.guest_email || "noreply@lakeze.com",
          phoneNumber: order.guest_phone || "",
        },
        expireInDays: 3,
      }),
    });
    const result = await resp.json().catch(() => ({} as any));
    if (!result?.success) {
      return json({
        success: false,
        error: result?.message || "建立虛擬帳號失敗，請稍後再試或聯繫客服",
      }, 200);
    }

    // ── 5) Audit（非 source of truth） ──
    if (!result.reused) {
      await admin.from("group_buy_payment_events").insert({
        campaign_id: campaign.id,
        order_id: order.id,
        event_type: "atm_created",
        amount: dueAmount,
        actor_label: "system",
        note: `provider:tappay／payment_type:atm／已開立虛擬帳號 ${result.bankCode ?? ""}-${result.vaccNo}／到期 ${result.expireAt}`,
      });
    }

    return json({
      success: true,
      reused: Boolean(result.reused),
      vaccNo: result.vaccNo,
      bankCode: result.bankCode ?? null,
      expireAt: result.expireAt,
      amount: dueAmount,
    });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ success: false, error: "目前無法開立虛擬帳號，請稍後再試或聯繫客服" }, 500);
  }
});
