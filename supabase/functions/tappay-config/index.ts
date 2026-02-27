import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Allowed origins for CORS - restrict to known domains only
const allowedOrigins = [
  'https://sensan.lovable.app',
  'https://dmafqwfynatdvnaeovhz.lovableproject.com',
  'https://sensaninn.lakeze.com',
  'https://renke-hostel-pro.lovable.app',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const isTrustedLovableOrigin =
    origin.endsWith('.lovable.app') || origin.endsWith('.lovableproject.com');
  const allowedOrigin =
    !origin
      ? allowedOrigins[0]
      : allowedOrigins.includes(origin) || isTrustedLovableOrigin
        ? origin
        : '';
  
  // If origin is not allowed, return empty to block the request
  if (!allowedOrigin) {
    return {
      'Access-Control-Allow-Origin': allowedOrigins[0],
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    };
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Basic request log for debugging (no sensitive data)
  console.log("[tappay-config]", req.method, req.headers.get("origin") ?? "");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Reject requests from untrusted origins
  const origin = req.headers.get('origin') || '';
  const isTrustedOrigin =
    !origin || // Allow no-origin (server-to-server)
    allowedOrigins.includes(origin) ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com');

  if (!isTrustedOrigin) {
    console.warn("[tappay-config] Blocked request from untrusted origin:", origin);
    return new Response(
      JSON.stringify({ success: false, message: "Forbidden" }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
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
