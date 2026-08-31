// Stores a PER-ACCOMMODATION Google OAuth client secret in Supabase Vault.
//
// SECURITY CONTRACT
//  - Authorization happens BEFORE the client secret is read from the body.
//  - Allowed: true super_admin (any accommodation) or hotel_admin of that
//    accommodation. Staff (editable/readonly/hidden), other roles and anon
//    are denied. `is_admin_or_super()` is deliberately NOT used.
//  - The Vault secret name is derived server-side from the accommodation id.
//  - The secret is never logged, never echoed, never written to a public table.
// deno-lint-ignore-file no-explicit-any
import { isAccommodationAdmin, resolveCaller } from "../_shared/authz.ts";
import { adminClient, corsHeaders, jsonResp } from "../_shared/gbp.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({} as any));

    // 1) Only the non-sensitive scope is read first.
    const accommodationId = typeof body.accommodation_id === "string"
      ? body.accommodation_id.trim()
      : "";
    if (!UUID_RE.test(accommodationId)) {
      return jsonResp({ error: "invalid_accommodation_id" }, 400);
    }

    // 2) Authorization before any secret handling.
    const resolved = await resolveCaller(req);
    if (!resolved.ok) return jsonResp({ error: resolved.error }, resolved.status);
    if (!(await isAccommodationAdmin(resolved.ctx, accommodationId))) {
      return jsonResp({ error: "Forbidden" }, 403);
    }

    // 3) Only now touch the secret. Value is kept verbatim (no trimming) —
    //    only empty / whitespace-only is rejected.
    const clientSecret = typeof body.client_secret === "string"
      ? body.client_secret
      : "";
    if (clientSecret.trim().length === 0) {
      return jsonResp({ error: "GBP_CLIENT_SECRET_REQUIRED" }, 400);
    }

    const admin = adminClient();
    const { data, error } = await admin.rpc(
      "gbp_save_accommodation_oauth_client_secret",
      { p_accommodation_id: accommodationId, p_client_secret: clientSecret },
    );

    if (error) {
      const msg = String(error.message ?? "");
      const known = [
        "GBP_OAUTH_CLIENT_ID_REQUIRED",
        "GBP_SETTINGS_ROW_NOT_FOUND",
        "GBP_CLIENT_SECRET_REQUIRED",
        "GBP_SECRET_STATE_UPDATE_FAILED",
      ].find((c) => msg.includes(c));
      return jsonResp({ error: known ?? "secret_save_failed" }, known ? 400 : 500);
    }

    if (!data || (data as any).configured !== true) {
      return jsonResp({ error: "secret_save_failed" }, 500);
    }

    return jsonResp({ configured: true, accommodation_id: accommodationId });
  } catch (_e) {
    // Intentionally opaque: error material must never carry secret content.
    return jsonResp({ error: "internal" }, 500);
  }
});
