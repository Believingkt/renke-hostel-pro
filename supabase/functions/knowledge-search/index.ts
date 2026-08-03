import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const CATEGORIES = ["room", "facility", "policy", "location", "faq", "other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const started = performance.now();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const query = typeof payload.query === "string" ? payload.query.trim() : "";
    const category =
      typeof payload.category === "string" && CATEGORIES.includes(payload.category)
        ? payload.category
        : null;
    const accommodationId =
      typeof payload.accommodation_id === "string" && payload.accommodation_id
        ? payload.accommodation_id
        : null;
    const limit =
      typeof payload.limit === "number" && payload.limit > 0
        ? Math.min(Math.floor(payload.limit), 100)
        : 20;

    if (query.length > 200) return json({ error: "Query too long (max 200)" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const { data, error } = await supabase.rpc("search_ai_knowledge", {
      p_query: query,
      p_category: category,
      p_accommodation_id: accommodationId,
      p_limit: limit,
    });

    if (error) {
      console.error("search_ai_knowledge failed", error);
      return json({ error: error.message, took_ms: Math.round(performance.now() - started) }, 500);
    }

    const results = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      snippet:
        (row.snippet as string) ||
        String(row.content ?? "").slice(0, 160),
      rank: Number(row.rank ?? 0),
      is_active: row.is_active,
      updated_at: row.updated_at,
    }));

    return json({
      results,
      total: results.length,
      took_ms: Math.round(performance.now() - started),
    });
  } catch (e) {
    console.error("knowledge-search error", e);
    return json(
      { error: e instanceof Error ? e.message : "Unknown error", took_ms: Math.round(performance.now() - started) },
      500,
    );
  }
});
