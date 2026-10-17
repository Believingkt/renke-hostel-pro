// 對外開放：民宿 AI 管家 Chat API
// 認證：
//   - 外部呼叫：x-api-key (SHA-256 比對 accommodation_ai_api_keys.key_hash)
//   - 內部呼叫（民宿後台 Playground）：Authorization Bearer + 驗證該使用者對 accommodation 有存取權

import { llmFetch, llmKey, defaultModel } from "../_shared/llm.ts";
import { loadAccommodationContext } from "../_shared/accommodationContext.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildDateBlock, taipeiToday } from "../_shared/taipeiDate.ts";
import { buildRoomCardsBlock, extractStay, ROOM_CARD_PROMPT_RULE, sanitizePhotoUrl, buildFeatureLine, type RoomCardPayload, type Stay } from "../_shared/roomCards.ts";
import { buildTripCardsBlock, fetchTripCards, detectTripIntent, detectTripScenario, hasPersonalContext, TRIP_CARD_PROMPT_RULE, TRIP_NONE_NEARBY_NOTE } from "../_shared/tripCards.ts";
import { buildLiveAvailability, selectKnowledge, selectExamples, chatGenParams } from "./chatContext.ts";
import { detectAddonIntent, fetchVenueAddons, type VenueAddon } from "../_shared/venueAddons.ts";
import { writeMetric } from "../_shared/metric.ts";


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
    const tStart = performance.now();
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
    } else {
      // Bearer (authed user) 或 anon publishable key 都走這條：先解析 body 取 accommodation_id
      const body0 = await req.clone().json().catch(() => ({}));
      const reqAccId = body0.accommodation_id;
      if (!reqAccId || !UUID_REGEX.test(reqAccId)) {
        return new Response(JSON.stringify({ error: "accommodation_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 嘗試解析使用者身份（可能是 anon publishable key，沒有 sub）
      if (authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: claims } = await userClient.auth.getClaims(token).catch(() => ({ data: null }));
        authedUserId = claims?.claims?.sub || null;
      }

      // 若有登入使用者且對該民宿有後台存取權 → Playground 模式（高 rate limit）
      let hasAccess = false;
      if (authedUserId) {
        const { data } = await supabase.rpc("user_has_access_to_accommodation", {
          _user_id: authedUserId,
          _accommodation_id: reqAccId,
        });
        hasAccess = !!data;
      }

      accommodationId = reqAccId;
      if (hasAccess) {
        rateLimit = 60;
        source = "internal-playground";
      } else {
        // 公開訪客（訂房頁懸浮 AI 管家）
        rateLimit = 20;
        source = "public-visitor";
      }
    }

    if (!checkRateLimit(`acc-ai:${accommodationId}:${clientIP}`, rateLimit)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    let { messages, session_id, metric_session, skip_log } = body;
    const metricSessionKey = typeof metric_session === "string" && metric_session ? metric_session.slice(0, 80) : (typeof session_id === "string" ? session_id.slice(0, 80) : null);
    // 官網 widget 明確開啟才輸出 [ADDON_CARDS]；x-api-key 夥伴請求維持原格式
    const wantAddonFeature = !apiKey && Array.isArray(body.features) && body.features.includes("addon_cards");

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
    const [acc, prompt, knowledge, examples, rooms, accCtx] = await Promise.all([
      supabase.from("accommodation_info")
        .select("id, name, address, region_1, region_2, type, phone")
        .eq("id", accommodationId).maybeSingle(),
      supabase.from("ai_prompts").select("*")
        .eq("accommodation_id", accommodationId).eq("status", "published")
        .order("version", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("ai_knowledge").select("category, title, content, tags, priority")
        .eq("accommodation_id", accommodationId).eq("is_active", true)
        .order("priority", { ascending: false }).limit(200),
      supabase.from("ai_examples").select("scenario, user_message, ideal_response")
        .eq("accommodation_id", accommodationId).eq("is_active", true)
        .order("created_at", { ascending: true }).limit(50),
      supabase.from("room_types")
        .select("id, name, description, base_price, capacity, size_sqm, room_count, room_photos(photo_url, display_order)")
        .eq("accommodation_id", accommodationId).order("display_order"),
      loadAccommodationContext(supabase, accommodationId),
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

    const today = taipeiToday();
    const dateBlock = buildDateBlock();
    const accInfo = acc.data
      ? `\n\n## 民宿資訊\n- 名稱：${acc.data.name}\n- 地址：${acc.data.address || "未提供"}\n- 地區：${[acc.data.region_1, acc.data.region_2].filter(Boolean).join(" / ") || "未提供"}\n- 電話：${acc.data.phone || "未提供"}\n- 今天日期：${today}`
      : "";

    const roomList = rooms.data?.length
      ? `\n\n## 房型清單\n${rooms.data.map((r: any) => `- ${r.name}（容納 ${r.capacity} 人 / 起價 NT$${r.base_price}）${r.description ? `：${r.description}` : ""}`).join("\n")}`
      : "";

    const lastUserMsg = (() => {
      const m = [...messages].reverse().find((x: any) => x.role === "user");
      return typeof m?.content === "string" ? m.content : "";
    })();
    const pickedKnowledge = selectKnowledge((knowledge.data || []) as any[], lastUserMsg, 8);
    const pickedExamples = selectExamples((examples.data || []) as any[], 6, 120);
    const knowledgeText = pickedKnowledge.length
      ? `\n\n## 知識庫\n${pickedKnowledge.map((k: any) => `### ${k.title}（${k.category}）\n${k.content}`).join("\n\n")}`
      : "";

    const examplesText = pickedExamples.length
      ? `\n\n## 對話範例\n${pickedExamples.map((e: any) => `**情境：${e.scenario}**\n用戶：${e.user_message}\n理想回應：${e.ideal_response}`).join("\n\n")}`
      : "";

    // ===== 即時房況／價格（唯一真實來源，文字與卡片共用同一份）=====
    const conversationTexts: string[] = [...messages]
      .reverse()
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => String(m.content || ""));

    let stay: Stay | null = null;
    for (const t of conversationTexts) {
      stay = extractStay(t, today);
      if (stay) break;
    }
    const checkIn = stay?.checkIn ?? null;
    const checkOut = stay?.checkOut ?? null;

    const roomRows = (rooms.data || []) as any[];
    const live = await buildLiveAvailability(supabase, accommodationId!, roomRows, stay);
    const priceByRoom = live.cardPriceByRoom;
    const availByRoom = live.availByRoom;
    const pkgByRoom = live.cardPkgByRoom;
    const liveAvailabilityBlock = live.block;

    // 官網小安加購：LLM 前先查該館 addon_settings（strict），把 DB 事實注入 system
    const lastUserForAddon = (() => {
      const m = [...messages].reverse().find((x: any) => x.role === "user");
      return typeof m?.content === "string" ? m.content : "";
    })();
    const wantAddonCards = wantAddonFeature && detectAddonIntent(lastUserForAddon);
    const venueAddons: VenueAddon[] = wantAddonCards
      ? await fetchVenueAddons(supabase, accommodationId, lastUserForAddon, { strict: true })
      : [];
    const addonBlock = !wantAddonCards
      ? ""
      : venueAddons.length
        ? "\n\n## 本館可加購項目（資料庫即時，唯一依據）\n" +
          venueAddons.map((a) =>
            `- ${a.name}：${a.pricePerUnit > 0 ? `NT$${a.pricePerUnit}` : "免費"} / ${a.unitLabel}（${a.pricingMode === "per_night" ? "每晚計" : "每次計"}）`
          ).join("\n") +
          "\n- 只能介紹上列品項與價格，不可推薦他館或編造品項；系統會在文字後自動附上加購卡片，你不可自行輸出 [ADDON_CARDS]。"
        : "\n\n## 本館加購查詢結果\n- 本館無相符加購，請照實告知客人目前沒有此加購，不可推薦他館或編造品項。";

    // 官網小安行程卡：LLM 前先查「本館＋同 region_1」的上架行程；沒有就注入照實說明、不附卡
    const lastUserText = (() => {
      const m = [...messages].reverse().find((x: any) => x.role === "user");
      return typeof m?.content === "string" ? m.content : "";
    })();
    const wantTripCards = detectTripIntent(lastUserText);
    const tripPersonalized = hasPersonalContext(lastUserText);
    let nearbyTripCards: Awaited<ReturnType<typeof fetchTripCards>> = [];
    if (wantTripCards) {
      try {
        nearbyTripCards = await fetchTripCards(supabase, {
          personalized: tripPersonalized,
          limit: 3,
          accommodationId,
          scenario: detectTripScenario(lastUserText),
          seed: typeof session_id === "string" ? session_id : undefined,
        });
      } catch (e) {
        console.error("nearby trip cards failed", e);
      }
    }
    const tripNoneNote = wantTripCards && nearbyTripCards.length === 0 ? TRIP_NONE_NEARBY_NOTE : "";

    const MAX_SYSTEM_PROMPT_CHARS = 10000;
    const promptHead = corePrompt
      .replace(/\{\{今天日期\}\}/g, today)
      .replace(/\{\{民宿地點\}\}/g, acc.data?.address || "")
      .replace(/\{\{房型清單\}\}/g, rooms.data?.map((r: any) => r.name).join("、") || "");
    // accCtx（館別資料）與即時房況永不被截；超過上限時先砍知識庫，再砍範例
    const assembleSystem = (kt: string, et: string) =>
      promptHead + dateBlock + accInfo + roomList + liveAvailabilityBlock + (accCtx as string) + kt + et + tone + forbidden
      + ROOM_CARD_PROMPT_RULE + TRIP_CARD_PROMPT_RULE + addonBlock + tripNoneNote;
    const trimTail = (text: string, overflow: number, note: string) =>
      text.length > overflow + 20 ? text.slice(0, text.length - overflow - 20) + note : "";
    let kt = knowledgeText;
    let et = examplesText;
    let systemMessage = assembleSystem(kt, et);
    if (systemMessage.length > MAX_SYSTEM_PROMPT_CHARS) {
      kt = trimTail(kt, systemMessage.length - MAX_SYSTEM_PROMPT_CHARS, "\n…（平台知識庫已截斷）");
      systemMessage = assembleSystem(kt, et);
    }
    if (systemMessage.length > MAX_SYSTEM_PROMPT_CHARS) {
      et = trimTail(et, systemMessage.length - MAX_SYSTEM_PROMPT_CHARS, "\n…（對話範例已截斷）");
      systemMessage = assembleSystem(kt, et);
    }
    console.log("[acc-ai-chat context]", JSON.stringify({
      knowledge_count: kt ? pickedKnowledge.length : 0,
      knowledge_truncated: kt !== knowledgeText,
      examples_count: et ? pickedExamples.length : 0,
      examples_truncated: et !== examplesText,
      sys_len: systemMessage.length,
    }));
    const dbMs = Math.round(performance.now() - tStart);
    console.log("[acc-ai-chat timing]", JSON.stringify({ db_ms: dbMs, source, sys_len: systemMessage.length }));

    // ===== 呼叫 Lovable AI Gateway（streaming SSE）=====
    const LOVABLE_API_KEY = llmKey();
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiRes = await llmFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: `google/${defaultModel()}`,
        stream: true,
        ...chatGenParams(),
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

    // 該民宿封面照（房型無照片時的 fallback）
    let accCoverPhoto = "";
    try {
      const { data: accPhoto } = await supabase
        .from("accommodation_photos")
        .select("photo_url, display_order")
        .eq("accommodation_id", accommodationId)
        .order("display_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      accCoverPhoto = sanitizePhotoUrl(accPhoto?.photo_url);
    } catch (_e) { /* 沒有封面就留空 */ }

    // ===== 房型圖文卡片：與 system prompt 的「即時房況與價格」使用同一份查詢結果 =====
    const buildRoomCards = (assistantText: string): RoomCardPayload[] => {
      if (!roomRows.length) return [];

      // 只在助理回覆中「明確提到房型名稱」時才出卡片（一般閒聊不出）
      const mentioned = roomRows.filter((r) => r.name && assistantText.includes(r.name));
      if (!mentioned.length) return [];

      const picked = mentioned.slice(0, 4);

      return picked.map((r) => {
        const photo = sanitizePhotoUrl(
          (r.room_photos || [])
            .slice()
            .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
            .map((p: any) => sanitizePhotoUrl(p?.photo_url))
            .find((u: string) => !!u) || "",
        ) || accCoverPhoto;
        const features = buildFeatureLine(r.name, r.description, [
          r.capacity ? `${r.capacity}人` : "",
          r.size_sqm ? `${r.size_sqm}坪` : "",
        ]);
        const params = new URLSearchParams({ accId: String(accommodationId), roomId: r.id });
        if (checkIn) params.set("checkIn", checkIn);
        if (checkOut) params.set("checkOut", checkOut);
        const pk = pkgByRoom.get(r.id);
        if (pk) params.set("packageId", pk.packageId);
        return {
          room_type_id: r.id,
          name: r.name,
          image_url: photo,
          price: priceByRoom.get(r.id) ?? (r.base_price > 0 ? r.base_price : null),
          original_price: pk && pk.originalTotal && pk.originalTotal > pk.saleTotal ? pk.originalTotal : null,
          package_name: pk?.packageName ?? null,
          available: checkIn ? (availByRoom.get(r.id) ?? null) : null,
          check_in: checkIn,
          check_out: checkOut,
          features,
          accommodation_name: accName,
          booking_url: `/book?${params.toString()}`,
        } as RoomCardPayload;
      });

    };


    // Stream-pipe and collect full assistant content for logging
    let fullContent = "";
    let firstTokenLogged = false;
    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
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
                if (delta) {
                  if (!firstTokenLogged) {
                    firstTokenLogged = true;
                    console.log("[acc-ai-chat timing]", JSON.stringify({ llm_first_token_ms: Math.round(performance.now() - tStart) }));
                  }
                  fullContent += delta;
                }
              } catch { /* ignore */ }
            }
            controller.enqueue(value);
          }

          // 串流結束後補上房型卡片區塊
          try {
            const cards = await buildRoomCards(fullContent);
            const block = buildRoomCardsBlock(cards);
            if (block) {
              fullContent += block;
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content: block } }] })}\n\n`,
              ));
            }
          } catch (cardErr) {
            console.error("room cards failed", cardErr);
          }

          // 串流結束後補上主題行程卡片區塊（資料全部來自資料庫 trips）
          if (wantTripCards && nearbyTripCards.length > 0) {
            try {
              // 每張卡配發曝光編號 rec_id（帶進 payload 與 shown.metadata）
              const tripCardsShown = nearbyTripCards.map((c) => ({ ...c, rec_id: crypto.randomUUID() }));
              const tripBlock = buildTripCardsBlock(tripCardsShown);
              if (tripBlock) {
                fullContent += tripBlock;
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: tripBlock } }] })}\n\n`,
                ));
                // M1/M2 分母：官網小安行程卡曝光（fire-and-forget，不影響回覆）
                for (const c of tripCardsShown) {
                  void writeMetric(supabase, {
                    event_type: "trip_rec_shown",
                    ref_type: "trip",
                    ref_id: String(c.trip_id),
                    accommodation_id: accommodationId,
                    channel: "web",
                    session_key: metricSessionKey,
                    metadata: { source: "accommodation_ai_chat", rec_id: c.rec_id },
                  });
                }
              }
            } catch (tripErr) {
              console.error("trip cards failed", tripErr);
            }
          }



          // 串流結束後補上官網加購卡（addon_settings；選填區塊）
          if (venueAddons.length) {
            const addonCardsBlock = `\n\n[ADDON_CARDS]${JSON.stringify(venueAddons.map((a) => ({
              addon_type: a.addonType,
              name: a.name,
              price_per_unit: a.pricePerUnit,
              unit_label: a.unitLabel,
              pricing_mode: a.pricingMode,
              min: a.minQty,
              max: a.maxQty,
            })))}[/ADDON_CARDS]`;
            fullContent += addonCardsBlock;
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: addonCardsBlock } }] })}\n\n`,
            ));
            for (const a of venueAddons) {
              void writeMetric(supabase, {
                event_type: "addon_rec_shown",
                ref_type: "addon_setting",
                ref_id: a.addonType,
                accommodation_id: accommodationId,
                channel: "web",
                session_key: typeof session_id === "string" ? session_id.slice(0, 80) : null,
              });
            }
          }

          console.log("[acc-ai-chat timing]", JSON.stringify({ total_ms: Math.round(performance.now() - tStart) }));
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
