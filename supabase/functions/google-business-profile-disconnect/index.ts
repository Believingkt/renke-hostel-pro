// Disconnects one accommodation from Google Business Profile.
// Revokes the Google token, removes the Vault refresh token and clears
// connection metadata. Candidate reviews and the live site cache are KEPT so
// the public website never suddenly loses its reviews.
// deno-lint-ignore-file no-explicit-any
import {
  adminClient,
  authorizeAccommodation,
  corsHeaders,
  GOOGLE_REVOKE_ENDPOINT,
  jsonResp,
  refreshTokenSecretName,
  vaultDelete,
  vaultGet,
} from "../_shared/gbp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const accommodationId: string | undefined = body.accommodationId;
    if (!accommodationId) return jsonResp({ error: "accommodationId required" }, 400);

    const auth = await authorizeAccommodation(req, accommodationId);
    if (!auth.ok) return jsonResp({ error: auth.error }, auth.status);

    const admin = adminClient();
    const secretName = refreshTokenSecretName(accommodationId);
    const refreshToken = await vaultGet(admin, secretName);

    // Best-effort Google revoke: a Google-side failure (timeout / 5xx /
    // already-revoked) must NEVER block the owner from disconnecting locally.
    // Only a sanitized status code is recorded — never token material.
    let revokeStatus: "SKIPPED" | "REVOKED" | "REVOKE_FAILED" = "SKIPPED";
    if (refreshToken) {
      try {
        const r = await fetch(GOOGLE_REVOKE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: refreshToken }),
        });
        revokeStatus = r.ok ? "REVOKED" : "REVOKE_FAILED";
        if (!r.ok) console.warn("gbp revoke non-ok", r.status);
      } catch {
        revokeStatus = "REVOKE_FAILED";
        console.warn("gbp revoke request failed");
      }
      await vaultDelete(admin, secretName);
    }

    // review_source is intentionally NOT reset to PLACES: doing so would let
    // the Places auto-sync overwrite reviews the owner already applied.
    const { data: updated, error } = await admin
      .from("accommodation_google_business_profile")
      .update({
        connection_status: "NOT_CONFIGURED",
        account_id: null,
        location_id: null,
        selected_account_name: null,
        selected_location_name: null,
        selected_location_title: null,
        oauth_connected_at: null,
        last_business_profile_sync_error: null,
      })
      .eq("accommodation_id", accommodationId)
      .select("accommodation_id");
    if (error) return jsonResp({ error: "update_failed" }, 500);

    const affected = (updated ?? []).filter(
      (r: any) => r?.accommodation_id === accommodationId,
    );
    if (affected.length !== 1) {
      return jsonResp({ error: "GBP_DISCONNECT_NO_ROW" }, 409);
    }

    return jsonResp({
      disconnected: true,
      revokeStatus,
      localRefreshTokenRemoved: true,
    });
  } catch (_e) {
    return jsonResp({ error: "internal" }, 500);
  }
});
