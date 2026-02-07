import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

serve(async (req) => {
  // Basic request log for debugging (no sensitive data)
  console.log("[tappay-config]", req.method, req.headers.get("origin") ?? "");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const appId = Deno.env.get("TAPPAY_APP_ID");
    const appKey = Deno.env.get("TAPPAY_APP_KEY");
    const envRaw = Deno.env.get("TAPPAY_ENV");
    const env = envRaw === "sandbox" ? "sandbox" : "production";

    if (!appId || !appKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "TapPay credentials not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        appId,
        appKey,
        env,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in tappay-config function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Unexpected error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
