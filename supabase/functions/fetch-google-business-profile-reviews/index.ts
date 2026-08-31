// Syncs Google Business Profile reviews into the candidate pool.
// This NEVER touches the public site: it only writes
// public.accommodation_google_business_reviews. Applying to the frontend is a
// separate, explicit admin action.
// deno-lint-ignore-file no-explicit-any
import {
  adminClient,
  authorizeAccommodation,
  corsHeaders,
  GbpError,
  getGoogleBusinessProfileAccessToken,
  jsonResp,
} from "../_shared/gbp.ts";
import {
  dedupRows,
  mapReviewToRow,
  MAX_PAGES,
  PAGE_SIZE,
  shouldFetchMore,
  trimToTarget,
  type CandidateRow,
} from "../_shared/gbpReviewMap.ts";

import { resolveCaller } from "../_shared/authz.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = adminClient();
  let accommodationId: string | undefined;

  try {
    const body = await req.json().catch(() => ({}));
    accommodationId = body.accommodationId;
    if (!accommodationId) return jsonResp({ error: "accommodationId required" }, 400);

    // Scheduled callers use the service role; manual callers must be
    // super_admin / hotel_admin / website_content-editable staff.
    const caller = await resolveCaller(req);
    if (!caller.ok) return jsonResp({ error: caller.error }, caller.status);
    if (!caller.ctx.isServiceRole) {
      const auth = await authorizeAccommodation(req, accommodationId);
      if (!auth.ok) return jsonResp({ error: auth.error }, auth.status);
    }

    const { data: cfg } = await admin
      .from("accommodation_google_business_profile")
      .select(
        "connection_status, selected_account_name, selected_location_name, sync_target",
      )
      .eq("accommodation_id", accommodationId)
      .maybeSingle();

    if (!cfg || cfg.connection_status !== "CONNECTED") {
      return jsonResp({ error: "GBP_NOT_CONNECTED" }, 400);
    }
    const accountName = cfg.selected_account_name;
    const locationName = cfg.selected_location_name;
    if (!accountName || !locationName) {
      return jsonResp({ error: "GBP_LOCATION_NOT_SELECTED" }, 400);
    }
    const syncTarget = cfg.sync_target ?? "50";

    const accessToken = await getGoogleBusinessProfileAccessToken(
      admin,
      accommodationId,
    );

    const syncedAt = new Date().toISOString();
    const rows: CandidateRow[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    let totalReported = 0;
    let averageRating: number | null = null;

    do {
      const url = new URL(
        `https://mybusiness.googleapis.com/v4/${accountName}/${locationName}/reviews`,
      );
      url.searchParams.set("pageSize", String(PAGE_SIZE));
      url.searchParams.set("orderBy", "updateTime desc");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) {
        const text = await r.text();
        console.error("gbp reviews api failed", r.status, text.slice(0, 300));
        throw new GbpError("GBP_API_ERROR", 502);
      }
      const json = await r.json();
      totalReported = json.totalReviewCount ?? totalReported;
      if (typeof json.averageRating === "number") averageRating = json.averageRating;

      for (const rv of json.reviews ?? []) {
        const row = mapReviewToRow(rv, {
          accommodationId,
          accountName,
          locationName,
          syncedAt,
        });
        if (row) rows.push(row);
      }
      pageToken = json.nextPageToken;
      pages += 1;
    } while (shouldFetchMore(rows.length, syncTarget, !!pageToken, pages));

    // Sync target caps how many candidates we persist (20 / 50 / ALL).
    // Writes are UPSERT ONLY — existing candidates are never deleted here.
    const finalRows = trimToTarget(dedupRows(rows), syncTarget);


    if (finalRows.length > 0) {
      const { error: upErr } = await admin
        .from("accommodation_google_business_reviews")
        .upsert(finalRows, { onConflict: "accommodation_id,review_name" });
      if (upErr) throw new Error(upErr.message);
    }

    const { count } = await admin
      .from("accommodation_google_business_reviews")
      .select("id", { count: "exact", head: true })
      .eq("accommodation_id", accommodationId);

    const partial = pages >= MAX_PAGES && !!pageToken;

    await admin
      .from("accommodation_google_business_profile")
      .update({
        last_business_profile_sync_at: syncedAt,
        last_business_profile_sync_status: partial ? "PARTIAL" : "SUCCESS",
        last_business_profile_sync_error: null,
        candidate_review_count: count ?? finalRows.length,
      })
      .eq("accommodation_id", accommodationId);

    return jsonResp({
      synced: finalRows.length,
      candidateCount: count ?? finalRows.length,
      totalReported,
      averageRating,
      pages,
      partial,
    });
  } catch (e) {
    const code = e instanceof GbpError ? e.code : "internal";
    const status = e instanceof GbpError ? e.status : 500;
    if (accommodationId) {
      await admin
        .from("accommodation_google_business_profile")
        .update({
          last_business_profile_sync_status: "FAILED",
          last_business_profile_sync_error: code,
        })
        .eq("accommodation_id", accommodationId);
    }
    return jsonResp({ error: code }, status);
  }
});
