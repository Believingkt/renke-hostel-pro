// 對外開放：民宿 AI 管家 Chat API
// 認證：
//   - 外部呼叫：x-api-key (SHA-256 比對 accommodation_ai_api_keys.key_hash)
//   - 內部呼叫（民宿後台 Playground）：Authorization Bearer + 驗證該使用者對 accommodation 有存取權

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const rec = rateLimitMap.get(key);
  if (!rec || now > rec.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (rec.count >= max) return false;
  rec.count++;
  return true;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 4000;
const ALLOWED_ROLES = ["user", "assistant", "system"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // ===== 驗證身份 =====
    let accommodationId: string | null = null;
    let rateLimit = 30;
    let source = "external-tlt";
    let authedUserId: string | null = null;

    const apiKey = req.headers.get("x-api-key");
    const authHeader = req.headers.get("authorization") || "";

    if (apiKey) {
      const keyHash = await sha256Hex(apiKey);
      const { data: row, error: kerr } = await supabase.rpc(
        "verify_accommodation_ai_api_key",
        { p_key_hash: keyHash },
      );
      if (kerr || !row || (Array.isArray(row) && row.length === 0)) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const r = Array.isArray(row) ? row[0] : row;
      accommodationId = r.accommodation_id;
      rateLimit = r.rate_limit_per_min || 30;
    } else if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims } = await userClient.auth.getClaims(token);
      if (!claims?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authedUserId = claims.claims.sub;
      const body0 = await req.clone().json().catch(() => ({}));
      const reqAccId = body0.accommodation_id;
      if (!reqAccId || !UUID_REGEX.test(reqAccId)) {
        return new Response(JSON.stringify({ error: "accommodation_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: hasAccess } = await supabase.rpc("user_has_access_to_accommodation", {
        _user_id: authedUserId,
        _accommodation_id: reqAccId,
      });
      if (!hasAccess) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      accommodationId = reqAccId;
      rateLimit = 60;
      source = "internal-playground";
    } else {
      return new Response(JSON.stringify({ error: "Missing x-api-key or Authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!checkRateLimit(`acc-ai:${accommodationId}:${clientIP}`, rateLimit)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    let { messages, session_id, skip_log } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (messages.length > MAX_MESSAGES) messages = messages.slice(-MAX_MESSAGES);
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (!m || !ALLOWED_ROLES.includes(m.role) || typeof m.content !== "string") {
        return new Response(JSON.stringify({ error: `message ${i} invalid` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (m.content.length > MAX_MESSAGE_LENGTH) {
        return new Response(JSON.stringify({ error: `message ${i} too long` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ===== 載入該民宿的訓練資料 =====
    const [acc, prompt, knowledge, examples, rooms] = await Promise.all([
      supabase.from("accommodation_info")
        .select("id, name, address, region_1, region_2, type, phone")
        .eq("id", accommodationId).maybeSingle(),
      supabase.from("ai_prompts").select("*")
        .eq("accommodation_id", accommodationId).eq("status", "published")
        .order("version", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("ai_knowledge").select("category, title, content, tags, priority")
        .eq("accommodation_id", accommodationId).eq("is_active", true)
        .order("priority", { ascending: false }).limit(100),
      supabase.from("ai_examples").select("scenario, user_message, ideal_response")
        .eq("accommodation_id", accommodationId).eq("is_active", true).limit(30),
      supabase.from("room_types")
        .select("id, name, description, base_price, capacity, size_sqm, room_count")
        .eq("accommodation_id", accommodationId).order("display_order"),
    ]);

    // 若該民宿無 published prompt，使用 HQ 全域 fallback
    let promptRow: any = prompt.data;
    if (!promptRow) {
      const { data: globalPrompt } = await supabase.from("ai_prompts")
        .select("*").is("accommodation_id", null).eq("status", "published")
        .order("version", { ascending: false }).limit(1).maybeSingle();
      promptRow = globalPrompt;
    }

    // ===== 組系統提示詞 =====
    const accName = acc.data?.name || "本民宿";
    const personaName = promptRow?.persona_name || "小安";
    const corePrompt = promptRow?.system_prompt || `你是${accName}的 AI 管家「${personaName}」，協助旅客了解房型、價格與訂房資訊。請以親切、簡短的繁體中文回應。`;
    const tone = promptRow?.tone_rules ? `\n\n## 語氣規則\n${promptRow.tone_rules}` : "";
    const forbidden = promptRow?.forbidden_topics
      ? `\n\n## 禁止主題\n${promptRow.forbidden_topics.split("|").join("、")}`
      : "";

    const today = new Date().toISOString().split("T")[0];
    const accInfo = acc.data
      ? `\n\n## 民宿資訊\n- 名稱：${acc.data.name}\n- 地址：${acc.data.address || "未提供"}\n- 地區：${[acc.data.region_1, acc.data.region_2].filter(Boolean).join(" / ") || "未提供"}\n- 電話：${acc.data.phone || "未提供"}\n- 今天日期：${today}`
      : "";

    const roomList = rooms.data?.length
      ? `\n\n## 房型清單\n${rooms.data.map((r: any) => `- ${r.name}（容納 ${r.capacity} 人 / 起價 NT$${r.base_price}）${r.description ? `：${r.description}` : ""}`).join("\n")}`
      : "";

    const knowledgeText = knowledge.data?.length
      ? `\n\n## 知識庫\n${knowledge.data.map((k: any) => `### ${k.title}（${k.category}）\n${k.content}`).join("\n\n")}`
      : "";

    const examplesText = examples.data?.length
      ? `\n\n## 對話範例\n${examples.data.map((e: any) => `**情境：${e.scenario}**\n用戶：${e.user_message}\n理想回應：${e.ideal_response}`).join("\n\n")}`
      : "";

    const systemMessage = corePrompt
      .replace(/\{\{今天日期\}\}/g, today)
      .replace(/\{\{民宿地點\}\}/g, acc.data?.address || "")
      .replace(/\{\{房型清單\}\}/g, rooms.data?.map((r: any) => r.name).join("、") || "")
      + accInfo + roomList + knowledgeText + examplesText + tone + forbidden;

    // ===== 呼叫 Lovable AI Gateway（streaming SSE）=====
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        stream: true,
        messages: [
          { role: "system", content: systemMessage },
          ...messages.map((m: any) => ({
            role: m.role === "system" ? "user" : m.role,
            content: m.content,
          })),
        ],
      }),
    });

    if (!aiRes.ok || !aiRes.body) {
      const txt = await aiRes.text();
      console.error("AI Gateway error", aiRes.status, txt);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit at AI gateway" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream-pipe and collect full assistant content for logging
    let fullContent = "";
    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            buf += text;
            // parse SSE lines to capture assistant content
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const j = JSON.parse(payload);
                const delta = j.choices?.[0]?.delta?.content;
                if (delta) fullContent += delta;
              } catch { /* ignore */ }
            }
            controller.enqueue(value);
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        } finally {
          // Log conversation (fire and forget)
          if (!skip_log) {
            const allMessages = [...messages, { role: "assistant", content: fullContent }];
            supabase.from("ai_conversation_logs").insert({
              accommodation_id: accommodationId,
              session_id: session_id || crypto.randomUUID(),
              prompt_version: promptRow?.version ?? null,
              messages: allMessages,
              source,
            }).then(() => {}, (e) => console.error("log error", e));
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("accommodation-ai-chat error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
