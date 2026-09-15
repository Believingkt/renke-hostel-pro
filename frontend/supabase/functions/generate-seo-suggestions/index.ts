// 依館別名稱／簡介／地區，用 Lovable AI 產生 SEO 標題、描述、關鍵字與社群分享文案。
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { name, description, address, region, extra } = await req.json();
    if (!name || typeof name !== "string" || !name.trim()) {
      return json({ error: "name is required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const prompt = `你是台灣民宿／旅宿的 SEO 文案專家。請依下列資訊，產生繁體中文（台灣用語）的 SEO 內容。

館別名稱：${name}
簡介：${String(description ?? "").slice(0, 1200) || "（未提供）"}
地址：${String(address ?? "") || "（未提供）"}
地區：${String(region ?? "") || "（未提供）"}
其他：${String(extra ?? "") || "（未提供）"}

規則：
- seo_title：含館別名稱與地區或特色，30-60 個字元以內，不可超過 60。
- seo_description：吸引點擊的描述，80-160 個字元，不可超過 160，結尾可包含線上訂房相關行動呼籲。
- meta_keywords：5-8 個以半形逗號分隔的關鍵字，總長不超過 200 字元。
- og_title：適合 Facebook／LINE 分享的標題，不超過 60 字元。
- og_description：適合社群分享的描述，不超過 160 字元。
- 不要杜撰未提供的設施、價格、電話或獎項。
只回傳 JSON 物件，不要任何額外文字或程式碼區塊標記。`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        tools: [
          {
            type: "function",
            function: {
              name: "return_seo",
              description: "回傳 SEO 建議內容",
              parameters: {
                type: "object",
                properties: {
                  seo_title: { type: "string" },
                  seo_description: { type: "string" },
                  meta_keywords: { type: "string" },
                  og_title: { type: "string" },
                  og_description: { type: "string" },
                },
                required: [
                  "seo_title",
                  "seo_description",
                  "meta_keywords",
                  "og_title",
                  "og_description",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_seo" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      if (resp.status === 429) return json({ error: "AI 使用量已達上限，請稍後再試" }, 429);
      if (resp.status === 402) return json({ error: "AI 額度不足，請先加值" }, 402);
      return json({ error: "AI 服務暫時無法使用" }, 500);
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: Record<string, string> = {};
    if (call?.function?.arguments) {
      parsed = JSON.parse(call.function.arguments);
    } else {
      const raw = String(data?.choices?.[0]?.message?.content ?? "").replace(
        /^```(?:json)?|```$/g,
        "",
      );
      parsed = JSON.parse(raw.trim());
    }

    const clamp = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

    return json({
      seo_title: clamp(parsed.seo_title, 60),
      seo_description: clamp(parsed.seo_description, 160),
      meta_keywords: clamp(parsed.meta_keywords, 200),
      og_title: clamp(parsed.og_title || parsed.seo_title, 60),
      og_description: clamp(parsed.og_description || parsed.seo_description, 160),
    });
  } catch (e) {
    console.error("generate-seo-suggestions error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
