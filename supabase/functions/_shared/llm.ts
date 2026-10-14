// LLM 呼叫層：讓原本打 Lovable AI Gateway 的程式碼可以無痛切到直接呼叫 Claude / Google / OpenAI。
//
// LLM_MODE = "gateway"：維持原行為（https://ai.gateway.lovable.dev，LOVABLE_API_KEY）。
// LLM_MODE = "direct" ：chat/completions → Claude（ANTHROPIC_API_KEY）或 Google Gemini（GEMINI_API_KEY）
//                       audio/transcriptions → OpenAI（OPENAI_API_KEY）
// 未設定 LLM_MODE 時：有 ANTHROPIC_API_KEY 或 GEMINI_API_KEY 就 direct，否則 gateway。
//
// 文字對話走哪一家（只在 direct 模式有效）：
//   LLM_PROVIDER = "anthropic" | "google"；未設定時，有 ANTHROPIC_API_KEY 就用 Claude，否則用 Gemini。
//   要退回 Gemini：把 LLM_PROVIDER 設成 google（或刪掉 ANTHROPIC_API_KEY）。
//   CLAUDE_MODEL：Claude 模型 ID，預設 claude-haiku-5-5。
//
// 用法：把 `fetch("https://ai.gateway.lovable.dev/...", init)` 換成 `llmFetch(同 URL, 同 init)`，
//       把 `Deno.env.get("LOVABLE_API_KEY")` 換成 `llmKey()`；其餘程式碼不動。

const GATEWAY = "https://ai.gateway.lovable.dev";
const GOOGLE_OPENAI = "https://generativelanguage.googleapis.com/v1beta/openai";
const ANTHROPIC_OPENAI = "https://api.anthropic.com/v1";
const OPENAI = "https://api.openai.com/v1";
const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";
const DEFAULT_MAX_TOKENS = 2048;

export type LlmMode = "gateway" | "direct";
export type ChatProvider = "anthropic" | "google";

export function llmMode(): LlmMode {
  const m = (Deno.env.get("LLM_MODE") ?? "").toLowerCase();
  if (m === "gateway" || m === "direct") return m;
  return Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("GEMINI_API_KEY") ? "direct" : "gateway";
}

export function chatProvider(): ChatProvider {
  const p = (Deno.env.get("LLM_PROVIDER") ?? "").toLowerCase();
  if (p === "anthropic" || p === "google") return p;
  return Deno.env.get("ANTHROPIC_API_KEY") ? "anthropic" : "google";
}

/** 供舊有的「金鑰是否存在」檢查使用：回傳目前文字對話實際會用到的金鑰。 */
export function llmKey(): string | undefined {
  if (llmMode() === "gateway") return Deno.env.get("LOVABLE_API_KEY");
  return chatProvider() === "anthropic" ? Deno.env.get("ANTHROPIC_API_KEY") : Deno.env.get("GEMINI_API_KEY");
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

/** 把 OpenAI 格式的 body 調整成 Claude OpenAI 相容端點能接受的樣子。 */
export function toClaudeBody(json: Record<string, unknown>): Record<string, unknown> {
  const out = { ...json };
  out.model = Deno.env.get("CLAUDE_MODEL") || DEFAULT_CLAUDE_MODEL;
  // Claude 4.7 之後的模型：temperature < 1 或 top_p 非預設值會回 400；reasoning_effort / response_format 會被忽略
  delete out.temperature;
  delete out.top_p;
  delete out.reasoning_effort;
  delete out.response_format;
  delete out.n;
  if (out.max_tokens == null && out.max_completion_tokens == null) out.max_tokens = DEFAULT_MAX_TOKENS;
  return out;
}

/** fetch 的替身：gateway 模式原樣轉送；direct 模式改寫 URL、授權與 model。 */
export async function llmFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (llmMode() === "gateway" || !input.startsWith(GATEWAY)) return fetch(input, init);

  const path = input.slice(GATEWAY.length); // e.g. /v1/chat/completions
  const headers = new Headers(init.headers ?? {});
  headers.delete("Lovable-API-Key");
  headers.delete("Authorization");

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

  // --- chat/completions（JSON）---
  let json: Record<string, unknown> | null = null;
  if (typeof init.body === "string") {
    try { json = JSON.parse(init.body); } catch { /* 非 JSON 就原樣送 */ }
  }
  const mapped = typeof json?.model === "string" ? mapModel(json.model as string) : null;

  // 明確指定 openai/* 的仍然走 OpenAI
  if (mapped?.provider === "openai") {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("OPENAI_API_KEY is not configured (LLM_MODE=direct)");
    headers.set("Authorization", `Bearer ${key}`);
    const body = JSON.stringify({ ...json, model: mapped.model });
    return fetch(`${OPENAI}${path.slice("/v1".length)}`, { ...init, headers, body });
  }

  // 其他（google/* 或未加前綴）→ Claude 或 Gemini
  if (chatProvider() === "anthropic") {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new Error("ANTHROPIC_API_KEY is not configured (LLM_PROVIDER=anthropic)");
    headers.set("Authorization", `Bearer ${key}`);
    headers.set("x-api-key", key);
    const body = json ? JSON.stringify(toClaudeBody(json)) : init.body;
    return fetch(`${ANTHROPIC_OPENAI}${path.slice("/v1".length)}`, { ...init, headers, body });
  }

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured (LLM_MODE=direct)");
  headers.set("Authorization", `Bearer ${key}`);
  let body = init.body;
  if (json) {
    const g = { ...json };
    if (mapped) g.model = mapped.model;
    // Gemini OpenAI 相容端點不接受 reasoning_effort: "none"（接受 low/medium/high）
    if (g.reasoning_effort === "none") delete g.reasoning_effort;
    body = JSON.stringify(g);
  }
  return fetch(`${GOOGLE_OPENAI}${path.slice("/v1".length)}`, { ...init, headers, body });
}
