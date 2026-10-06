// LLM 呼叫層：讓原本打 Lovable AI Gateway 的程式碼可以無痛切到直接呼叫 Google / OpenAI。
//
// LLM_MODE = "gateway"：維持原行為（https://ai.gateway.lovable.dev，LOVABLE_API_KEY）。
// LLM_MODE = "direct" ：chat/completions → Google Gemini OpenAI 相容端點（GEMINI_API_KEY）
//                       audio/transcriptions → OpenAI（OPENAI_API_KEY）
// 未設定 LLM_MODE 時：有 GEMINI_API_KEY 就 direct，否則 gateway（舊環境不需改任何 secret）。
//
// 用法：把 `fetch("https://ai.gateway.lovable.dev/...", init)` 換成 `llmFetch(同 URL, 同 init)`，
//       把 `Deno.env.get("LOVABLE_API_KEY")` 換成 `llmKey()`；其餘程式碼不動。

const GATEWAY = "https://ai.gateway.lovable.dev";
const GOOGLE_OPENAI = "https://generativelanguage.googleapis.com/v1beta/openai";
const OPENAI = "https://api.openai.com/v1";

export type LlmMode = "gateway" | "direct";

export function llmMode(): LlmMode {
  const m = (Deno.env.get("LLM_MODE") ?? "").toLowerCase();
  if (m === "gateway" || m === "direct") return m;
  return Deno.env.get("GEMINI_API_KEY") ? "direct" : "gateway";
}

/** 供舊有的「金鑰是否存在」檢查使用：gateway 模式回 LOVABLE_API_KEY，direct 模式回 GEMINI_API_KEY。 */
export function llmKey(): string | undefined {
  return llmMode() === "gateway" ? Deno.env.get("LOVABLE_API_KEY") : Deno.env.get("GEMINI_API_KEY");
}

/** 現役預設模型（不含 provider 前綴）；可由 LLM_DEFAULT_MODEL 覆寫，避免把模型名寫死。 */
export function defaultModel(): string {
  return Deno.env.get("LLM_DEFAULT_MODEL") ?? "gemini-3.8-flash";
}

/** gateway 的模型名 → 供應商原生模型名。 */
export function mapModel(model: string): { provider: "google" | "openai" | "other"; model: string } {
  if (model.startsWith("google/")) return { provider: "google", model: model.slice("google/".length) };
  if (model.startsWith("openai/")) return { provider: "openai", model: model.slice("openai/".length) };
  return { provider: "other", model };
}

/** fetch 的替身：gateway 模式原樣轉送；direct 模式改寫 URL、授權與 model。 */
export async function llmFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (llmMode() === "gateway" || !input.startsWith(GATEWAY)) return fetch(input, init);

  const path = input.slice(GATEWAY.length); // e.g. /v1/chat/completions
  const headers = new Headers(init.headers ?? {});
  headers.delete("Lovable-API-Key");

  // --- 語音轉文字（multipart FormData）→ OpenAI ---
  if (path.startsWith("/v1/audio/")) {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("OPENAI_API_KEY is not configured (LLM_MODE=direct)");
    headers.set("Authorization", `Bearer ${key}`);
    let body = init.body;
    if (body instanceof FormData) {
      const m = body.get("model");
      if (typeof m === "string") body.set("model", mapModel(m).model);
    }
    return fetch(`${OPENAI}${path.slice("/v1".length)}`, { ...init, headers, body });
  }

  // --- chat/completions（JSON）→ Google Gemini OpenAI 相容端點 ---
  let body = init.body;
  let provider: "google" | "openai" | "other" = "google";
  if (typeof body === "string") {
    try {
      const json = JSON.parse(body);
      if (typeof json.model === "string") {
        const mapped = mapModel(json.model);
        provider = mapped.provider;
        json.model = mapped.model;
      }
      // Gemini OpenAI 相容端點不接受 reasoning_effort: "none"（接受 low/medium/high）
      if (json.reasoning_effort === "none") delete json.reasoning_effort;
      body = JSON.stringify(json);
    } catch { /* 非 JSON 就原樣送 */ }
  }
  if (provider === "openai") {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("OPENAI_API_KEY is not configured (LLM_MODE=direct)");
    headers.set("Authorization", `Bearer ${key}`);
    return fetch(`${OPENAI}${path.slice("/v1".length)}`, { ...init, headers, body });
  }
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured (LLM_MODE=direct)");
  headers.set("Authorization", `Bearer ${key}`);
  return fetch(`${GOOGLE_OPENAI}${path.slice("/v1".length)}`, { ...init, headers, body });
}
