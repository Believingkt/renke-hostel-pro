// debug-order-rls: 用當前使用者的 JWT 對 orders 做「乾式」insert，
// 直接回傳 RLS/trigger 的錯誤訊息，用來排查為什麼某民宿下訂會失敗。
// 使用：帶會員登入的 Authorization 呼叫此 function，body 傳一份完整的 order payload。
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "missing Authorization" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData } = await client.auth.getUser();
  const payload = await req.json().catch(() => ({}));

  // Rollback insert：用 savepoint 模擬。這裡直接 insert 後刪除，避免污染。
  const { data, error } = await client.from("orders").insert(payload).select("id").single();

  if (error) {
    return new Response(JSON.stringify({
      ok: false,
      user_id: userData.user?.id ?? null,
      user_email: userData.user?.email ?? null,
      error_code: (error as any).code,
      error_message: error.message,
      error_details: (error as any).details,
      error_hint: (error as any).hint,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 清理 dry-run 資料（用 service role）
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  await admin.from("orders").delete().eq("id", data.id);

  return new Response(JSON.stringify({
    ok: true,
    user_id: userData.user?.id ?? null,
    inserted_and_deleted_id: data.id,
    message: "insert 通過 RLS + trigger，此民宿下訂流程正常",
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
