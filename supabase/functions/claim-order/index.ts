import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    const body = await req.json();
    const { order_number, guest_name } = body;

    if (!order_number || !guest_name) {
      return new Response(JSON.stringify({ error: "請輸入訂單編號與訂房姓名" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find order by order_number + guest_name
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, order_number, guest_name, member_id")
      .eq("order_number", order_number.trim().toUpperCase())
      .maybeSingle();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "找不到此訂單，請確認訂單編號是否正確" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify guest name matches
    if (order.guest_name.trim() !== guest_name.trim()) {
      return new Response(JSON.stringify({ error: "訂房姓名不符，認領失敗" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already claimed
    if (order.member_id) {
      if (order.member_id === member.id) {
        return new Response(JSON.stringify({ error: "此訂單已經是您的訂單" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "此訂單已被其他會員認領" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Claim: update member_id
    const { error: updateError } = await adminClient
      .from("orders")
      .update({ member_id: member.id })
      .eq("id", order.id);

    if (updateError) {
      console.error("Claim error:", updateError);
      return new Response(JSON.stringify({ error: "認領失敗，請稍後再試" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, order_number: order.order_number }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "伺服器錯誤" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
