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

    if (refreshToken) {
      try {
        await fetch(GOOGLE_REVOKE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: refreshToken }),
        });
      } catch {
        // Revocation is best-effort; local cleanup still proceeds.
      }
      await vaultDelete(admin, secretName);
    }

    const { error } = await admin
      .from("accommodation_google_business_profile")
      .update({
        connection_status: "NOT_CONFIGURED",
        account_id: null,
        location_id: null,
        selected_account_name: null,
        selected_location_name: null,
        selected_location_title: null,
        oauth_connected_at: null,
        review_source: "PLACES",
      })
      .eq("accommodation_id", accommodationId);
    if (error) return jsonResp({ error: "update_failed" }, 500);

    return jsonResp({ disconnected: true });
  } catch (_e) {
    return jsonResp({ error: "internal" }, 500);
  }
});
