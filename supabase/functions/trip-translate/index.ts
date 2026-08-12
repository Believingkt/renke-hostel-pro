/**
 * trip-translate — 行程快照三語補寫（zh → ja / en）
 * - 由 trip-recommend / lineTrip 於背景觸發，也可由前端「重試」直接呼叫。
 * - 只補寫 ja / en，zh 與所有價格／品項一律沿用快照原值。
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// deno-lint-ignore no-explicit-any
type Tri = { zh: string; ja: string; en: string } | any;

const asTri = (v: Tri) => ({
  zh: typeof v?.zh === "string" ? v.zh : typeof v === "string" ? v : "",
  ja: typeof v?.ja === "string" ? v.ja : "",
  en: typeof v?.en === "string" ? v.en : "",
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let id = "";
  try {
    const body = await req.json().catch(() => ({}));
    id = typeof body?.id === "string" ? body.id : "";
    if (!id) {
      return new Response(JSON.stringify({ error: "缺少快照 id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error } = await supabase
      .from("trip_generations")
      .select("id, payload, translation_status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!row?.payload) {
      return new Response(JSON.stringify({ error: "找不到行程快照" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // deno-lint-ignore no-explicit-any
    const trip: any = row.payload;
    const title = asTri(trip?.title);
    const guide = asTri(trip?.guide);
    // deno-lint-ignore no-explicit-any
    const items: any[] = Array.isArray(trip?.items) ? trip.items : [];

    const alreadyDone =
      row.translation_status === "ready" &&
      title.ja && title.en &&
      items.every((i) => {
        const g = asTri(i?.guide);
        return !g.zh || (g.ja && g.en);
      });
    if (alreadyDone) {
      return new Response(JSON.stringify({ ok: true, status: "ready", skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("trip_generations")
      .update({ translation_status: "pending" })
      .eq("id", id);

    const source = {
      title: title.zh,
      guide: guide.zh,
      items: items.map((i, idx) => ({
        i: idx,
        name: typeof i?.name === "string" ? i.name : asTri(i?.name).zh,
        guide: asTri(i?.guide).zh,
      })),
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        reasoning_effort: "none",
        max_tokens: 3000,
        messages: [
          {
            role: "system",
            content:
              "你是旅遊文案翻譯員。把繁體中文行程文案翻成日文(ja)與英文(en)，語氣同樣親切自然，長度接近原文。" +
              "地名／店名採當地慣用譯法。只輸出 JSON（不要 markdown），格式：" +
              '{"title":{"ja":"","en":""},"guide":{"ja":"","en":""},"items":[{"i":0,"name":{"ja":"","en":""},"guide":{"ja":"","en":""}}]}',
          },
          { role: "user", content: JSON.stringify(source) },
        ],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("[trip-translate] model error", r.status, t.slice(0, 300));
      throw new Error(`model ${r.status}`);
    }

    const j = await r.json();
    const raw = (j?.choices?.[0]?.message?.content || "").trim();
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    const parsed = JSON.parse(s >= 0 ? raw.slice(s, e + 1) : raw);

    const pick = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v.slice(0, 300) : fb);
    // deno-lint-ignore no-explicit-any
    const pItems: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
    const byIdx = new Map(pItems.map((p) => [Number(p?.i), p]));

    const nextTrip = {
      ...trip,
      title: { zh: title.zh, ja: pick(parsed?.title?.ja, title.zh), en: pick(parsed?.title?.en, title.zh) },
      guide: { zh: guide.zh, ja: pick(parsed?.guide?.ja, guide.zh), en: pick(parsed?.guide?.en, guide.zh) },
      items: items.map((it, idx) => {
        const p = byIdx.get(idx);
        const g = asTri(it?.guide);
        const nameTri = typeof it?.name === "string" ? { zh: it.name, ja: "", en: "" } : asTri(it?.name);
        return {
          ...it,
          name: {
            zh: nameTri.zh,
            ja: pick(p?.name?.ja, nameTri.ja || nameTri.zh),
            en: pick(p?.name?.en, nameTri.en || nameTri.zh),
          },
          guide: {
            zh: g.zh,
            ja: g.zh ? pick(p?.guide?.ja, g.ja || g.zh) : "",
            en: g.zh ? pick(p?.guide?.en, g.en || g.zh) : "",
          },
        };
      }),
    };

    await supabase
      .from("trip_generations")
      .update({ payload: nextTrip, translation_status: "ready", translated_at: new Date().toISOString() })
      .eq("id", id);

    console.log("[trip-translate] done", id);
    return new Response(JSON.stringify({ ok: true, status: "ready", payload: nextTrip }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[trip-translate] failed", err);
    if (id) {
      await supabase.from("trip_generations").update({ translation_status: "failed" }).eq("id", id);
    }
    return new Response(JSON.stringify({ error: "翻譯失敗，請重試", status: "failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
