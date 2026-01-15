import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const allowedOrigins = [
  "https://sensan.lovable.app",
  "https://dmafqwfynatdvnaeovhz.lovableproject.com",
  "https://sensaninn.lakeze.com",
  "https://renke-hostel-pro.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";

  const isTrustedLovableOrigin =
    origin.endsWith(".lovable.app") || origin.endsWith(".lovableproject.com");

  const allowedOrigin =
    !origin
      ? allowedOrigins[0]
      : allowedOrigins.includes(origin) || isTrustedLovableOrigin
        ? origin
        : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
