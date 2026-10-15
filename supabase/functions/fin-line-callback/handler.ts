// Fin → 我們（Intercom Fin Agent API webhook）：驗簽章 → 原始 payload 落表 → 依 event_name 轉 LINE Push／更新 session。始終快速回 200。
import { safeEqual } from "../fin-availability/handler.ts";
import { linePush, type OutgoingMessage } from "../_shared/lineButler.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type Payload = Record<string, any>;

export const HANDOFF_TEXT = "已為您轉接真人客服，請稍候";
export const SIGNATURE_HEADER = "x-fin-agent-api-webhook-signature";

const ok = () => new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function callbackTokenOf(req: Request): string {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || req.headers.get("x-callback-token") || req.headers.get("x-intercom-token") || "";
}

/** HMAC-SHA256(raw body, secret)，回傳 hex 與 base64（官方未寫編碼，兩種都比） */
export async function signatureCandidates(raw: string, secret: string): Promise<{ hex: string; base64: string }> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  return {
    hex: Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join(""),
    base64: btoa(String.fromCharCode(...sig)),
  };
}

export async function verifySignature(raw: string, provided: string, secret: string): Promise<boolean> {
  const p = provided.trim().replace(/^sha256=/i, "");
  if (!p) return false;
  const { hex, base64 } = await signatureCandidates(raw, secret);
  return safeEqual(p.toLowerCase(), hex) || safeEqual(p, base64);
}

export function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** event_name 為主，event_type／type／event 為寬鬆備援 */
export function eventNameOf(p: Payload): string {
  return String(p.event_name ?? p.event_type ?? p.type ?? p.event ?? "").trim();
}

/** conversation_id 在 payload 頂層，即我們送出的 external_conversation_id */
export function conversationIdOf(p: Payload): string | null {
  const v = p.conversation_id ?? p.external_conversation_id;
  return v == null || String(v) === "" ? null : String(v);
}

export interface CallbackDeps {
  db: Db;
  webhookSecret?: string;
  callbackToken?: string; // 只在未設 webhookSecret 時使用（手測相容）
  butlerToken: string | null; // 小安管家 OA（session.line_oa_channel_id = null）
}

async function channelToken(deps: CallbackDeps, channelId: string | null): Promise<string | null> {
  if (!channelId) return deps.butlerToken;
  const { data } = await deps.db.from("line_oa_channels").select("channel_access_token").eq("id", channelId).maybeSingle();
  return data?.channel_access_token || null;
}

/** 同 session 是否已處理過相同 message.id 的 fin_replied（排除本筆） */
async function isDuplicateReply(deps: CallbackDeps, sessionId: string, messageId: string, selfId: string | undefined): Promise<boolean> {
  const { data } = await deps.db.from("fin_line_events").select("id, payload").eq("session_id", sessionId).eq("event_type", "fin_replied");
  return (data ?? []).some((r: Payload) => r.id !== selfId && r.payload?.message?.id != null && String(r.payload.message.id) === messageId);
}

async function handleOne(deps: CallbackDeps, p: Payload): Promise<void> {
  const name = eventNameOf(p);
  const { data: logRow } = await deps.db.from("fin_line_events")
    .insert({ session_id: null, direction: "out", event_type: name || null, payload: p, http_status: null }).select("id").single();

  const convId = conversationIdOf(p);
  if (!convId) return;
  const { data: session } = await deps.db.from("fin_line_sessions")
    .select("id, line_oa_channel_id, line_user_id, status").eq("external_conversation_id", convId).maybeSingle();
  if (!session) return;

  const messageId = name === "fin_replied" && p.message?.id != null ? String(p.message.id) : null;
  const duplicate = messageId ? await isDuplicateReply(deps, session.id, messageId, logRow?.id) : false;
  if (logRow?.id) await deps.db.from("fin_line_events").update({ session_id: session.id }).eq("id", logRow.id);

  const patch: Record<string, unknown> = { last_event_at: new Date().toISOString() };
  let messages: OutgoingMessage[] = [];
  if (name === "fin_replied") {
    const text = typeof p.message?.body === "string" ? stripHtml(p.message.body).slice(0, 5000) : "";
    if (text && !duplicate) messages = [{ type: "text", text }];
  } else if (name === "fin_status_updated") {
    const status = String(p.status ?? "").trim().toLowerCase();
    if (status === "escalated") {
      if (session.status !== "handoff") {
        patch.status = "handoff";
        messages = [{ type: "text", text: HANDOFF_TEXT }];
      }
    } else if (status === "resolved" || status === "complete") {
      patch.status = "closed"; // 下一則 LINE 訊息重新 /fin/start
    }
  }
  // csat_requested、fin_reply_chunk、awaiting_user_reply 與未知事件：只落表
  await deps.db.from("fin_line_sessions").update(patch).eq("id", session.id);

  if (messages.length) {
    const token = await channelToken(deps, session.line_oa_channel_id);
    if (!token) throw new Error("找不到 LINE access token");
    await linePush(token, session.line_user_id, messages);
  }
}

export async function handleCallback(req: Request, deps: CallbackDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "只支援 POST" }, 405);
  if (!deps.webhookSecret && !deps.callbackToken) {
    return json({ error: "伺服器設定錯誤：尚未設定 FIN_WEBHOOK_SECRET（或手測用 FIN_CALLBACK_TOKEN）" }, 500);
  }
  const raw = await req.text();
  if (deps.webhookSecret) {
    if (!(await verifySignature(raw, req.headers.get(SIGNATURE_HEADER) ?? "", deps.webhookSecret))) return json({ error: "unauthorized" }, 401);
  } else {
    const provided = callbackTokenOf(req);
    if (!provided || !safeEqual(provided, deps.callbackToken!)) return json({ error: "unauthorized" }, 401);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await deps.db.from("fin_line_events").insert({ session_id: null, direction: "out", event_type: "invalid_json", payload: { raw: raw.slice(0, 10000) }, http_status: null });
    return ok();
  }
  const list: Payload[] = Array.isArray(parsed) ? parsed : Array.isArray((parsed as Payload)?.events) ? (parsed as Payload).events : [parsed as Payload];
  for (const p of list) {
    try {
      if (p && typeof p === "object") await handleOne(deps, p);
    } catch (e) {
      console.error("[fin-line-callback] handle error", e);
      await deps.db.from("fin_line_events").insert({ session_id: null, direction: "out", event_type: "callback_error", payload: { error: String(e), event: p }, http_status: null });
    }
  }
  return ok();
}
