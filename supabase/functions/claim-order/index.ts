import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Normalize Chinese/English names: trim, collapse whitespace, lowercase, remove common punctuation
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[.,'"`·・]/g, "");
}

// Extract last 4 digits of a phone (digits only)
function lastFourDigits(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.slice(-4);
}

async function logAttempt(
  adminClient: ReturnType<typeof createClient>,
  params: {
    user_id: string;
    user_email: string | null;
    accommodation_id: string | null;
    success: boolean;
    reason: string;
    order_number: string;
    ip: string | null;
    ua: string | null;
  },
) {
  try {
    await adminClient.from("audit_logs").insert({
      user_id: params.user_id,
      user_email: params.user_email,
      accommodation_id: params.accommodation_id,
      action_category: "member",
      action_type: params.success ? "claim_order_success" : "claim_order_failed",
      entity_type: "order",
      entity_name: params.order_number,
      ip_address: params.ip,
      user_agent: params.ua,
      details: { reason: params.reason },
    });
  } catch (e) {
    console.error("audit log insert failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    null;
  const ua = req.headers.get("user-agent") || null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "未授權" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "無效的認證" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get member
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: member } = await adminClient
      .from("platform_members")
      .select("id, name, email, phone")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member) {
      return new Response(JSON.stringify({ error: "找不到會員資料" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { order_number, guest_name, phone_last4 } = body as {
      order_number?: string;
      guest_name?: string;
      phone_last4?: string;
    };

    if (!order_number || !guest_name || !phone_last4) {
      return new Response(
        JSON.stringify({ error: "請輸入訂單編號、訂房姓名與聯絡電話末4碼" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const normalizedOrderNumber = String(order_number).trim().toUpperCase();
    const normalizedPhoneLast4 = String(phone_last4).replace(/\D/g, "").slice(-4);

    if (normalizedPhoneLast4.length !== 4) {
      return new Response(JSON.stringify({ error: "電話末4碼格式錯誤" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find order
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, order_number, guest_name, guest_phone, member_id, accommodation_id")
      .eq("order_number", normalizedOrderNumber)
      .maybeSingle();

    if (orderError || !order) {
      await logAttempt(adminClient, {
        user_id: user.id,
        user_email: user.email ?? null,
        accommodation_id: null,
        success: false,
        reason: "order_not_found",
        order_number: normalizedOrderNumber,
        ip,
        ua,
      });
      return new Response(
        JSON.stringify({ error: "找不到此訂單，請確認訂單編號是否正確" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify guest name (normalized)
    if (normalizeName(order.guest_name) !== normalizeName(guest_name)) {
      await logAttempt(adminClient, {
        user_id: user.id,
        user_email: user.email ?? null,
        accommodation_id: order.accommodation_id,
        success: false,
        reason: "name_mismatch",
        order_number: order.order_number,
        ip,
        ua,
      });
      return new Response(JSON.stringify({ error: "訂房資訊驗證失敗，認領失敗" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify phone last 4
    if (lastFourDigits(order.guest_phone) !== normalizedPhoneLast4) {
      await logAttempt(adminClient, {
        user_id: user.id,
        user_email: user.email ?? null,
        accommodation_id: order.accommodation_id,
        success: false,
        reason: "phone_mismatch",
        order_number: order.order_number,
        ip,
        ua,
      });
      return new Response(JSON.stringify({ error: "訂房資訊驗證失敗，認領失敗" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already claimed?
    if (order.member_id) {
      const reason = order.member_id === member.id ? "already_owned" : "already_claimed";
      await logAttempt(adminClient, {
        user_id: user.id,
        user_email: user.email ?? null,
        accommodation_id: order.accommodation_id,
        success: false,
        reason,
        order_number: order.order_number,
        ip,
        ua,
      });
      const msg =
        order.member_id === member.id
          ? "此訂單已經是您的訂單"
          : "此訂單已被其他會員認領";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Claim
    const { error: updateError } = await adminClient
      .from("orders")
      .update({ member_id: member.id })
      .eq("id", order.id);

    if (updateError) {
      console.error("Claim error:", updateError);
      await logAttempt(adminClient, {
        user_id: user.id,
        user_email: user.email ?? null,
        accommodation_id: order.accommodation_id,
        success: false,
        reason: "update_failed",
        order_number: order.order_number,
        ip,
        ua,
      });
      return new Response(JSON.stringify({ error: "認領失敗，請稍後再試" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logAttempt(adminClient, {
      user_id: user.id,
      user_email: user.email ?? null,
      accommodation_id: order.accommodation_id,
      success: true,
      reason: "ok",
      order_number: order.order_number,
      ip,
      ua,
    });

    return new Response(
      JSON.stringify({ success: true, order_number: order.order_number }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "伺服器錯誤" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
