// 旅客 AI 對話標籤（CDP）
// POST /functions/v1/traveler-tagging
// body: { limit?: number, traveler_id?: string, days?: number }
// 冪等：同一旅客重跑會「覆蓋」interest_tags / custom_needs（AI 段），非累加重複
// deno-lint-ignore-file no-explicit-any
import { llmFetch, llmKey, defaultModel } from "../_shared/llm.ts";
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

// 興趣標籤受控詞彙（interest_tags 只能從此清單產出，其餘一律丟棄）
const INTEREST_WHITELIST = [
  "包棟", "親子", "親子友善", "寵物友善", "美食", "烤肉", "戶外", "溫泉", "情侶", "團體",
  "長輩同行", "湖景", "山景", "海景", "夜景", "露營", "商務", "包場", "慶生", "蜜月",
  "聚會", "放鬆", "泳池", "戲水", "星空", "景觀", "包棟烤肉", "氣泡湯", "無障礙", "早餐",
  "賞花", "賞楓", "療癒", "網美",
];
const INTEREST_SET = new Set(INTEREST_WHITELIST);
// 同義詞歸一到受控詞彙
const INTEREST_SYNONYM: Record<string, string> = {
  "寵物": "寵物友善", "毛小孩": "寵物友善", "家庭": "親子", "小孩": "親子", "泡湯": "溫泉",
  "長輩": "長輩同行", "家族": "團體", "朋友": "團體", "湖畔": "湖景", "湖邊": "湖景",
};
// 訂單作業用語黑名單（標籤與關鍵字一律排除）
const OPS_BLACKLIST = [
  "取消訂單", "取消", "保留單", "保留", "颱風延期", "延期", "改期", "業主自帶", "補單", "補開",
  "訂金", "尾款", "退訂", "退款", "退費", "候補", "作廢", "加價", "補差額", "發票", "收據",
  "統編", "訂單", "補登", "人工", "客服", "未付", "已付", "尚未", "待付",
];
const EMAIL_TEST = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_TEST = /(?:\+?886|0)?\d{3}[- ]?\d{3,4}[- ]?\d{3,4}/;
const isPureNumberLike = (s: string) => /^[\s\d\-－()（）.#*]+$/.test(s) || /\d{3,}/.test(s);

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

    const LOVABLE_API_KEY = llmKey();
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    let body: any = {};
    try { body = await req.json(); } catch { /* 空 body 視為批次 */ }
    const batchLimit = Math.min(Math.max(Number(body?.limit) || 20, 1), 50);
    const days = Math.min(Math.max(Number(body?.days) || 180, 1), 3650);
    const travelerId = typeof body?.traveler_id === "string" ? body.traveler_id : null;

    // 旅客檔案（比對用）
    let profilesQuery = admin
      .from("traveler_profiles")
      .select("id,customer_key,email,phone,display_name,user_id,custom_needs,consumption")
      .limit(5000);
    if (travelerId) profilesQuery = admin
      .from("traveler_profiles")
      .select("id,customer_key,email,phone,display_name,user_id,custom_needs,consumption")
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

    // 人名字典（用於後處理排除，避免姓名被當標籤/關鍵字）
    const nameSet = new Set<string>(
      (profiles as any[])
        .filter((p) => typeof p.display_name === "string" && p.display_name.trim().length >= 2)
        .map((p) => p.display_name.trim()),
    );
    const isNoiseKeyword = (s: string): boolean => {
      const v = s.trim();
      if (!v || v.length > 12) return true;
      if (isPureNumberLike(v)) return true;
      if (EMAIL_TEST.test(v) || PHONE_TEST.test(v)) return true;
      if (nameSet.has(v)) return true;
      return OPS_BLACKLIST.some((b) => v.includes(b));
    };

    for (const t of targets) {
      const prompt =
        `以下是同一位旅客與訂房 AI 管家的對話／訂單備註。請嚴格依內容萃取，不可臆測：\n` +
        `1. interest_tags：興趣標籤，【只能】從下列詞彙挑選，不在清單內一律不要：${INTEREST_WHITELIST.join("、")}。\n` +
        `2. keywords：旅客提到的「需求類」名詞（如 嬰兒床、素食、停車、電梯、早鳥、寵物、包棟…最多 8 個）。\n` +
        `3. custom_needs：明確表達的客製化需求（如「需要嬰兒床」「素食早餐」，沒有就給空陣列）。\n` +
        `【嚴禁】輸出人名、電話、email、純數字或代碼、以及訂單作業用語（取消訂單、保留單、補單、改期、颱風延期、業主自帶、訂金、尾款、發票…）。\n` +
        `以 JSON 回覆：{"keywords":[],"interest_tags":[],"custom_needs":[]}\n\n` +
        `=== 內容 ===\n${t.text.join("\n---\n").slice(0, 12000)}`;

      const aiRes = await llmFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: `google/${defaultModel()}`,
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

      // 興趣標籤：同義詞歸一 + 受控詞彙白名單（不再把 keywords 併入）
      const interest = Array.from(new Set(
        (Array.isArray(parsed.interest_tags) ? parsed.interest_tags : [])
          .map((s: any) => String(s ?? "").trim())
          .map((s: string) => INTEREST_SYNONYM[s] ?? s)
          .filter((s: string) => INTEREST_SET.has(s)),
      )).slice(0, 10);
      // AI 對話關鍵字：需求類名詞，排除人名/電話/email/純數字/作業用語
      const keywords = clean(parsed.keywords, 20).filter((k: string) => !isNoiseKeyword(k)).slice(0, 12);
      const aiNeeds = clean(parsed.custom_needs, 10);
      // 冪等：AI 需求以「AI：」前綴標示，重跑時整批覆蓋，非 AI 來源（訂單備註）保留
      const keptNeeds = (t.profile.custom_needs ?? []).filter((n: string) => !n.startsWith("AI："));
      const nextNeeds = Array.from(new Set([...keptNeeds, ...aiNeeds.map((n) => `AI：${n}`)])).slice(0, 30);

      const { error: uErr } = await admin
        .from("traveler_profiles")
        .update({
          interest_tags: interest,
          custom_needs: nextNeeds,
          consumption: { ...(t.profile.consumption ?? {}), ai_keywords: keywords },
        })
        .eq("id", t.profile.id);
      if (uErr) {
        results.push({ traveler_id: t.profile.id, error: uErr.message });
        continue;
      }
      processed++;
      results.push({ traveler_id: t.profile.id, interest_tags: interest, keywords, custom_needs: aiNeeds });
    }

    return json({ success: true, processed, matched: byTraveler.size, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
