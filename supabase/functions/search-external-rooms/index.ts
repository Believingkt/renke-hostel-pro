// PUBLIC endpoint (booking page dependency) — anonymous / authenticated /
// service-role are all allowed. DB writes = 0. Search logic lives in the
// shared core so the admin-only test endpoint reuses the exact same behavior.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { runExternalRoomsSearch } from "../_shared/externalRoomsSearch.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { accommodationId, checkIn, checkOut } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { status, body: payload } = await runExternalRoomsSearch(supabase, {
      accommodationId,
      checkIn,
      checkOut,
    });

    return new Response(
      JSON.stringify(payload),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[search-external-rooms] Error:', error);
    return new Response(
      JSON.stringify({ error: '系統錯誤，請稍後再試' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
