// ADMIN-ONLY maintenance endpoint: test the TravelMap connection for one
// accommodation. Same search core as the public `search-external-rooms`, but
// gated to super_admin / hotel_admin of the target accommodation.
//
// Staff are DENY even with staff_module_permissions.channel_manager='editable'.
// No credential may be supplied by the client; secrets stay server-side.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  forbiddenResponse,
  isAccommodationAdmin,
  resolveCaller,
  unauthorizedResponse,
} from "../_shared/authz.ts";
import { runExternalRoomsSearch } from "../_shared/externalRoomsSearch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authed = await resolveCaller(req);
    if (!authed.ok) {
      return authed.status === 401
        ? unauthorizedResponse(corsHeaders)
        : forbiddenResponse(corsHeaders, "此操作僅限管理員");
    }
    const ctx = authed.ctx;

    const body = await req.json().catch(() => ({}));
    const accommodationId = body.accommodationId ? String(body.accommodationId) : "";
    if (!accommodationId) {
      return new Response(JSON.stringify({ error: "缺少必要參數：accommodationId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!(await isAccommodationAdmin(ctx, accommodationId))) {
      return forbiddenResponse(corsHeaders, "此操作僅限管理員");
    }

    const { status, body: payload } = await runExternalRoomsSearch(ctx.admin, {
      accommodationId,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
    });

    return new Response(JSON.stringify(payload), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[test-external-rooms-connection] Error:", error);
    return new Response(JSON.stringify({ error: "系統錯誤，請稍後再試" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
