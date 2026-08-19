import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  archiveGuideAttributes,
  mergeAttrs,
  runGuideTurn,
  type GuideLang,
} from "../_shared/travelerGuide.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60 * 1000;

function checkRateLimit(id: string): boolean {
  const now = Date.now();
  const rec = rateLimitMap.get(id);
  if (!rec || now > rec.resetTime) {
    rateLimitMap.set(id, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (rec.count >= RATE_LIMIT_MAX) return false;
  rec.count++;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(`traveler-guide:${clientIP}`)) {
      return new Response(JSON.stringify({ error: "請求過於頻繁，請稍後再試" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : null;
    if (!messages) {
      return new Response(JSON.stringify({ error: "訊息格式錯誤" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const known = body?.known && typeof body.known === "object" ? body.known : {};
    const lang = (["zh", "ja", "en"].includes(body?.lang) ? body.lang : "zh") as GuideLang;

    let turn;
    try {
      turn = await runGuideTurn({ messages, known, lang });
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "使用量超過限制，請稍後再試" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI 服務暫時無法回應" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 完成即落庫（先前 /trips/guide 僅由前端寫入，這裡補上後端保底歸檔）
    if (turn.done) {
      try {
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await archiveGuideAttributes(sb, {
          attrs: mergeAttrs(known, turn.extracted),
          sessionId: typeof body?.session_id === "string" ? body.session_id.slice(0, 100) : null,
          userId: null,
          accommodationId: typeof body?.accommodation_id === "string" ? body.accommodation_id : null,
          source: "trip_guide_page",
        });
      } catch (archErr) {
        console.error("traveler-guide archive error", archErr);
      }
    }

    return new Response(
      JSON.stringify({ reply: turn.reply, extracted: turn.extracted, done: turn.done }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("traveler-guide error", e);
    return new Response(JSON.stringify({ error: "系統錯誤，請稍後再試" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
