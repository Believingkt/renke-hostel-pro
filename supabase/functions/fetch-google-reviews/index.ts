// Edge Function: fetch-google-reviews
// 從 Google Places API (New) 抓取指定地點的最新評論並寫回 accommodation_info.google_reviews_cache。
// 公開可呼叫(verify_jwt = false 預設),寫入用 service role 繞過 RLS。
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface GoogleReview {
  name?: string;
  rating?: number;
  text?: { text?: string; languageCode?: string };
  originalText?: { text?: string; languageCode?: string };
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  publishTime?: string;
  relativePublishTimeDescription?: string;
}

interface PlaceDetails {
  id?: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  reviews?: GoogleReview[];
  googleMapsUri?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) {
      return jsonResp({ error: "GOOGLE_PLACES_API_KEY not configured" }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const accommodationId: string | undefined = body.accommodationId;
    const force: boolean = body.force === true;
    const placeIdOverride: string | undefined = body.placeId;

    if (!accommodationId) {
      return jsonResp({ error: "accommodationId required" }, 400);
    }

    // 讀取 accommodation 設定
    const { data: acc, error: accErr } = await admin
      .from("accommodation_info")
      .select(
        "id, google_place_id, google_reviews_cache, google_reviews_cached_at"
      )
      .eq("id", accommodationId)
      .maybeSingle();

    if (accErr || !acc) {
      return jsonResp({ error: "accommodation not found" }, 404);
    }

    const placeId = placeIdOverride || acc.google_place_id;
    if (!placeId) {
      return jsonResp(
        { error: "no_place_id", message: "尚未設定 Google Place ID" },
        400
      );
    }

    // 快取仍新鮮就直接回傳
    if (!force && acc.google_reviews_cache && acc.google_reviews_cached_at) {
      const age = Date.now() - new Date(acc.google_reviews_cached_at).getTime();
      if (age < CACHE_TTL_MS) {
        return jsonResp({
          cached: true,
          cachedAt: acc.google_reviews_cached_at,
          data: acc.google_reviews_cache,
        });
      }
    }

    // 呼叫 Google Places API (New)
    const fields = [
      "id",
      "displayName",
      "rating",
      "userRatingCount",
      "googleMapsUri",
      "reviews",
    ].join(",");
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(
      placeId
    )}?languageCode=zh-TW&regionCode=TW`;

    const r = await fetch(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fields,
      },
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("Google Places API error", r.status, errText);
      return jsonResp(
        {
          error: "google_api_error",
          status: r.status,
          message: errText.slice(0, 500),
        },
        502
      );
    }

    const place = (await r.json()) as PlaceDetails;

    // 整理需要存的資料(精簡並去掉 PII 多餘欄位)
    const summary = {
      placeId: place.id || placeId,
      name: place.displayName?.text,
      rating: place.rating ?? null,
      totalReviews: place.userRatingCount ?? 0,
      googleMapsUri: place.googleMapsUri,
      reviews: (place.reviews || []).slice(0, 5).map((rv) => ({
        rating: rv.rating ?? 0,
        text:
          rv.text?.text ||
          rv.originalText?.text ||
          "",
        authorName: rv.authorAttribution?.displayName || "Google 使用者",
        authorPhoto: rv.authorAttribution?.photoUri || null,
        authorUrl: rv.authorAttribution?.uri || null,
        publishTime: rv.publishTime || null,
        relativeTime: rv.relativePublishTimeDescription || null,
      })),
    };

    const cachedAt = new Date().toISOString();
    const { error: upErr } = await admin
      .from("accommodation_info")
      .update({
        google_reviews_cache: summary,
        google_reviews_cached_at: cachedAt,
      })
      .eq("id", accommodationId);

    if (upErr) {
      console.error("Update cache error", upErr);
    }

    return jsonResp({ cached: false, cachedAt, data: summary });
  } catch (e) {
    console.error("fetch-google-reviews fatal", e);
    return jsonResp(
      { error: "internal", message: e instanceof Error ? e.message : String(e) },
      500
    );
  }
});

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
