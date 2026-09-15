// Persists the chosen Business Account + Location for one accommodation.
// The pair is re-validated against Google using the accommodation's own OAuth
// token, so a client cannot bind a business it has no access to.
//
// Validation walks the SAME pagination contract as list-accounts (pageSize 20)
// and list-locations (pageSize 100). If the page cap is reached while Google
// still reports a nextPageToken, we FAIL CLOSED with a *_LOOKUP_LIMIT_REACHED
// error instead of treating "not yet scanned" as "not accessible" or "allowed".
// deno-lint-ignore-file no-explicit-any
import {
  adminClient,
  authorizeAccommodation,
  corsHeaders,
  GbpError,
  getGoogleBusinessProfileAccessToken,
  jsonResp,
} from "../_shared/gbp.ts";

const MAX_PAGES = 10;

type Lookup =
  | { status: "found"; item: any }
  | { status: "not_found" }
  | { status: "limit_reached" };

/** Scan every accessible account page until the requested one is found. */
async function findAccount(
  accessToken: string,
  accountResourceName: string,
): Promise<Lookup> {
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const url = new URL(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    );
    url.searchParams.set("pageSize", "20");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new GbpError("GBP_API_ERROR", 502);
    const json = await r.json();
    const hit = (json.accounts ?? []).find(
      (a: any) => a.name === accountResourceName,
    );
    if (hit) return { status: "found", item: hit };
    pageToken = json.nextPageToken;
    pages += 1;
  } while (pageToken && pages < MAX_PAGES);

  if (pageToken) return { status: "limit_reached" };
  return { status: "not_found" };
}

/** Scan every location page of the (already validated) account. */
async function findLocation(
  accessToken: string,
  accountResourceName: string,
  locationResourceName: string,
): Promise<Lookup> {
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const url = new URL(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountResourceName}/locations`,
    );
    url.searchParams.set("readMask", "name,title");
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new GbpError("GBP_API_ERROR", 502);
    const json = await r.json();
    const hit = (json.locations ?? []).find(
      (l: any) => l.name === locationResourceName,
    );
    if (hit) return { status: "found", item: hit };
    pageToken = json.nextPageToken;
    pages += 1;
  } while (pageToken && pages < MAX_PAGES);

  if (pageToken) return { status: "limit_reached" };
  return { status: "not_found" };
}

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

    // Validate the account is manageable by this token (all pages).
    const accLookup = await findAccount(accessToken, accountResourceName);
    if (accLookup.status === "limit_reached") {
      return jsonResp({ error: "GBP_ACCOUNT_LOOKUP_LIMIT_REACHED" }, 409);
    }
    if (accLookup.status !== "found") {
      return jsonResp({ error: "GBP_ACCOUNT_NOT_ACCESSIBLE" }, 403);
    }
    const account = accLookup.item;

    // Validate the location belongs to that account (all pages).
    const locLookup = await findLocation(
      accessToken,
      accountResourceName,
      locationResourceName,
    );
    if (locLookup.status === "limit_reached") {
      return jsonResp({ error: "GBP_LOCATION_LOOKUP_LIMIT_REACHED" }, 409);
    }
    if (locLookup.status !== "found") {
      return jsonResp({ error: "GBP_LOCATION_NOT_ACCESSIBLE" }, 403);
    }
    const location = locLookup.item;

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
