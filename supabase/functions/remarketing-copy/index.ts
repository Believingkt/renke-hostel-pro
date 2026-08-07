// E2 AI 文案產生（小安語氣）
// POST /functions/v1/remarketing-copy  body: { segment_summary, interest_tags?, product_names?, goal? }
// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ADMIN_ROLES = ["super_admin", "admin", "hotel_admin", "owner"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.replace(/^Bearer\s+/i, "").trim() !== serviceKey) {
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
      if (!(roles ?? []).some((r: any) => ADMIN_ROLES.includes(r.role))) return json({ error: "Forbidden" }, 403);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const summary = String(body?.segment_summary ?? "全部旅客");
    const tags: string[] = Array.isArray(body?.interest_tags) ? body.interest_tags.slice(0, 10) : [];
    const products: string[] = Array.isArray(body?.product_names) ? body.product_names.slice(0, 6) : [];
    const goal = String(body?.goal ?? "邀請旅客二次回訪訂房");

    const prompt =
      `請為旅宿品牌「人客多」撰寫一封二次再行銷推播文案。\n` +
      `分群條件：${summary}\n` +
      `旅客常見興趣標籤：${tags.join("、") || "（無）"}\n` +
      `推薦商品：${products.join("、") || "（無，請泛指旅宿體驗）"}\n` +
      `目標：${goal}\n` +
      `語氣：AI 管家「小安」，親切、口語、繁體中文。\n` +
      `限制：內文 ≤3 句、不要誇大不實、不要用 emoji 以外的符號堆疊。\n` +
      `以 JSON 回覆：{"subject":"","body":"","cta_text":""}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "你是旅宿行銷文案助理小安，只輸出 JSON，不要 markdown。" },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (aiRes.status === 429) return json({ error: "AI 服務忙碌中（429），請稍後再試" }, 429);
    if (aiRes.status === 402) return json({ error: "AI 額度不足（402），請至設定加值" }, 402);
    if (!aiRes.ok) return json({ error: `AI ${aiRes.status}: ${await aiRes.text()}` }, 500);

    const aiJson = await aiRes.json();
    const raw: string = aiJson?.choices?.[0]?.message?.content ?? "";
    let parsed: any = {};
    try { parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()); } catch { return json({ error: "AI 回傳非 JSON" }, 500); }

    return json({
      success: true,
      subject: String(parsed.subject ?? "").slice(0, 120),
      body: String(parsed.body ?? "").slice(0, 800),
      cta_text: String(parsed.cta_text ?? "立即查看").slice(0, 30),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
