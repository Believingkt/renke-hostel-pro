// POST /functions/v1/intercom-user-hash（verify_jwt=false，於函式內以 auth.getUser 驗證使用者 JWT）
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { handleUserHash } from "./handler.ts";

serve((req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  return handleUserHash(req, {
    cors: buildCorsHeaders(req),
    secret: Deno.env.get("INTERCOM_IDENTITY_SECRET"),
    getUser: async (jwt) => {
      const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.auth.getUser(jwt);
      return error || !data.user ? null : { id: data.user.id };
    },
  });
});
