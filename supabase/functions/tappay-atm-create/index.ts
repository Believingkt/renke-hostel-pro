// TapPay ATM 虛擬帳號開立
// 1. 接收前端 prime（透過 TPDirect.atm.getPrime 取得）
// 2. 呼叫 TapPay Pay by Prime（payment_method=atm）取得虛擬帳號
// 3. 將虛擬帳號資訊寫入 orders，狀態維持 pending_payment
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface AtmCreatePayload {
  prime: string;
  orderId: string;          // orders.id (uuid)
  orderNumber: string;
  amount: number;
  cardholder: { name: string; email: string; phoneNumber: string };
  expireInDays?: number;    // 1-7，預設 3
  details?: string;
}

function normalizePhoneE164(phone: string): string {
  const c = phone.replace(/[^\d+]/g, "");
  if (c.startsWith("+")) return c;
  if (c.startsWith("09") && c.length === 10) return "+886" + c.substring(1);
  if (c.startsWith("886")) return "+" + c;
  return "+886" + c;
}

function pickFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function extractAtmInfo(payload: any) {
  const sources = [payload?.payee_info, payload?.pay_info, payload?.virtual_account, payload?.atm_info, payload?.bank_info, payload];
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    const vaccNo = pickFirstString(
      src.vacc,
      src.vacc_no,
      src.virtual_account,
      src.virtual_account_no,
      src.virtual_account_number,
      src.account,
      src.account_no,
      src.account_number,
      src.bank_account,
      src.bank_account_no,
      src.payment_no,
      src.payment_account,
    );
    if (!vaccNo) continue;
    return {
      vaccNo,
      bankCode: pickFirstString(src.vacc_bank_code, src.bank_code, src.bank_id, src.bank, src.bank_no, src.bank_number, src.bank_code_no),
      expireDateStr: pickFirstString(src.expire_time, src.expire_date, src.expired_date, src.expire_at, src.expired_at, src.due_date, src.payment_deadline),
    };
  }
  return { vaccNo: undefined, bankCode: undefined, expireDateStr: undefined };
}

function parseTapPayExpireAt(expireDateStr: string | undefined, expireDays: number): Date {
  if (expireDateStr && /^\d{14}$/.test(expireDateStr)) {
    const y = expireDateStr.substring(0, 4);
    const m = expireDateStr.substring(4, 6);
    const d = expireDateStr.substring(6, 8);
    const hh = expireDateStr.substring(8, 10);
    const mm = expireDateStr.substring(10, 12);
    const ss = expireDateStr.substring(12, 14);
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}+08:00`);
  }
  if (expireDateStr && /^\d{8}$/.test(expireDateStr)) {
    const y = expireDateStr.substring(0, 4);
    const m = expireDateStr.substring(4, 6);
    const d = expireDateStr.substring(6, 8);
    return new Date(`${y}-${m}-${d}T23:59:59+08:00`);
  }
  return new Date(Date.now() + expireDays * 86400_000);
}

async function queryTapPayRecord(queryEndpoint: string, partnerKey: string, recTradeId?: string) {
  if (!recTradeId) return null;
  try {
    const resp = await fetch(queryEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": partnerKey },
      body: JSON.stringify({ partner_key: partnerKey, filters: { rec_trade_id: recTradeId } }),
    });
    const result = await resp.json();
    const record = result?.trade_records?.[0] ?? null;
    console.log("[tappay-atm-create] query fallback:", {
      status: result?.status,
      msg: result?.msg,
      hasRecord: Boolean(record),
      recordKeys: record ? Object.keys(record) : [],
    });
    return record;
  } catch (e) {
    console.warn("[tappay-atm-create] query fallback failed:", e);
    return null;
  }
}

function validate(d: any): string | null {
  if (!d?.prime || typeof d.prime !== "string" || d.prime.length < 10) return "Invalid prime";
  if (typeof d.amount !== "number" || !Number.isInteger(d.amount) || d.amount <= 0 || d.amount > 10_000_000)
    return "Invalid amount";
  if (!d?.orderId || typeof d.orderId !== "string") return "Invalid orderId";
  if (!d?.orderNumber || typeof d.orderNumber !== "string") return "Invalid orderNumber";
  const h = d.cardholder;
  if (!h?.name || !h?.email || !h?.phoneNumber) return "Invalid cardholder";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h.email)) return "Invalid email";
  return null;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const data: AtmCreatePayload = await req.json();
    const err = validate(data);
    if (err) {
      return new Response(JSON.stringify({ success: false, message: err }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
    const merchantId = Deno.env.get("TAPPAY_ATM_MERCHANT_ID") || Deno.env.get("TAPPAY_MERCHANT_ID");
    if (!partnerKey || !merchantId) throw new Error("TapPay credentials not configured");

    // ===== 服務端驗價：金額不可大於該訂單未付金額 =====
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_number, final_price, paid_amount, payment_status, order_status, atm_vacc_no, atm_vacc_bank_code, atm_expire_at, atm_rec_trade_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr || !order) {
      return new Response(JSON.stringify({ success: false, message: "找不到訂單" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.order_status === "cancelled")
      return new Response(JSON.stringify({ success: false, message: "訂單已取消" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    if (order.payment_status === "paid")
      return new Response(JSON.stringify({ success: false, message: "訂單已付清" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // 若已有未過期的虛擬帳號，直接回傳
    if (order.atm_vacc_no && order.atm_expire_at && new Date(order.atm_expire_at).getTime() > Date.now()) {
      const { data: full } = await supabase
        .from("orders")
        .select("atm_vacc_no, atm_vacc_bank_code, atm_expire_at")
        .eq("id", order.id).maybeSingle();
      return new Response(JSON.stringify({
        success: true,
        reused: true,
        vaccNo: full?.atm_vacc_no,
        bankCode: full?.atm_vacc_bank_code,
        expireAt: full?.atm_expire_at,
        amount: data.amount,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const unpaid = order.final_price - (order.paid_amount || 0);
    if (data.amount > unpaid) {
      return new Response(JSON.stringify({ success: false, message: `金額超過待付 NT$${unpaid}` }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expireDays = Math.min(7, Math.max(1, data.expireInDays ?? 3));
    const phoneE164 = normalizePhoneE164(data.cardholder.phoneNumber);
    const envRaw = Deno.env.get("TAPPAY_ENV");
    const env = envRaw === "sandbox" ? "sandbox" : "production";
    const baseUrl = env === "sandbox" ? "https://sandbox.tappaysdk.com" : "https://prod.tappaysdk.com";
    const endpoint = `${baseUrl}/tpc/payment/pay-by-prime`;
    const queryEndpoint = `${baseUrl}/tpc/transaction/query`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const notifyUrl = `${supabaseUrl}/functions/v1/tappay-notify`;

    const body = {
      prime: data.prime,
      partner_key: partnerKey,
      merchant_id: merchantId,
      amount: data.amount,
      currency: "TWD",
      order_number: data.orderNumber,
      details: data.details || `訂單 ${data.orderNumber} ATM 轉帳`,
      cardholder: {
        phone_number: phoneE164,
        name: data.cardholder.name,
        email: data.cardholder.email,
      },
      result_url: { backend_notify_url: notifyUrl },
      pay_info: { expire_in_days: expireDays },
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": partnerKey },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    console.log("[tappay-atm-create] result:", {
      status: result.status,
      msg: result.msg,
      rec_trade_id: result.rec_trade_id,
      keys: Object.keys(result || {}),
      hasPayeeInfo: Boolean(result.payee_info),
      payeeInfoKeys: result.payee_info && typeof result.payee_info === "object" ? Object.keys(result.payee_info) : [],
      hasPayInfo: Boolean(result.pay_info),
    });

    if (result.status !== 0) {
      return new Response(JSON.stringify({
        success: false,
        message: result.msg || "建立虛擬帳號失敗",
        errorCode: result.status,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let { vaccNo, bankCode, expireDateStr } = extractAtmInfo(result);
    if (!vaccNo && result.rec_trade_id) {
      for (let attempt = 0; attempt < 3 && !vaccNo; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        const record = await queryTapPayRecord(queryEndpoint, partnerKey, result.rec_trade_id);
        const fromRecord = extractAtmInfo(record);
        vaccNo = fromRecord.vaccNo;
        bankCode = bankCode || fromRecord.bankCode;
        expireDateStr = expireDateStr || fromRecord.expireDateStr;
      }
    }
    let expireAt: Date;
    if (expireDateStr && /^\d{8}$/.test(expireDateStr)) {
      // 設為當日 23:59:59 台北時間（UTC+8 → UTC 15:59:59）
      const y = expireDateStr.substring(0, 4);
      const m = expireDateStr.substring(4, 6);
      const d = expireDateStr.substring(6, 8);
      expireAt = new Date(`${y}-${m}-${d}T15:59:59.000Z`);
    } else {
      expireAt = new Date(Date.now() + expireDays * 86400_000);
    }

    if (!vaccNo) {
      return new Response(JSON.stringify({ success: false, message: "TapPay 未回傳虛擬帳號" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const note = `[ATM] ${new Date().toISOString()} - 已開立虛擬帳號 ${bankCode || ""}-${vaccNo}，到期 ${expireAt.toISOString()} (rec_trade_id: ${result.rec_trade_id})`;
    const { data: cur } = await supabase.from("orders").select("notes").eq("id", order.id).maybeSingle();
    const newNotes = cur?.notes ? `${cur.notes}\n${note}` : note;

    await supabase.from("orders").update({
      payment_status: "pending_payment",
      payment_method: "atm",
      atm_vacc_no: vaccNo,
      atm_vacc_bank_code: bankCode || null,
      atm_expire_at: expireAt.toISOString(),
      atm_rec_trade_id: result.rec_trade_id,
      atm_bank_transaction_id: result.bank_transaction_id || null,
      payment_link_created_at: new Date().toISOString(),
      notes: newNotes,
      updated_at: new Date().toISOString(),
    }).eq("id", order.id);

    return new Response(JSON.stringify({
      success: true,
      vaccNo,
      bankCode: bankCode || null,
      expireAt: expireAt.toISOString(),
      amount: data.amount,
      recTradeId: result.rec_trade_id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[tappay-atm-create] error:", e);
    return new Response(JSON.stringify({
      success: false,
      message: e instanceof Error ? e.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
