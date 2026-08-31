// Persists the chosen Business Account + Location for one accommodation.
// The pair is re-validated against Google using the accommodation's own OAuth
// token, so a client cannot bind a business it has no access to.
// deno-lint-ignore-file no-explicit-any
import {
  adminClient,
  authorizeAccommodation,
  corsHeaders,
  GbpError,
  getGoogleBusinessProfileAccessToken,
  jsonResp,
} from "../_shared/gbp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const accommodationId: string | undefined = body.accommodationId;
    const accountResourceName: string | undefined = body.accountResourceName;
    const locationResourceName: string | undefined = body.locationResourceName;
    if (!accommodationId || !accountResourceName || !locationResourceName) {
      return jsonResp({ error: "missing_parameters" }, 400);
    }

    const auth = await authorizeAccommodation(req, accommodationId);
    if (!auth.ok) return jsonResp({ error: auth.error }, auth.status);

    const admin = adminClient();
    const accessToken = await getGoogleBusinessProfileAccessToken(
      admin,
      accommodationId,
    );

    // Validate the account is manageable by this token.
    const accRes = await fetch(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!accRes.ok) return jsonResp({ error: "GBP_API_ERROR" }, 502);
    const accJson = await accRes.json();
    const account = (accJson.accounts ?? []).find(
      (a: any) => a.name === accountResourceName,
    );
    if (!account) return jsonResp({ error: "GBP_ACCOUNT_NOT_ACCESSIBLE" }, 403);

    // Validate the location belongs to that account.
    const locUrl = new URL(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountResourceName}/locations`,
    );
    locUrl.searchParams.set("readMask", "name,title");
    locUrl.searchParams.set("pageSize", "100");
    const locRes = await fetch(locUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!locRes.ok) return jsonResp({ error: "GBP_API_ERROR" }, 502);
    const locJson = await locRes.json();
    const location = (locJson.locations ?? []).find(
      (l: any) => l.name === locationResourceName,
    );
    if (!location) return jsonResp({ error: "GBP_LOCATION_NOT_ACCESSIBLE" }, 403);

    const { error } = await admin
      .from("accommodation_google_business_profile")
      .upsert(
        {
          accommodation_id: accommodationId,
          account_id: accountResourceName,
          location_id: locationResourceName,
          selected_account_name: accountResourceName,
          selected_location_name: locationResourceName,
          selected_location_title: location.title ?? null,
          connection_status: "CONNECTED",
        },
        { onConflict: "accommodation_id" },
      );
    if (error) return jsonResp({ error: "update_failed" }, 500);

    return jsonResp({
      connected: true,
      locationTitle: location.title ?? null,
      accountName: account.accountName ?? accountResourceName,
    });
  } catch (e) {
    if (e instanceof GbpError) return jsonResp({ error: e.code }, e.status);
    return jsonResp({ error: "internal" }, 500);
  }
});
