// 旅客 AI 對話標籤（CDP）
// POST /functions/v1/traveler-tagging
// body: { limit?: number, traveler_id?: string, days?: number }
// 冪等：同一旅客重跑會「覆蓋」interest_tags / custom_needs（AI 段），非累加重複
// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCustomerKey } from "../_shared/travelerKey.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(?:\+?886|0)9\d{2}[- ]?\d{3}[- ]?\d{3}/g;

function conversationText(messages: any): string {
  if (!Array.isArray(messages)) return "";
  return messages
    .map((m: any) => {
      const role = m?.role ?? "";
      const content = typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? "");
      return `${role}: ${content}`;
    })
    .join("\n")
    .slice(0, 6000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearer !== serviceKey) {
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
      const allowed = (roles ?? []).some((r: any) => ["super_admin", "admin", "hotel_admin"].includes(r.role));
      if (!allowed) return json({ error: "Forbidden" }, 403);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    let body: any = {};
    try { body = await req.json(); } catch { /* 空 body 視為批次 */ }
    const batchLimit = Math.min(Math.max(Number(body?.limit) || 20, 1), 50);
    const days = Math.min(Math.max(Number(body?.days) || 180, 1), 3650);
    const travelerId = typeof body?.traveler_id === "string" ? body.traveler_id : null;

    // 旅客檔案（比對用）
    let profilesQuery = admin
      .from("traveler_profiles")
      .select("id,customer_key,email,phone,display_name,user_id,custom_needs")
      .limit(5000);
    if (travelerId) profilesQuery = admin
      .from("traveler_profiles")
      .select("id,customer_key,email,phone,display_name,user_id,custom_needs")
      .eq("id", travelerId);
    const { data: profiles, error: pErr } = await profilesQuery;
    if (pErr) return json({ error: pErr.message }, 500);
    if (!profiles?.length) return json({ success: true, processed: 0, note: "尚無旅客檔案，請先執行同步" });

    const keyToProfile = new Map<string, any>(profiles.map((p: any) => [p.customer_key, p]));
    const userIdToProfile = new Map<string, any>(
      profiles.filter((p: any) => p.user_id).map((p: any) => [p.user_id, p]),
    );
    // 姓名比對（3 字以上才用，避免誤判）
    const nameToProfile = new Map<string, any>(
      profiles
        .filter((p: any) => typeof p.display_name === "string" && p.display_name.trim().length >= 3)
        .map((p: any) => [p.display_name.trim(), p]),
    );

    // 對話紀錄
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data: logs, error: lErr } = await admin
      .from("ai_conversation_logs")
      .select("id,session_id,messages,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (lErr) return json({ error: lErr.message }, 500);

    // 依 email / 手機 / 會員 session / 姓名把對話歸戶
    const byTraveler = new Map<string, { profile: any; text: string[] }>();
    const attach = (profile: any, text: string) => {
      if (!profile) return;
      if (travelerId && profile.id !== travelerId) return;
      const cur = byTraveler.get(profile.id) ?? { profile, text: [] };
      if (cur.text.length < 5) cur.text.push(text);
      byTraveler.set(profile.id, cur);
    };
    for (const log of logs ?? []) {
      const text = conversationText(log.messages);
      if (!text) continue;
      for (const e of text.match(EMAIL_RE) ?? []) {
        const k = buildCustomerKey(e, null);
        if (k) attach(keyToProfile.get(k), text);
      }
      for (const ph of text.match(PHONE_RE) ?? []) {
        const k = buildCustomerKey(null, ph);
        if (k) attach(keyToProfile.get(k), text);
      }
      // session_id 直接是會員 user_id 的情況
      if (log.session_id && userIdToProfile.has(log.session_id)) {
        attach(userIdToProfile.get(log.session_id), text);
      }
      // 對話中出現旅客姓名
      for (const [name, profile] of nameToProfile) {
        if (text.includes(name)) attach(profile, text);
      }
    }

    // 補充來源：沒有可歸戶對話時，改用訂單備註／需求文字解析（同樣冪等覆蓋）
    if (byTraveler.size < batchLimit) {
      for (const p of profiles as any[]) {
        if (byTraveler.size >= batchLimit) break;
        if (byTraveler.has(p.id)) continue;
        const notes = (p.custom_needs ?? []).filter((n: string) => !n.startsWith("AI："));
        if (!notes.length) continue;
        byTraveler.set(p.id, { profile: p, text: [`訂單備註：\n${notes.join("\n")}`] });
      }
    }

    const targets = Array.from(byTraveler.values()).slice(0, batchLimit);
    if (!targets.length) {
      return json({ success: true, processed: 0, matched: 0, note: "找不到可歸戶的對話或訂單備註" });
    }

    let processed = 0;
    const results: any[] = [];

    for (const t of targets) {
      const prompt =
        `以下是同一位旅客與訂房 AI 管家的對話紀錄。請萃取：\n` +
        `1. keywords：對話中的關鍵字（最多 8 個）\n` +
        `2. interest_tags：興趣標籤（如 湖景、親子、溫泉、美食、包棟、寵物、露營、商務…最多 8 個）\n` +
        `3. custom_needs：明確表達的客製化需求（如「需要嬰兒床」「素食早餐」，沒有就給空陣列）\n` +
        `只依對話內容判斷，不可臆測。以 JSON 回覆：{"keywords":[],"interest_tags":[],"custom_needs":[]}\n\n` +
        `=== 對話 ===\n${t.text.join("\n---\n").slice(0, 12000)}`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "你是旅宿 CRM 標籤分析助理，只輸出 JSON，不要markdown。" },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (aiRes.status === 429) return json({ error: "AI 服務忙碌中（429），請稍後再試", processed }, 429);
      if (aiRes.status === 402) return json({ error: "AI 額度不足（402），請至設定加值", processed }, 402);
      if (!aiRes.ok) {
        results.push({ traveler_id: t.profile.id, error: `AI ${aiRes.status}` });
        continue;
      }

      const aiJson = await aiRes.json();
      const raw: string = aiJson?.choices?.[0]?.message?.content ?? "";
      let parsed: any = {};
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      } catch {
        results.push({ traveler_id: t.profile.id, error: "AI 回傳非 JSON" });
        continue;
      }

      const clean = (arr: any, max: number) =>
        Array.from(new Set(
          (Array.isArray(arr) ? arr : [])
            .map((s: any) => String(s ?? "").trim())
            .filter(Boolean),
        )).slice(0, max);

      const interest = clean([...(parsed.interest_tags ?? []), ...(parsed.keywords ?? [])], 12);
      const aiNeeds = clean(parsed.custom_needs, 10);
      // 冪等：AI 需求以「AI：」前綴標示，重跑時整批覆蓋，非 AI 來源（訂單備註）保留
      const keptNeeds = (t.profile.custom_needs ?? []).filter((n: string) => !n.startsWith("AI："));
      const nextNeeds = Array.from(new Set([...keptNeeds, ...aiNeeds.map((n) => `AI：${n}`)])).slice(0, 30);

      const { error: uErr } = await admin
        .from("traveler_profiles")
        .update({ interest_tags: interest, custom_needs: nextNeeds })
        .eq("id", t.profile.id);
      if (uErr) {
        results.push({ traveler_id: t.profile.id, error: uErr.message });
        continue;
      }
      processed++;
      results.push({ traveler_id: t.profile.id, interest_tags: interest, custom_needs: aiNeeds });
    }

    return json({ success: true, processed, matched: byTraveler.size, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
