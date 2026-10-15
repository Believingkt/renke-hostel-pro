// Fin → 我們（Intercom Custom Channel outbound callback）：驗 token → 原始 payload 落表 → 轉 LINE Push。始終快速回 200。
import { safeEqual } from "../fin-availability/handler.ts";
import { linePush, type OutgoingMessage } from "../_shared/lineButler.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type Payload = Record<string, any>;

export const HANDOFF_TEXT = "已為您轉接真人客服，請稍候";
const HANDOFF_EVENTS = new Set(["resolution_state_updated", "workflow_finished"]);
const HANDOFF_RE = /hand_?off|escalat|transfer/i;

const ok = () => new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function callbackTokenOf(req: Request): string {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || req.headers.get("x-callback-token") || req.headers.get("x-intercom-token") || "";
}

export function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 寬鬆取文字：body → message.body → text → content（字串或 { text/body }） */
export function extractText(p: Payload): string {
  const cands = [p.body, p.message?.body, p.text, p.content, p.message?.text, p.message?.content];
  for (const c of cands) {
    const v = typeof c === "string" ? c : typeof c?.text === "string" ? c.text : typeof c?.body === "string" ? c.body : null;
    if (v && stripHtml(v)) return stripHtml(v).slice(0, 5000);
  }
  return "";
}

export function eventTypeOf(p: Payload): string {
  return String(p.event_type ?? p.type ?? p.event ?? "").trim();
}

export function externalIdOf(p: Payload): string | null {
  return p.external_conversation_id ?? p.conversation?.external_conversation_id ?? p.conversation?.external_id ?? p.data?.external_conversation_id ?? null;
}

/** quick_reply_options → LINE quick reply（最多 13 個、label 20 字、postback data=fin_qr=<id>） */
export function quickReplyMessage(p: Payload): OutgoingMessage | null {
  const raw = [p.quick_reply_options, p.options, p.message?.quick_reply_options, p.data?.quick_reply_options, p.data?.options]
    .find((x) => Array.isArray(x)) as Payload[] | undefined;
  const items = (raw || [])
    .map((o) => ({ id: String(o?.id ?? o?.option_id ?? o?.value ?? "").trim(), label: stripHtml(String(o?.text ?? o?.label ?? o?.title ?? o?.name ?? "")) }))
    .filter((o) => o.id && o.label)
    .slice(0, 13)
    .map((o) => ({
      type: "action",
      action: { type: "postback", label: o.label.slice(0, 20), data: `fin_qr=${encodeURIComponent(o.id)}`.slice(0, 300), displayText: o.label.slice(0, 300) },
    }));
  if (!items.length) return null;
  return { type: "text", text: extractText(p) || "請選擇：", quickReply: { items } };
}

const isHandoff = (type: string, p: Payload) =>
  HANDOFF_EVENTS.has(type) || HANDOFF_RE.test(type) || HANDOFF_RE.test(String(p.state ?? p.resolution_state ?? p.status ?? ""));

export interface CallbackDeps {
  db: Db;
  callbackToken: string | undefined;
  butlerToken: string | null; // 小安管家 OA（session.line_oa_channel_id = null）
}

async function channelToken(deps: CallbackDeps, channelId: string | null): Promise<string | null> {
  if (!channelId) return deps.butlerToken;
  const { data } = await deps.db.from("line_oa_channels").select("channel_access_token").eq("id", channelId).maybeSingle();
  return data?.channel_access_token || null;
}

async function handleOne(deps: CallbackDeps, p: Payload): Promise<void> {
  const type = eventTypeOf(p);
  const { data: logRow } = await deps.db.from("fin_line_events")
    .insert({ session_id: null, direction: "out", event_type: type || null, payload: p, http_status: null }).select("id").single();

  const extId = externalIdOf(p);
  if (!extId) return;
  const { data: session } = await deps.db.from("fin_line_sessions")
    .select("id, line_oa_channel_id, line_user_id, status").eq("external_conversation_id", extId).maybeSingle();
  if (!session) return;
  if (logRow?.id) await deps.db.from("fin_line_events").update({ session_id: session.id }).eq("id", logRow.id);

  const patch: Record<string, unknown> = { last_event_at: new Date().toISOString() };
  if (p.conversation_id != null && String(p.conversation_id)) patch.intercom_conversation_id = String(p.conversation_id);

  let messages: OutgoingMessage[] = [];
  if (type === "typing") {
    // 忽略
  } else if (type === "new_message") {
    const text = extractText(p);
    if (text) messages = [{ type: "text", text }];
  } else if (type === "quick_reply_options") {
    const m = quickReplyMessage(p);
    if (m) messages = [m];
  } else if (isHandoff(type, p)) {
    if (session.status !== "handoff") {
      patch.status = "handoff";
      messages = [{ type: "text", text: HANDOFF_TEXT }];
    }
  }
  await deps.db.from("fin_line_sessions").update(patch).eq("id", session.id);

  if (messages.length) {
    const token = await channelToken(deps, session.line_oa_channel_id);
    if (!token) throw new Error("找不到 LINE access token");
    await linePush(token, session.line_user_id, messages);
  }
}

export async function handleCallback(req: Request, deps: CallbackDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "只支援 POST" }, 405);
  if (!deps.callbackToken) return json({ error: "伺服器設定錯誤：尚未設定 FIN_CALLBACK_TOKEN" }, 500);
  const provided = callbackTokenOf(req);
  if (!provided || !safeEqual(provided, deps.callbackToken)) return json({ error: "unauthorized" }, 401);

  const raw = await req.text();
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
