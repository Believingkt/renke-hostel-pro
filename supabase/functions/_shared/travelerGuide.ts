// 共用：動態行旅導引（七項旅遊屬性逐題收集）
// /trips/guide 獨立頁（traveler-guide）與官網小安對話（portal-ai-chat）共用同一份提示詞與擷取邏輯。

export type GuideLang = "zh" | "ja" | "en";

export interface GuideAttrs {
  trip_duration: string | null;
  festival: string | null;
  party_size: number | null;
  companion_type: string | null;
  purpose: string | null;
  budget: number | null;
  highlights: string[] | null;
}

export const EMPTY_ATTRS: GuideAttrs = {
  trip_duration: null,
  festival: null,
  party_size: null,
  companion_type: null,
  purpose: null,
  budget: null,
  highlights: null,
};

export const FIELD_GUIDE = `你要收集的旅遊屬性欄位（依序）：
1. trip_duration 遊玩期程（例：2D1N）與 festival 節日情境（一般週末／連假／暑假／平日）
2. party_size 同行人數、companion_type 同行夥伴性質（family/couple/friends/group/other）
3. purpose 旅遊目的（休閒放鬆／美食巡禮／親子共遊／拍照打卡／戶外運動）
4. budget 每人預算（數字，新台幣）
5. highlights 期望遊玩重點（可複選，例：湖景放鬆／纜車眺望／環湖單車／在地美食／溫泉湯屋）`;

const LANG_RULE: Record<GuideLang, string> = {
  zh: "一律使用繁體中文回覆。",
  ja: "必ず日本語で返答してください（抽出フィールド名は英語キーのまま）。",
  en: "Always reply in English (keep the extracted field keys in English).",
};

export function buildGuideSystemPrompt(lang: GuideLang = "zh"): string {
  return `你是「小安」，親切的旅遊管家。你要用「一次只問一件事」的對話方式，逐步收集旅客的旅遊屬性。

${FIELD_GUIDE}

規則：
- ${LANG_RULE[lang]}
- 每次回覆 ≤3 句，語氣親切、可適度使用 emoji。
- 一次只問下一個尚未取得的欄位，不要一次丟出長表單。
- 旅客一句話同時提供多個欄位時要全部擷取，已回答過的欄位不要重複詢問。
- 旅客若中途改問住宿房況、設施、價格、訂房等與旅遊屬性無關的問題，請把 offtopic 設為 true，reply 留空字串，交由訂房管家回答；不要中斷導引。
- 全部欄位都取得（或旅客說「夠了／直接排」）時，先用「一句話」覆述已收集的七項屬性讓旅客可更正，再說即將生成推薦行程，並把 done 設為 true。
- 你不可自行輸出任何行程名稱、景點、價格或卡片區塊。

輸出格式：你「必須」只輸出一段 JSON（不要加上任何 markdown 標記或多餘文字），格式：
{"reply":"給旅客看的回覆文字","extracted":{"trip_duration":null,"festival":null,"party_size":null,"companion_type":null,"purpose":null,"budget":null,"highlights":null},"done":false,"offtopic":false}
extracted 只填目前對話中「已確定」的值，未知請用 null；highlights 為字串陣列；budget、party_size 為數字。`;
}

/** 明確關鍵字（必觸發）＋自然語意（規劃／量身安排／導引） */
export function isGuideTrigger(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return /(動態行旅導引|行旅導引|導引我?排?行程|幫我(規劃|安排|排)(專屬)?行程|規劃(專屬|我的)?行程|量身(打造|安排|規劃)|客製(化)?行程|trip guide|plan my trip|旅程ガイド|行程導引)/i
    .test(t);
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
const num = (v: unknown) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));

export function normalizeAttrs(ex: Record<string, unknown> | null | undefined): GuideAttrs {
  const e = ex && typeof ex === "object" ? ex : {};
  return {
    trip_duration: str(e.trip_duration),
    festival: str(e.festival),
    party_size: num(e.party_size),
    companion_type: str(e.companion_type),
    purpose: str(e.purpose),
    budget: num(e.budget),
    highlights: Array.isArray(e.highlights)
      ? (e.highlights.map((h) => str(h)).filter(Boolean) as string[]).slice(0, 12)
      : null,
  };
}

export function mergeAttrs(known: Partial<GuideAttrs> | null | undefined, next: GuideAttrs): GuideAttrs {
  const base = normalizeAttrs((known ?? {}) as Record<string, unknown>);
  const merged: GuideAttrs = { ...base };
  (Object.keys(EMPTY_ATTRS) as (keyof GuideAttrs)[]).forEach((k) => {
    const v = next[k];
    if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) {
      (merged as unknown as Record<string, unknown>)[k] = v;
    }
  });
  return merged;
}

export function filledCount(attrs: GuideAttrs): number {
  return (Object.keys(EMPTY_ATTRS) as (keyof GuideAttrs)[]).filter((k) => {
    const v = attrs[k];
    return v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);
  }).length;
}

export function isComplete(attrs: GuideAttrs): boolean {
  return filledCount(attrs) >= 7;
}

export interface GuideTurnResult {
  reply: string;
  extracted: GuideAttrs;
  done: boolean;
  offtopic: boolean;
}

/** 執行一輪導引（同一份提示詞／同一份擷取邏輯） */
export async function runGuideTurn(opts: {
  messages: Array<{ role: string; content: string }>;
  known?: Partial<GuideAttrs> | null;
  lang?: GuideLang;
}): Promise<GuideTurnResult> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const cleaned = (opts.messages || [])
    .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
    .slice(-20)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 2000),
    }));

  const convo = cleaned.length
    ? cleaned
    : [{ role: "user", content: "（旅客剛進入導引，請你先打招呼並問第一個問題）" }];

  const known = opts.known ?? {};
  const t0 = Date.now();
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      reasoning_effort: "none",
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `${buildGuideSystemPrompt(opts.lang ?? "zh")}\n\n目前已知屬性：${JSON.stringify(known)}`,
        },
        ...convo,
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("[traveler-guide] gateway error", resp.status, errText);
    throw Object.assign(new Error("guide gateway error"), { status: resp.status });
  }

  const data = await resp.json();
  const raw = String(data?.choices?.[0]?.message?.content || "").trim();
  console.log("[traveler-guide] latency_ms", Date.now() - t0);

  let parsed: Record<string, unknown> | null = null;
  try {
    const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 ? jsonText.slice(start, end + 1) : jsonText);
  } catch {
    parsed = { reply: raw, extracted: {}, done: false };
  }

  const extracted = normalizeAttrs(parsed?.extracted as Record<string, unknown>);
  const merged = mergeAttrs(known as Partial<GuideAttrs>, extracted);

  return {
    reply: str(parsed?.reply) || "好的，我們繼續 😊",
    extracted,
    done: parsed?.done === true || isComplete(merged),
    offtopic: parsed?.offtopic === true,
  };
}

/** 由屬性推導 trip-recommend 的情境代碼 */
export function scenarioFromAttrs(attrs: GuideAttrs): string {
  const c = (attrs.companion_type || "").toLowerCase();
  const text = `${attrs.purpose || ""} ${(attrs.highlights || []).join(" ")}`;
  if (/family|親子|家族|家庭/.test(c) || /親子|小孩|家族/.test(text)) return "family";
  if (/couple|情侶|夫妻|蜜月/.test(c) || /浪漫|情侶|蜜月/.test(text)) return "couple";
  if (/group|團體|包棟/.test(c) || /包棟|派對|烤肉|bbq/i.test(text)) return "villa";
  if (/戶外|健行|單車|登山|運動/.test(text)) return "outdoor";
  if (/friends|朋友|好友/.test(c)) return "friends";
  return "family";
}

/** 屬性歸檔（含館別歸屬與來源標記） */
export async function archiveGuideAttributes(
  // deno-lint-ignore no-explicit-any
  sb: any,
  opts: {
    attrs: GuideAttrs;
    sessionId: string | null;
    userId?: string | null;
    accommodationId?: string | null;
    source: string;
  },
): Promise<void> {
  try {
    const { error } = await sb.from("traveler_attributes").insert({
      user_id: opts.userId ?? null,
      session_id: opts.sessionId,
      accommodation_id: opts.accommodationId ?? null,
      source: opts.source,
      ...opts.attrs,
    });
    if (error) console.error("[traveler-guide] archive failed", error);
  } catch (e) {
    console.error("[traveler-guide] archive exception", e);
  }
}
