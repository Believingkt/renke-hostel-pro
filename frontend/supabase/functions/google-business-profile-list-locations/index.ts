// Lists locations under a Google Business Account.
// The account must be one the current OAuth token can actually manage —
// the client cannot pass an arbitrary account resource name.
// deno-lint-ignore-file no-explicit-any
import {
  adminClient,
  authorizeAccommodation,
  corsHeaders,
  GbpError,
  getGoogleBusinessProfileAccessToken,
  jsonResp,
} from "../_shared/gbp.ts";

async function listAccountNames(accessToken: string): Promise<Set<string>> {
  const names = new Set<string>();
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
    for (const a of json.accounts ?? []) if (a.name) names.add(a.name);
    pageToken = json.nextPageToken;
    pages += 1;
  } while (pageToken && pages < 10);
  return names;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const accommodationId: string | undefined = body.accommodationId;
    const accountResourceName: string | undefined = body.accountResourceName;
    if (!accommodationId || !accountResourceName) {
      return jsonResp({ error: "accommodationId and accountResourceName required" }, 400);
    }

    const auth = await authorizeAccommodation(req, accommodationId);
    if (!auth.ok) return jsonResp({ error: auth.error }, auth.status);

    const admin = adminClient();
    const accessToken = await getGoogleBusinessProfileAccessToken(
      admin,
      accommodationId,
    );

    const allowed = await listAccountNames(accessToken);
    if (!allowed.has(accountResourceName)) {
      return jsonResp({ error: "GBP_ACCOUNT_NOT_ACCESSIBLE" }, 403);
    }

    const readMask = "name,title,storeCode,storefrontAddress";
    const locations: any[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const url = new URL(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accountResourceName}/locations`,
      );
      url.searchParams.set("readMask", readMask);
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) {
        const text = await r.text();
        console.error("gbp list locations failed", r.status, text.slice(0, 300));
        return jsonResp({ error: "GBP_API_ERROR", status: r.status }, 502);
      }
      const json = await r.json();
      for (const l of json.locations ?? []) {
        const addr = l.storefrontAddress;
        const addressLine = addr
          ? [
            addr.administrativeArea,
            addr.locality,
            ...(addr.addressLines ?? []),
          ].filter(Boolean).join("")
          : null;
        locations.push({
          name: l.name,
          title: l.title,
          storeCode: l.storeCode ?? null,
          address: addressLine,
        });
      }
      pageToken = json.nextPageToken;
      pages += 1;
    } while (pageToken && pages < 10);

    return jsonResp({ locations });
  } catch (e) {
    if (e instanceof GbpError) return jsonResp({ error: e.code }, e.status);
    return jsonResp({ error: "internal" }, 500);
  }
});
