import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdatePasswordRequest {
  token: string;
  newPassword: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, newPassword }: UpdatePasswordRequest = await req.json();
    console.log("Processing password update");

    if (!token || !newPassword) {
      throw new Error("缺少必要參數");
    }

    if (newPassword.length < 6) {
      throw new Error("密碼長度至少需要 6 個字元");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify token
    const { data: tokenData, error: tokenError } = await supabase
      .from("password_reset_tokens")
      .select("*")
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (tokenError || !tokenData) {
      console.error("Token verification failed:", tokenError);
      throw new Error("無效或已過期的重設連結");
    }

    console.log("Token verified for user:", tokenData.user_id);

    // Update user password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      tokenData.user_id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("Password update failed:", updateError);
      throw new Error("更新密碼失敗");
    }

    // Mark token as used
    const { error: markError } = await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);

    if (markError) {
      console.error("Failed to mark token as used:", markError);
      // Don't throw here, password was already updated
    }

    // Update profile to remove force_password_change if exists
    await supabase
      .from("profiles")
      .update({ force_password_change: false })
      .eq("id", tokenData.user_id);

    console.log("Password updated successfully");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in update-password function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "更新失敗" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
