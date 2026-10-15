// LINE → Fin（Intercom Fin Agent API：POST /fin/start、/fin/reply）橋接：line-webhook 在原流程前呼叫 routeToFin，
// 回傳「Fin 沒接手」的事件（非候選、handoff、Fin 失敗）交回原流程。Fin 的回答走 webhook（fin-line-callback）。依賴可注入，方便 mock 測試。

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type LineEvent = any;

export const SESSION_TTL_MS = 24 * 3600_000;
export const FIN_TIMEOUT_MS = 5000;
const BIND_RE = /(?:text=)?bind:([a-f0-9-]+)/i;

export interface FinEnv {
  token: string | undefined;
  base: string;
  version: string;
}

export function finEnv(): FinEnv {
  return {
    token: Deno.env.get("FIN_AGENT_API_TOKEN") || undefined,
    base: (Deno.env.get("FIN_AGENT_API_BASE") || "https://api.intercom.io").replace(/\/+$/, ""),
    version: Deno.env.get("FIN_INTERCOM_VERSION") || "2.16",
  };
}

export const finConfigured = (env: FinEnv = finEnv()) => !!env.token;
export const butlerFinEnabled = () => Deno.env.get("FIN_LINE_BUTLER_ENABLED") === "true";

/** 只有使用者的一般文字訊息（bind: 指令除外）與 fin_qr= postback（相容舊按鈕）會交給 Fin */
export function isFinCandidate(ev: LineEvent): boolean {
  if (ev?.source?.type !== "user" || !ev.source.userId) return false;
  if (ev.type === "message" && ev.message?.type === "text") {
    const text = String(ev.message.text ?? "").trim();
    return !!text && !BIND_RE.test(text);
  }
  if (ev.type === "postback") return String(ev.postback?.data ?? "").includes("fin_qr=");
  return false;
}

/** 要送給 Fin 的使用者文字：文字訊息本文；fin_qr postback 取 displayText（沒有則 null → 交回原流程） */
export function finUserText(ev: LineEvent): string | null {
  const raw = ev.type === "postback" ? ev.postback?.displayText : ev.message?.text;
  const text = typeof raw === "string" ? raw.trim() : "";
  return text || null;
}

async function logEvent(db: Db, row: { session_id: string | null; direction: "in" | "out"; event_type: string | null; payload: unknown; http_status?: number | null }) {
  const { data, error } = await db.from("fin_line_events").insert({ http_status: null, ...row }).select("id").single();
  if (error) console.error("[fin-line] log failed", error.message ?? error);
  return data?.id as string | undefined;
}

async function lineDisplayName(accessToken: string | null, userId: string, fetchFn: typeof fetch): Promise<string | undefined> {
  if (!accessToken) return undefined;
  try {
    const r = await fetchFn(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return undefined;
    const p = await r.json();
    return typeof p?.displayName === "string" && p.displayName.trim() ? p.displayName.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** 呼叫 Fin Agent API（start／reply）；request／response 一律落表；2xx 視為成功，非 2xx 或逾時回 false */
async function postFin(db: Db, env: FinEnv, sessionId: string, op: "start" | "reply", body: Record<string, unknown>, fetchFn: typeof fetch): Promise<boolean> {
  const url = `${env.base}/fin/${op}`;
  let status: number | null = null;
  let response: unknown = null;
  try {
    const r = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.token}`,
        "Intercom-Version": env.version,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FIN_TIMEOUT_MS),
    });
    status = r.status;
    const text = await r.text();
    try { response = text ? JSON.parse(text) : null; } catch { response = text.slice(0, 4000); }
  } catch (e) {
    response = { error: String((e as Error)?.name === "TimeoutError" ? "timeout" : e) };
  }
  await logEvent(db, { session_id: sessionId, direction: "in", event_type: `fin_${op}`, payload: { url, request: body, response }, http_status: status });
  return status !== null && status >= 200 && status < 300;
}

interface Session { id: string; external_conversation_id: string; status: string; last_event_at: string }

async function findRecentSession(db: Db, channelId: string | null, userId: string, now: Date): Promise<Session | null> {
  let q = db.from("fin_line_sessions").select("id, external_conversation_id, status, last_event_at")
    .eq("line_user_id", userId).in("status", ["active", "handoff"])
    .gt("last_event_at", new Date(now.getTime() - SESSION_TTL_MS).toISOString());
  q = channelId ? q.eq("line_oa_channel_id", channelId) : q.is("line_oa_channel_id", null);
  const { data, error } = await q.order("last_event_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`session lookup failed: ${error.message ?? error}`);
  return data ?? null;
}

const touch = (db: Db, id: string, now: Date, patch: Record<string, unknown> = {}) =>
  db.from("fin_line_sessions").update({ last_event_at: now.toISOString(), ...patch }).eq("id", id);

/** 單一事件交給 Fin；回 true = Fin 已接手，false = 退回原流程 */
async function bridgeOne(db: Db, ev: LineEvent, ctx: RouteCtx): Promise<boolean> {
  const text = finUserText(ev);
  if (!text) return false;
  const now = ctx.now ?? new Date();
  const fetchFn = ctx.fetchFn ?? fetch;
  const userId: string = ev.source.userId;
  let session = await findRecentSession(db, ctx.channelId, userId, now);

  if (session?.status === "handoff") {
    await touch(db, session.id, now); // 對話持續中則維持轉人工
    return false;
  }

  const message = { author: "user", body: text };
  if (session) {
    const ok = await postFin(db, ctx.env, session.id, "reply", { conversation_id: session.external_conversation_id, message, user: { id: `line:${userId}` } }, fetchFn);
    if (ok) await touch(db, session.id, now);
    return ok;
  }

  const { data, error } = await db.from("fin_line_sessions").insert({
    line_oa_channel_id: ctx.channelId, line_user_id: userId, external_conversation_id: crypto.randomUUID(),
    status: "active", last_event_at: now.toISOString(),
  }).select("id, external_conversation_id, status, last_event_at").single();
  if (error || !data) throw new Error(`session insert failed: ${error?.message ?? error}`);
  session = data as Session;

  const name = await lineDisplayName(ctx.accessToken, userId, fetchFn);
  const ok = await postFin(db, ctx.env, session.id, "start", {
    conversation_id: session.external_conversation_id, message, user: { id: `line:${userId}`, ...(name ? { name } : {}) },
  }, fetchFn);
  await touch(db, session.id, now, ok ? {} : { status: "closed" }); // start 失敗：下一則重新開對話
  return ok;
}

export interface RouteCtx {
  channelId: string | null; // null = 小安管家 OA
  accessToken: string | null;
  env: FinEnv;
  fetchFn?: typeof fetch;
  now?: Date;
}

/** 回傳需交回原流程的事件（維持原順序） */
export async function routeToFin(db: Db, events: LineEvent[], ctx: RouteCtx): Promise<LineEvent[]> {
  if (!ctx.env.token) return events;
  const rest: LineEvent[] = [];
  for (const ev of events) {
    if (!isFinCandidate(ev)) { rest.push(ev); continue; }
    let handled = false;
    try {
      handled = await bridgeOne(db, ev, ctx);
    } catch (e) {
      console.error("[fin-line] bridge error, fallback", e);
      await logEvent(db, { session_id: null, direction: "in", event_type: "bridge_error", payload: { error: String(e), line_event: ev } });
    }
    if (!handled) rest.push(ev);
  }
  return rest;
}
