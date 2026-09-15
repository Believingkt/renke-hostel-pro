// Lists the Google Business Accounts the connected Google user can manage.
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
    if (!accommodationId) return jsonResp({ error: "accommodationId required" }, 400);

    const auth = await authorizeAccommodation(req, accommodationId);
    if (!auth.ok) return jsonResp({ error: auth.error }, auth.status);

    const admin = adminClient();
    const accessToken = await getGoogleBusinessProfileAccessToken(
      admin,
      accommodationId,
    );

    const accounts: any[] = [];
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
      if (!r.ok) {
        const text = await r.text();
        console.error("gbp list accounts failed", r.status, text.slice(0, 300));
        return jsonResp({ error: "GBP_API_ERROR", status: r.status }, 502);
      }
      const json = await r.json();
      for (const a of json.accounts ?? []) {
        accounts.push({
          name: a.name,
          accountName: a.accountName,
          type: a.type,
          role: a.role,
          verificationState: a.verificationState,
        });
      }
      pageToken = json.nextPageToken;
      pages += 1;
    } while (pageToken && pages < 10);

    return jsonResp({ accounts });
  } catch (e) {
    if (e instanceof GbpError) return jsonResp({ error: e.code }, e.status);
    return jsonResp({ error: "internal" }, 500);
  }
});
