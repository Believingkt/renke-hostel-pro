// 「官網內容 → 訂房確認通知」Email 預覽。
// 只讀：不建立/修改訂單、不寫入任何資料、不寄信、不呼叫 TapPay、不建立 ATM 虛擬帳號。
// 與正式訂房確認信共用同一份 renderer（_shared/orderConfirmationEmail.ts）與付款摘要（_shared/paymentSummary.ts）。

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { renderOrderConfirmationEmail } from "../_shared/orderConfirmationEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Scenario = "A" | "B" | "C" | "D" | "E" | "LEGACY";

interface PreviewOverrides {
  final_price?: number;
  booking_deposit_amount?: number | null;
  booking_deposit_percentage?: number | null;
  paid_amount?: number;
  check_in_date?: string;
  check_out_date?: string;
  atm_expire_at?: string;
}

/** 各情境的訂單狀態（金額僅為預設值，可被 overrides 覆寫） */
function scenarioOrder(scenario: Scenario, atmExpire: string) {
  switch (scenario) {
    case "B":
      return {
        payment_status: "deposit_paid",
        payment_method: "atm",
        paid_amount: 6000,
        booking_deposit_amount: 6000,
        booking_deposit_percentage: 30,
        atm_vacc_no: "9259626080618342",
        atm_vacc_bank_code: "822",
        atm_expire_at: atmExpire,
        notes: "",
      };
    case "C":
      return {
        payment_status: "pending_payment",
        payment_method: "atm",
        paid_amount: 3000,
        booking_deposit_amount: 6000,
        booking_deposit_percentage: 30,
        atm_vacc_no: "9259626080618342",
        atm_vacc_bank_code: "822",
        atm_expire_at: atmExpire,
        notes: "",
      };
    case "D":
      return {
        payment_status: "paid",
        payment_method: "credit_card",
        paid_amount: 20000,
        booking_deposit_amount: null,
        booking_deposit_percentage: null,
        atm_vacc_no: null,
        atm_vacc_bank_code: null,
        atm_expire_at: null,
        notes: "",
      };
    case "E":
      return {
        payment_status: "unpaid",
        payment_method: null,
        paid_amount: 0,
        booking_deposit_amount: null,
        booking_deposit_percentage: null,
        atm_vacc_no: null,
        atm_vacc_bank_code: null,
        atm_expire_at: null,
        notes: "",
      };
    case "LEGACY":
      return {
        payment_status: "pending_payment",
        payment_method: "atm",
        paid_amount: 0,
        booking_deposit_amount: null,
        booking_deposit_percentage: null,
        atm_vacc_no: "9259626080618342",
        atm_vacc_bank_code: "822",
        atm_expire_at: atmExpire,
        notes:
          "[訂金制] ATM 線上匯款訂金 NT$ 6,000（總額 NT$ 20,000 的 30%），尾款 NT$ 14,000 入住現場付清",
      };
    case "A":
    default:
      return {
        payment_status: "pending_payment",
        payment_method: "atm",
        paid_amount: 0,
        booking_deposit_amount: 6000,
        booking_deposit_percentage: 30,
        atm_vacc_no: "9259626080618342",
        atm_vacc_bank_code: "822",
        atm_expire_at: atmExpire,
        notes: "",
      };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const accommodationId: string | null =
      url.searchParams.get("accommodation_id") || body?.accommodation_id || null;
    const scenario = String(
      url.searchParams.get("scenario") || body?.scenario || "A",
    ).toUpperCase() as Scenario;
    const overrides: PreviewOverrides = body?.overrides || {};
    // 未儲存的表單內容（僅影響預覽，不寫回 DB）
    const settingsOverride = body?.accommodation_override || {};

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let acc: any = null;
    let settings: any = null;
    let accPhoto = "";
    let facilities: string[] = [];

    if (accommodationId) {
      const [
        { data: accRow },
        { data: settingsRow },
        { data: photos },
        { data: facilityRows },
      ] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select(
            "id, name, address, phone, email, email_important_notice, email_show_security_deposit_notice, email_security_deposit_notice_title, email_security_deposit_notice",
          )
          .eq("id", accommodationId)
          .maybeSingle(),
        supabase
          .from("booking_settings")
          .select(
            "check_in_time, check_out_time, cancellation_policy, check_in_section_title, check_in_section_subtitle, other_notes",
          )
          .eq("accommodation_id", accommodationId)
          .maybeSingle(),
        supabase
          .from("accommodation_photos")
          .select("photo_url, display_order")
          .eq("accommodation_id", accommodationId)
          .order("display_order", { ascending: true })
          .limit(1),
        supabase
          .from("accommodation_facilities")
          .select("facility_name, is_available")
          .eq("accommodation_id", accommodationId)
          .is("room_scope", null)
          .order("category", { ascending: true }),
      ]);
      acc = accRow;
      settings = settingsRow;
      accPhoto = photos?.[0]?.photo_url || "";
      facilities = (facilityRows || [])
        .filter((f: any) => f.is_available !== false)
        .map((f: any) => f.facility_name)
        .filter(Boolean);
    }

    const mergedAcc = { ...(acc || {}), ...settingsOverride };

    const defaultExpire = new Date(Date.now() + 3 * 86400000).toISOString();
    const base = scenarioOrder(scenario, defaultExpire);

    const finalPrice = Number(overrides.final_price ?? 20000);
    const order = {
      id: "preview",
      order_number: "PREVIEW-001",
      order_status: "confirmed",
      guest_name: "王小明",
      guest_phone: "0912345678",
      guest_email: "preview@example.com",
      guest_count: 2,
      check_in_date: overrides.check_in_date || "2026-10-20",
      check_out_date: overrides.check_out_date || "2026-10-21",
      total_price: finalPrice,
      discount_amount: 0,
      final_price: finalPrice,
      order_source: "official_website",
      deposit_required_amount: null, // 入住押金與 Email 付款摘要無關
      deposit_amount: null,
      room_charge_status: null,
      accommodation_id: accommodationId,
      room_type_id: null,
      package_id: null,
      room_types: { name: "景觀雙人房" },
      ...base,
      ...(overrides.paid_amount !== undefined ? { paid_amount: Number(overrides.paid_amount) } : {}),
      ...(overrides.booking_deposit_amount !== undefined
        ? { booking_deposit_amount: overrides.booking_deposit_amount }
        : {}),
      ...(overrides.booking_deposit_percentage !== undefined
        ? { booking_deposit_percentage: overrides.booking_deposit_percentage }
        : {}),
      ...(overrides.atm_expire_at && base.atm_vacc_no
        ? { atm_expire_at: overrides.atm_expire_at }
        : {}),
    };

    const built = renderOrderConfirmationEmail(
      { order, acc: mergedAcc, settings, accPhoto, pkg: null, facilities },
      { siteUrl: "https://booking.lakeze.com" },
    );

    if (body?.format === "json") {
      return new Response(JSON.stringify({ subject: built.subject, html: built.html }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(built.html, {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return new Response(`Preview error: ${(err as Error).message}`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }
});
