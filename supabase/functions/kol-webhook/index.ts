import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: {
    order_number: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    guest_count: number;
    total_price: number;
    discount_amount: number;
    final_price: number;
    order_status: string;
    room_type_name?: string;
    discount_code: string;
    commission_rate: number;
    estimated_commission: number;
  };
}

// Generate HMAC signature for webhook payload
function generateSignature(payload: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  return hmac.digest("hex");
}

// Helper: lookup accommodation name + short_name
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lookupAccommodationInfo(
  supabase: any,
  accommodationId: string | null,
): Promise<{ name: string; short_name: string | null }> {
  let accommodationName = "人客多";
  let shortName: string | null = null;
  if (accommodationId) {
    const { data: accInfo, error: accErr } = await supabase
      .from("accommodation_info")
      .select("name, short_name")
      .eq("id", accommodationId)
      .maybeSingle();
    if (accErr) console.error("[KOL-Webhook] accommodation_info lookup error:", accErr);
    if (accInfo?.name) accommodationName = accInfo.name;
    if (accInfo?.short_name) shortName = accInfo.short_name;
  }
  return { name: accommodationName, short_name: shortName };
}

// Prepend short_name (followed by a blank line) when present.
function withShortNamePrefix(body: string, shortName: string | null): string {
  const trimmed = (shortName ?? "").trim();
  if (!trimmed) return body;
  return `${trimmed}\n\n${body}`;
}

// Send internal notification email for an order (Type 1: 一般通知). Returns result, never throws.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendInternalOrderEmail(supabase: any, order: any, roomTypeName: string | undefined) {
  try {
    const { name: accommodationName, short_name: shortName } = await lookupAccommodationInfo(supabase, order.accommodation_id);

    // Map order_source to display label
    const sourceMap: Record<string, string> = {
      kol: "KOL互惠",
      manual: "現場訂房",
    };
    const rawSource = order.order_source ?? "";
    const sourceLabel = sourceMap[rawSource] ?? rawSource;

    if (!Deno.env.get("RESEND_API_KEY")) {
      console.error("[KOL-Webhook] RESEND_API_KEY not configured, skipping internal email");
      return { success: false, error: "RESEND_API_KEY not configured" };
    }

    const toTW = (d: Date) => new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmtDate = (d: Date) => {
      const tw = toTW(d);
      return `${tw.getUTCFullYear()}/${pad(tw.getUTCMonth() + 1)}/${pad(tw.getUTCDate())}`;
    };
    const fmtDateTime = (d: Date) => {
      const tw = toTW(d);
      return `${tw.getUTCFullYear()}/${pad(tw.getUTCMonth() + 1)}/${pad(tw.getUTCDate())} | ${pad(tw.getUTCHours())}:${pad(tw.getUTCMinutes())}`;
    };
    const today = new Date();
    const orderDate = order.order_date ? new Date(order.order_date) : (order.created_at ? new Date(order.created_at) : new Date());
    const checkIn = new Date(order.check_in_date);
    const checkOut = new Date(order.check_out_date);
    const nights = Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

    const subject = `【已成立訂單】1筆 - [訂單_${accommodationName} x 星探邀約KOL]`;
    const baseText = `以下 1 筆訂單已成立，批次通知日期 ${fmtDate(today)}
===================================================
訂單日期：${fmtDateTime(orderDate)}
訂單編號:${order.order_number}
入住日：${order.check_in_date}
入住天數：${nights}天
包棟房型：${roomTypeName ?? ""}
訂單金額：${order.final_price}
訂單姓名：${order.guest_name}
折扣代碼：${order.discount_code ?? ""}
聯盟券：
來源：${sourceLabel}`;
    const text = withShortNamePrefix(baseText, shortName);

    const { data, error } = await resend.emails.send({
      from: "人客多通知 <noreply@sensaninn.lakeze.com>",
      to: ["service@lakeze.com"],
      subject,
      text,
    });
    if (error) {
      console.error("[KOL-Webhook] Internal email failed:", error);
      return { success: false, error: typeof error === "string" ? error : JSON.stringify(error), subject };
    }
    console.log("[KOL-Webhook] Internal notification email sent to service@lakeze.com", data?.id);
    return { success: true, response: data, subject };
  } catch (emailErr) {
    console.error("[KOL-Webhook] Internal email error:", emailErr);
    return { success: false, error: emailErr instanceof Error ? emailErr.message : String(emailErr) };
  }
}

// Send correction notification email (Type 2: 折扣碼修正通知). Returns result, never throws.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendDiscountCorrectionEmail(supabase: any, order: any, previousDiscountCode: string | null, roomTypeName?: string) {
  try {
    const { name: accommodationName, short_name: shortName } = await lookupAccommodationInfo(supabase, order.accommodation_id);

    // Map order_source to display label (same as sendInternalOrderEmail)
    const sourceMap: Record<string, string> = {
      kol: "KOL互惠",
      manual: "現場訂房",
    };
    const rawSource = order.order_source ?? "";
    const sourceLabel = sourceMap[rawSource] ?? rawSource;

    if (!Deno.env.get("RESEND_API_KEY")) {
      console.error("[KOL-Webhook] RESEND_API_KEY not configured, skipping correction email");
      return { success: false, error: "RESEND_API_KEY not configured" };
    }

    const toTW = (d: Date) => new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmtDate = (d: Date) => {
      const tw = toTW(d);
      return `${tw.getUTCFullYear()}/${pad(tw.getUTCMonth() + 1)}/${pad(tw.getUTCDate())}`;
    };
    const fmtDateTime = (d: Date) => {
      const tw = toTW(d);
      return `${tw.getUTCFullYear()}/${pad(tw.getUTCMonth() + 1)}/${pad(tw.getUTCDate())} | ${pad(tw.getUTCHours())}:${pad(tw.getUTCMinutes())}`;
    };
    const today = new Date();
    const orderDate = order.order_date ? new Date(order.order_date) : (order.created_at ? new Date(order.created_at) : new Date());
    const checkIn = new Date(order.check_in_date);
    const checkOut = new Date(order.check_out_date);
    const nights = Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

    const subject = `【折扣碼修正】1筆 - [訂單_${accommodationName} x 星探邀約KOL]`;
    const baseText = `以下 1 筆訂單的折扣代碼已修正，通知日期 ${fmtDate(today)}
===================================================
訂單日期：${fmtDateTime(orderDate)}
訂單編號：${order.order_number}
入住日：${order.check_in_date}
入住天數：${nights}天
包棟房型：${roomTypeName ?? ""}
訂單金額：${order.final_price}
訂單姓名：${order.guest_name}
折扣代碼：${previousDiscountCode ?? ""}
聯盟券：
來源：${sourceLabel}
「新折扣代碼：${order.discount_code ?? ""}」`;
    const text = withShortNamePrefix(baseText, shortName);

    const { data, error } = await resend.emails.send({
      from: "人客多通知 <noreply@sensaninn.lakeze.com>",
      to: ["service@lakeze.com"],
      subject,
      text,
    });
    if (error) {
      console.error("[KOL-Webhook] Correction email failed:", error);
      return { success: false, error: typeof error === "string" ? error : JSON.stringify(error), subject };
    }
    console.log("[KOL-Webhook] Correction notification email sent to service@lakeze.com", data?.id);
    return { success: true, response: data, subject };
  } catch (emailErr) {
    console.error("[KOL-Webhook] Correction email error:", emailErr);
    return { success: false, error: emailErr instanceof Error ? emailErr.message : String(emailErr) };
  }
}

// Mark order as having had the internal email sent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markInternalEmailSent(supabase: any, orderId: string) {
  try {
    const { error } = await supabase
      .from("orders")
      .update({ internal_email_sent: true, internal_email_sent_at: new Date().toISOString() })
      .eq("id", orderId);
    if (error) console.error("[KOL-Webhook] Failed to mark internal_email_sent:", error);
  } catch (e) {
    console.error("[KOL-Webhook] markInternalEmailSent error:", e);
  }
}

// Send KOL/星探 order LINE push via send-line-push Edge Function. Never throws.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendKolLinePush(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any,
  isCorrection: boolean,
  roomTypeName?: string,
  previousDiscountCode?: string | null,
) {
  try {
    const { name: accommodationName, short_name: shortName } = await lookupAccommodationInfo(supabase, order.accommodation_id);
    const displayName = (shortName ?? "").trim() || accommodationName;

    const pad = (n: number) => String(n).padStart(2, "0");
    const toTW = (d: Date) => new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const fmtDateTime = (d: Date) => {
      const tw = toTW(d);
      return `${tw.getUTCFullYear()}/${pad(tw.getUTCMonth() + 1)}/${pad(tw.getUTCDate())} | ${pad(tw.getUTCHours())}:${pad(tw.getUTCMinutes())}`;
    };
    const orderDate = order.order_date ? new Date(order.order_date) : (order.created_at ? new Date(order.created_at) : new Date());
    const checkIn = new Date(order.check_in_date);
    const checkOut = new Date(order.check_out_date);
    const nights = Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

    const currentCode = order.discount_code ?? "";
    const discountCodeLine = isCorrection ? (previousDiscountCode ?? "") : currentCode;

    const lines = [
      `${displayName}-新訂單 🏡`,
      `訂單日期:${fmtDateTime(orderDate)}`,
      `訂單編號:${order.order_number}`,
      `入住日:${order.check_in_date}`,
      `入住天數:${nights}天`,
      `包棟房型:${roomTypeName ?? ""}`,
      `訂單金額:${order.final_price}`,
      `訂單姓名:${order.guest_name}`,
      `折扣代碼:${discountCodeLine}`,
    ];
    if (isCorrection) {
      lines.push(`新折扣代碼:${currentCode}`);
    }
    const message = lines.join("\n");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-line-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify({
        event_type: "kol_order",
        accommodation_id: order.accommodation_id,
        message,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("[KOL-Webhook] send-line-push failed:", resp.status, text);
    } else {
      console.log("[KOL-Webhook] send-line-push ok", isCorrection ? "(correction)" : "(normal)");
    }
  } catch (e) {
    console.error("[KOL-Webhook] sendKolLinePush error:", e);
  }
}

// Send webhook notification
async function sendWebhook(
  webhookUrl: string,
  webhookSecret: string | null,
  payload: WebhookPayload,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const payloadString = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Event": payload.event,
      "X-Webhook-Timestamp": payload.timestamp,
    };

    // Add HMAC signature if secret is configured
    if (webhookSecret) {
      const signature = generateSignature(payloadString, webhookSecret);
      headers["X-Webhook-Signature"] = `sha256=${signature}`;
    }

    console.log(`[KOL-Webhook] Sending webhook to: ${webhookUrl}`);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: payloadString,
    });

    console.log(`[KOL-Webhook] Response status: ${response.status}`);

    return {
      success: response.ok,
      statusCode: response.status,
    };
  } catch (error) {
    console.error("[KOL-Webhook] Error sending webhook:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    // This function can be called:
    // 1. Internally when a new order is created (POST with order data)
    // 2. By admin to test webhook (POST with test flag)

    const body = await req.json();
    const { order_id, test_mode, discount_code_id, test_real_order, trigger_type, previous_discount_code } = body as {
      order_id?: string;
      test_mode?: boolean;
      discount_code_id?: string;
      test_real_order?: boolean;
      trigger_type?: "update" | "insert";
      previous_discount_code?: string | null;
    };

    // Test real order mode - fetch latest order and run internal email logic
    if (test_real_order) {
      console.log("[KOL-Webhook] test_real_order mode: fetching latest order");
      const { data: latestOrder, error: latestErr } = await supabase
        .from("orders")
        .select(
          `
          id,
          order_number,
          guest_name,
          check_in_date,
          check_out_date,
          guest_count,
          total_price,
          discount_amount,
          final_price,
          order_status,
          discount_code,
          created_at,
          order_date,
          accommodation_id,
          order_source,
          room_types:room_type_id (name)
        `,
        )
        .not("discount_code", "is", null)
        .neq("discount_code", "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestErr || !latestOrder) {
        return new Response(JSON.stringify({ error: "找不到任何訂單", details: latestErr?.message }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const roomTypeName = Array.isArray(latestOrder.room_types)
        ? latestOrder.room_types[0]?.name
        : (latestOrder.room_types as { name: string } | null)?.name;

      const emailResult = await sendInternalOrderEmail(supabase, latestOrder, roomTypeName);

      return new Response(
        JSON.stringify({
          success: emailResult.success,
          message: emailResult.success
            ? `已使用最新訂單 ${latestOrder.order_number} 發送測試通知至 service@lakeze.com`
            : "測試通知 Email 發送失敗",
          order_number: latestOrder.order_number,
          order_id: latestOrder.id,
          email_result: emailResult,
        }),
        {
          status: emailResult.success ? 200 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Test mode - send a test webhook
    if (test_mode && discount_code_id) {
      console.log(`[KOL-Webhook] Test mode for discount code: ${discount_code_id}`);

      // Fetch discount code info (without sensitive data)
      const { data: discountCode, error: dcError } = await supabase
        .from("discount_codes")
        .select("id, code, commission_rate, name")
        .eq("id", discount_code_id)
        .single();

      if (dcError || !discountCode) {
        return new Response(JSON.stringify({ error: "找不到折扣碼" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch secrets from the secure table
      const { data: secrets, error: secretsError } = await supabase
        .from("discount_code_secrets")
        .select("webhook_url, webhook_secret")
        .eq("discount_code_id", discount_code_id)
        .single();

      if (secretsError) {
        console.error("[KOL-Webhook] Error fetching secrets:", secretsError);
      }

      const webhookUrl = secrets?.webhook_url;
      const webhookSecret = secrets?.webhook_secret;

      if (!webhookUrl) {
        return new Response(JSON.stringify({ error: "Webhook 未啟用或未設定 URL" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const testPayload: WebhookPayload = {
        event: "order.test",
        timestamp: new Date().toISOString(),
        data: {
          order_number: "TEST-20240101-001",
          guest_name: "測試用戶",
          check_in_date: "2024-12-25",
          check_out_date: "2024-12-27",
          guest_count: 2,
          total_price: 5000,
          discount_amount: 500,
          final_price: 4500,
          order_status: "confirmed",
          room_type_name: "測試房型",
          discount_code: discountCode.code,
          commission_rate: discountCode.commission_rate || 0,
          estimated_commission: Math.round(4500 * ((discountCode.commission_rate || 0) / 100)),
        },
      };

      const result = await sendWebhook(webhookUrl, webhookSecret, testPayload);

      return new Response(
        JSON.stringify({
          success: result.success,
          message: result.success ? "Webhook 測試發送成功" : "Webhook 發送失敗",
          statusCode: result.statusCode,
          error: result.error,
        }),
        {
          status: result.success ? 200 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Normal mode - triggered when an order is created
    if (!order_id) {
      return new Response(JSON.stringify({ error: "缺少 order_id 參數" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[KOL-Webhook] Processing order: ${order_id}`);

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        guest_name,
        check_in_date,
        check_out_date,
        guest_count,
        total_price,
        discount_amount,
        final_price,
        order_status,
        discount_code,
        created_at,
        order_date,
        accommodation_id,
        order_source,
        internal_email_sent,
        internal_email_sent_at,
        room_types:room_type_id (name)
      `,
      )
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      console.error("[KOL-Webhook] Order not found:", orderError);
      return new Response(JSON.stringify({ error: "找不到訂單" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve room type name early (used by both internal email and webhook payload)
    const roomTypeNameEarly = Array.isArray(order.room_types)
      ? order.room_types[0]?.name
      : (order.room_types as { name: string } | null)?.name;

    // ============================================================
    // Internal email decision logic
    // ============================================================
    const isUpdate = trigger_type === "update";
    const isKolSource = (order.order_source ?? "") === "kol"; // "KOL互惠"
    const currentCode = (order.discount_code ?? "").trim();
    const prevCode = (previous_discount_code ?? "").trim();

    if (isUpdate) {
      // UPDATE branch
      if (!isKolSource && currentCode === prevCode) {
        console.log("[KOL-Webhook] UPDATE: discount_code unchanged, skip internal email");
      } else if (isKolSource) {
        console.log("[KOL-Webhook] UPDATE: order_source is KOL互惠, skip internal email");
      } else if (!prevCode && currentCode && !order.internal_email_sent) {
        // Branch 3: was empty, now has value, and never emailed → Type 1
        const r = await sendInternalOrderEmail(supabase, order, roomTypeNameEarly);
        if (r.success) {
          await markInternalEmailSent(supabase, order.id);
          await sendKolLinePush(supabase, order, false);
        }
      } else if (prevCode && currentCode && currentCode !== prevCode) {
        // Branch 4: both had values, code changed → Type 2 (correction)
        const r = await sendDiscountCorrectionEmail(supabase, order, previous_discount_code ?? null, roomTypeNameEarly);
        if (r.success) {
          await sendKolLinePush(supabase, order, true);
        }
        // Do not change internal_email_sent
      } else {
        console.log("[KOL-Webhook] UPDATE: no email branch matched", { prevCode, currentCode, sent: order.internal_email_sent });
      }
    } else {
      // INSERT branch (default)
      if (currentCode && !isKolSource) {
        const r = await sendInternalOrderEmail(supabase, order, roomTypeNameEarly);
        if (r.success) {
          await markInternalEmailSent(supabase, order.id);
          await sendKolLinePush(supabase, order, false);
        }
      } else {
        console.log("[KOL-Webhook] INSERT: skip internal email", { hasCode: !!currentCode, isKolSource });
      }
    }

    // Check if order has a discount code
    if (!order.discount_code) {
      console.log("[KOL-Webhook] Order has no discount code, skipping");
      return new Response(JSON.stringify({ success: true, message: "訂單沒有折扣碼，跳過 webhook" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get discount code info (without sensitive data)
    const { data: discountCode, error: dcError } = await supabase
      .from("discount_codes")
      .select("id, commission_rate")
      .eq("code", order.discount_code.toUpperCase())
      .single();

    if (dcError || !discountCode) {
      console.log("[KOL-Webhook] Discount code not found");
      return new Response(JSON.stringify({ success: true, message: "找不到折扣碼，跳過 webhook" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch secrets from the secure table
    const { data: secrets, error: secretsError } = await supabase
      .from("discount_code_secrets")
      .select("webhook_url, webhook_secret")
      .eq("discount_code_id", discountCode.id)
      .single();

    if (secretsError) {
      console.error("[KOL-Webhook] Error fetching secrets:", secretsError);
    }

    const webhookUrl = secrets?.webhook_url;
    const webhookSecret = secrets?.webhook_secret;

    // Check if webhook is enabled
    if (!webhookUrl) {
      console.log("[KOL-Webhook] Webhook not enabled for this discount code");
      return new Response(JSON.stringify({ success: true, message: "Webhook 未啟用" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prepare webhook payload
    const roomTypeName = Array.isArray(order.room_types)
      ? order.room_types[0]?.name
      : (order.room_types as { name: string } | null)?.name;

    const commissionRate = discountCode.commission_rate || 0;
    const estimatedCommission = Math.round(order.final_price * (commissionRate / 100));

    const payload: WebhookPayload = {
      event: "order.created",
      timestamp: new Date().toISOString(),
      data: {
        order_number: order.order_number,
        guest_name: order.guest_name,
        check_in_date: order.check_in_date,
        check_out_date: order.check_out_date,
        guest_count: order.guest_count,
        total_price: order.total_price,
        discount_amount: order.discount_amount || 0,
        final_price: order.final_price,
        order_status: order.order_status,
        room_type_name: roomTypeName,
        discount_code: order.discount_code,
        commission_rate: commissionRate,
        estimated_commission: estimatedCommission,
      },
    };

    // Send webhook
    const result = await sendWebhook(webhookUrl, webhookSecret, payload);

    console.log(`[KOL-Webhook] Webhook sent: ${result.success}`);

    return new Response(
      JSON.stringify({
        success: result.success,
        statusCode: result.statusCode,
        error: result.error,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[KOL-Webhook] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
