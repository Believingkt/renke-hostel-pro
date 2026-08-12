import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

const FIELD_GUIDE = `你要收集的旅遊屬性欄位（依序）：
1. trip_duration 遊玩期程（例：2D1N）與 festival 節日情境（一般週末／連假／暑假／平日）
2. party_size 同行人數、companion_type 同行夥伴性質（family/couple/friends/group/other）
3. purpose 旅遊目的（休閒放鬆／美食巡禮／親子共遊／拍照打卡／戶外運動）
4. budget 每人預算（數字，新台幣）
5. highlights 期望遊玩重點（可複選，例：湖景放鬆／纜車眺望／環湖單車／在地美食／溫泉湯屋）`;

const SYSTEM_PROMPT = `你是「小安」，親切的旅遊管家。你要用「一次只問一件事」的對話方式，逐步收集旅客的旅遊屬性。

${FIELD_GUIDE}

規則：
- 每次回覆 ≤3 句，語氣親切、可適度使用 emoji。
- 一次只問下一個尚未取得的欄位，不要一次丟出長表單。
- 旅客已回答過的欄位不要重複詢問。
- 全部欄位都取得後，回覆一句溫暖的總結並告訴旅客可以開始規劃行程。

輸出格式：你「必須」只輸出一段 JSON（不要加上任何 markdown 標記或多餘文字），格式：
{"reply":"給旅客看的回覆文字","extracted":{"trip_duration":null,"festival":null,"party_size":null,"companion_type":null,"purpose":null,"budget":null,"highlights":null},"done":false}
extracted 只填目前對話中「已確定」的值，未知請用 null；highlights 為字串陣列；budget、party_size 為數字。done 在七個欄位都取得後為 true。`;

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

    const cleaned = messages
      .filter((m: any) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
      .slice(-20)
      .map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content).slice(0, 2000),
      }));

    const known = body?.known && typeof body.known === "object" ? body.known : {};

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const convo = cleaned.length
      ? cleaned
      : [{ role: "user", content: "（旅客剛進入導引，請你先打招呼並問第一個問題）" }];

    const t0 = Date.now();
    // 屬性抽取＝短輸出任務，改用低延遲模型
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        reasoning_effort: "none",
        max_tokens: 800,
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n目前已知屬性：${JSON.stringify(known)}` },
          ...convo,
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("gateway error", resp.status, errText);
      if (resp.status === 429) {
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

    const data = await resp.json();
    const raw = String(data?.choices?.[0]?.message?.content || "").trim();
    console.log("[traveler-guide] latency_ms", Date.now() - t0);


    let parsed: any = null;
    try {
      const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const start = jsonText.indexOf("{");
      const end = jsonText.lastIndexOf("}");
      parsed = JSON.parse(start >= 0 ? jsonText.slice(start, end + 1) : jsonText);
    } catch {
      parsed = { reply: raw || "不好意思，我剛剛恍神了 😅 可以再說一次嗎？", extracted: {}, done: false };
    }

    const ex = parsed?.extracted && typeof parsed.extracted === "object" ? parsed.extracted : {};
    const num = (v: unknown) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);

    const extracted = {
      trip_duration: str(ex.trip_duration),
      festival: str(ex.festival),
      party_size: num(ex.party_size),
      companion_type: str(ex.companion_type),
      purpose: str(ex.purpose),
      budget: num(ex.budget),
      highlights: Array.isArray(ex.highlights)
        ? ex.highlights.map((h: unknown) => str(h)).filter(Boolean).slice(0, 12)
        : null,
    };

    return new Response(
      JSON.stringify({
        reply: str(parsed?.reply) || "好的，我們繼續 😊",
        extracted,
        done: parsed?.done === true,
      }),
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
