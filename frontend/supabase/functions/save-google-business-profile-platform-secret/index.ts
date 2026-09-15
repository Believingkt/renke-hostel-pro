// Stores the PLATFORM Google OAuth client secret in Supabase Vault.
// Super admin only. The secret never returns to the frontend and is never logged.
// deno-lint-ignore-file no-explicit-any
import { resolveCaller, isSuperAdmin } from "../_shared/authz.ts";
import {
  adminClient,
  corsHeaders,
  jsonResp,
  PLATFORM_SECRET_NAME,
  vaultSet,
} from "../_shared/gbp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const resolved = await resolveCaller(req);
    if (!resolved.ok) {
      return jsonResp({ error: resolved.error }, resolved.status);
    }
    if (!isSuperAdmin(resolved.ctx)) {
      return jsonResp({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const secret = typeof body.clientSecret === "string"
      ? body.clientSecret.trim()
      : "";
    if (secret.length < 8) {
      return jsonResp({ error: "invalid_secret" }, 400);
    }

    const admin = adminClient();
    await vaultSet(admin, PLATFORM_SECRET_NAME, secret);

    // Flag the singleton config row as configured (creating it when missing).
    const { data: existing } = await admin
      .from("google_business_profile_platform_config")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await admin
        .from("google_business_profile_platform_config")
        .update({ client_secret_configured: true })
        .eq("id", existing.id);
    } else {
      await admin
        .from("google_business_profile_platform_config")
        .insert({ client_secret_configured: true });
    }

    return jsonResp({ configured: true });
  } catch (_e) {
    // Intentionally opaque: never surface secret material in errors.
    return jsonResp({ error: "internal" }, 500);
  }
});
