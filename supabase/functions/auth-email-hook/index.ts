const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Auth email hook received:", JSON.stringify({ type: payload.type, email: payload.email }));

    // Extract data from the auth webhook payload
    // Supabase send email hook payload shape:
    //   { user: { email, ... }, email_data: { token, token_hash, redirect_to, email_action_type, site_url } }
    // Legacy fallback: flat { type, email, confirmation_url, token, new_email }
    const userObj = payload.user || {};
    const emailData = payload.email_data || {};
    const type = payload.type || emailData.email_action_type;
    const email = payload.email || userObj.email;
    const token = payload.token || emailData.token;
    const tokenHash = emailData.token_hash;
    const redirectTo = emailData.redirect_to || payload.redirect_to;
    const siteUrl = emailData.site_url || payload.site_url || Deno.env.get("SUPABASE_URL");
    let confirmation_url: string | undefined = payload.confirmation_url;
    if (!confirmation_url && tokenHash && type && siteUrl) {
      const redirectParam = redirectTo ? `&redirect_to=${encodeURIComponent(redirectTo)}` : "";
      confirmation_url = `${siteUrl}/auth/v1/verify?token=${tokenHash}&type=${type}${redirectParam}`;
    }
    const new_email = payload.new_email || userObj.new_email;

    if (!email || !type) {
      return new Response(JSON.stringify({ error: "Missing type or email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map auth event types to template types
    const templateTypeMap: Record<string, string> = {
      signup: "signup",
      recovery: "recovery",
      magiclink: "magiclink",
      magic_link: "magiclink",
      invite: "invite",
      email_change: "email_change",
      reauthentication: "reauthentication",
    };

    const templateType = templateTypeMap[type];
    if (!templateType) {
      console.log("Unknown auth email type, skipping:", type);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const templateData: Record<string, any> = {};
    if (confirmation_url) templateData.confirmationUrl = confirmation_url;
    if (token) templateData.token = token;
    if (new_email) templateData.newEmail = new_email;


    // Call our send-resend-email function
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase environment variables");
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-resend-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        templateType,
        recipientEmail: email,
        templateData,
      }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error("Failed to send via Resend:", JSON.stringify(result));
      throw new Error(`Send failed: ${JSON.stringify(result)}`);
    }

    console.log("Auth email sent via Resend:", { type, email, resendId: result.id });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Auth email hook error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
