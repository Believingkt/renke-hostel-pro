// 每日 10:00（台北）推播「明日入住提醒」給有 App 的會員
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pushOrderEvent } from "../_shared/push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 台北時區的「明天」
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() + 24 * 60 * 60 * 1000))
    .reduce<Record<string, string>>((a, p) => (a[p.type] = p.value, a), {});
  const tomorrow = `${parts.year}-${parts.month}-${parts.day}`;

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id")
    .eq("check_in_date", tomorrow)
    .neq("order_status", "cancelled")
    .not("member_id", "is", null)
    .limit(500);

  if (error) {
    console.error("[push-checkin-reminders] query error", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  for (const o of orders ?? []) {
    await pushOrderEvent(o.id, "checkin_reminder");
  }

  return new Response(
    JSON.stringify({ success: true, date: tomorrow, count: orders?.length ?? 0 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
