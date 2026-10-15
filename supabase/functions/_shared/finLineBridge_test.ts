import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { finEnv, finUserText, isFinCandidate, routeToFin, SESSION_TTL_MS, type FinEnv } from "./finLineBridge.ts";
import { fakeDb, fakeFetch } from "./finLineTestDb.ts";

const ENV: FinEnv = { token: "fin-test-token", base: "https://api.intercom.io", version: "2.16" };
const CH = "11111111-1111-4111-8111-111111111111";
const U = "Uabc123";
const text = (t: string, userId = U) => ({ type: "message", replyToken: "rt", source: { type: "user", userId }, message: { type: "text", text: t } });
const postback = (data: string, displayText?: string) => ({ type: "postback", replyToken: "rt", source: { type: "user", userId: U }, postback: { data, ...(displayText ? { displayText } : {}) } });
const follow = { type: "follow", replyToken: "rt", source: { type: "user", userId: U } };
const finResp = (conversation_id = "x") => ({ conversation_id, user_id: "u", status: "thinking", created_at_ms: 1, sse_subscription_url: "https://sse", errors: [] });

function finOk(status = 200) {
  return fakeFetch((url) => {
    if (url.includes("/v2/bot/profile/")) return Response.json({ displayName: "王小明" });
    return new Response(status >= 300 ? "boom" : JSON.stringify(finResp()), { status });
  });
}
const finCalls = (f: ReturnType<typeof fakeFetch>) => f.calls.filter((c) => c.url.startsWith(ENV.base));
const headersOf = (c: { init: RequestInit }) => c.init.headers as Record<string, string>;

Deno.test("isFinCandidate：只收 user 文字（bind: 除外）與 fin_qr postback；finUserText 取文字／displayText", () => {
  assert(isFinCandidate(text("請問 11/7 有空房嗎")));
  assert(!isFinCandidate(text("bind:0a1b2c3d-aaaa-bbbb-cccc-000000000000")));
  assert(!isFinCandidate(text("text=bind:abc")));
  assert(!isFinCandidate(text("   ")));
  assert(isFinCandidate(postback("fin_qr=opt_1")));
  assert(!isFinCandidate(postback("action=trip&x=1")));
  assert(!isFinCandidate(follow));
  assert(!isFinCandidate({ ...text("hi"), source: { type: "group", groupId: "G1", userId: U } }));
  assert(!isFinCandidate({ type: "message", source: { type: "user", userId: U }, message: { type: "sticker" } }));
  assertEquals(finUserText(text("  hi  ")), "hi");
  assertEquals(finUserText(postback("fin_qr=opt_1", "查 11/7 空房")), "查 11/7 空房");
  assertEquals(finUserText(postback("fin_qr=opt_1")), null);
});

Deno.test("finEnv：預設 base／Intercom-Version 2.16，env 可調整；不再有 path", () => {
  const keys = ["FIN_AGENT_API_TOKEN", "FIN_AGENT_API_BASE", "FIN_INTERCOM_VERSION"];
  const saved = keys.map((k) => Deno.env.get(k));
  try {
    keys.forEach((k) => Deno.env.delete(k));
    assertEquals(finEnv(), { token: undefined, base: "https://api.intercom.io", version: "2.16" });
    Deno.env.set("FIN_AGENT_API_BASE", "https://api.eu.intercom.io/");
    Deno.env.set("FIN_INTERCOM_VERSION", "Unstable");
    assertEquals([finEnv().base, finEnv().version], ["https://api.eu.intercom.io", "Unstable"]);
  } finally {
    keys.forEach((k, i) => (saved[i] === undefined ? Deno.env.delete(k) : Deno.env.set(k, saved[i]!)));
  }
});

Deno.test("沒有 FIN_AGENT_API_TOKEN → 全部交回原流程、不打任何請求", async () => {
  const db = fakeDb(); const f = finOk();
  const evs = [text("hi"), follow];
  const rest = await routeToFin(db, evs, { channelId: CH, accessToken: "tok", env: { ...ENV, token: undefined }, fetchFn: f.fn });
  assertEquals(rest, evs);
  assertEquals(f.calls.length, 0);
});

Deno.test("第一則 → POST /fin/start（headers、body 形狀）；第二則 → /fin/reply；25 小時後新 session 重新 start", async () => {
  const db = fakeDb(); const f = finOk();
  const t0 = new Date("2026-10-16T01:00:00Z");
  const ctx = { channelId: CH, accessToken: "line-tok", env: ENV, fetchFn: f.fn };

  const rest1 = await routeToFin(db, [text("請問有空房嗎"), follow], { ...ctx, now: t0 });
  assertEquals(rest1, [follow]);
  const c1 = finCalls(f);
  assertEquals(c1.map((c) => c.url), ["https://api.intercom.io/fin/start"]);
  assertEquals(c1[0].init.method, "POST");
  assertEquals(headersOf(c1[0]).Authorization, "Bearer fin-test-token");
  assertEquals(headersOf(c1[0])["Intercom-Version"], "2.16");
  assertEquals(headersOf(c1[0])["Content-Type"], "application/json");
  const s1 = db.tables.fin_line_sessions[0];
  assertEquals([s1.line_oa_channel_id, s1.line_user_id, s1.status], [CH, U, "active"]);
  assertEquals(c1[0].body, {
    conversation_id: s1.external_conversation_id,
    message: { author: "user", body: "請問有空房嗎" },
    user: { id: `line:${U}`, name: "王小明" },
  });

  const t1 = new Date(t0.getTime() + 3600_000);
  await routeToFin(db, [text("12 人")], { ...ctx, now: t1 });
  const c2 = finCalls(f).slice(1);
  assertEquals(c2.map((c) => c.url), ["https://api.intercom.io/fin/reply"]);
  assertEquals(c2[0].body, { conversation_id: s1.external_conversation_id, message: { author: "user", body: "12 人" }, user: { id: `line:${U}` } });
  assertEquals(headersOf(c2[0])["Intercom-Version"], "2.16");
  assertEquals(db.tables.fin_line_sessions.length, 1);
  assertEquals(s1.last_event_at, t1.toISOString());
  assertEquals(f.calls.filter((c) => c.url.includes("/profile/")).length, 1); // 只有 start 查暱稱

  const t2 = new Date(t1.getTime() + SESSION_TTL_MS + 3600_000);
  await routeToFin(db, [text("還在嗎")], { ...ctx, now: t2 });
  const c3 = finCalls(f).slice(2);
  assertEquals(c3.map((c) => c.url.split("/").pop()), ["start"]);
  assertEquals(db.tables.fin_line_sessions.length, 2);
  assert(c3[0].body.conversation_id !== s1.external_conversation_id);

  const logs = db.tables.fin_line_events;
  assertEquals(logs.map((l) => l.event_type), ["fin_start", "fin_reply", "fin_start"]);
  assert(logs.every((l) => l.direction === "in" && l.http_status === 200 && l.payload.request && l.payload.response?.status === "thinking" && l.session_id));
});

Deno.test("fin_qr postback → displayText 當一般文字送 /fin/reply；沒有 displayText → 交回原流程、不送 Fin", async () => {
  const db = fakeDb(); const f = finOk();
  const ctx = { channelId: null, accessToken: "butler-tok", env: ENV, fetchFn: f.fn };
  await routeToFin(db, [text("hi")], ctx);
  assertEquals(await routeToFin(db, [postback("fin_qr=opt_2", "查 11/7 空房")], ctx), []);
  const last = finCalls(f).at(-1)!;
  assertEquals([last.url.split("/").pop(), last.body.message], ["reply", { author: "user", body: "查 11/7 空房" }]);
  assert(!("quick_reply_option_id" in last.body));
  const bare = postback("fin_qr=opt_3");
  assertEquals(await routeToFin(db, [bare], ctx), [bare]);
  assertEquals(finCalls(f).length, 2);
  assertEquals(db.tables.fin_line_sessions[0].line_oa_channel_id, null);
});

Deno.test("小安管家與館方 OA 的 session 分開；不同使用者分開", async () => {
  const db = fakeDb(); const f = finOk();
  await routeToFin(db, [text("a")], { channelId: null, accessToken: "b", env: ENV, fetchFn: f.fn });
  await routeToFin(db, [text("b")], { channelId: CH, accessToken: "c", env: ENV, fetchFn: f.fn });
  await routeToFin(db, [text("c", "Uother")], { channelId: CH, accessToken: "c", env: ENV, fetchFn: f.fn });
  assertEquals(db.tables.fin_line_sessions.length, 3);
  assertEquals(finCalls(f).map((c) => c.url.split("/").pop()), ["start", "start", "start"]);
});

Deno.test("/fin/start 回 500 → 退回原流程且落表、session 關閉；下一則重新 start", async () => {
  const db = fakeDb(); const f = finOk(500);
  const ev = text("hi");
  assertEquals(await routeToFin(db, [ev], { channelId: CH, accessToken: "t", env: ENV, fetchFn: f.fn }), [ev]);
  assertEquals(db.tables.fin_line_events.map((l) => [l.direction, l.event_type, l.http_status]), [["in", "fin_start", 500]]);
  assertEquals(db.tables.fin_line_sessions[0].status, "closed");

  const f2 = finOk(200);
  assertEquals(await routeToFin(db, [text("again")], { channelId: CH, accessToken: "t", env: ENV, fetchFn: f2.fn }), []);
  assertEquals(db.tables.fin_line_sessions.length, 2);
  assertEquals(finCalls(f2).map((c) => c.url.split("/").pop()), ["start"]);
});

Deno.test("/fin/reply 失敗（既有 session）→ 退回原流程；session 仍 active；無暱稱時 user 省略 name", async () => {
  const db = fakeDb();
  let fail = false;
  const f = fakeFetch((url) => (url.includes("/profile/") ? Response.json({}) : new Response("x", { status: fail ? 502 : 200 })));
  const ctx = { channelId: CH, accessToken: "t", env: ENV, fetchFn: f.fn };
  await routeToFin(db, [text("1")], ctx);
  fail = true;
  const ev = text("2");
  assertEquals(await routeToFin(db, [ev], ctx), [ev]);
  assertEquals(db.tables.fin_line_sessions[0].status, "active");
  assertEquals([db.tables.fin_line_events.at(-1)!.event_type, db.tables.fin_line_events.at(-1)!.http_status], ["fin_reply", 502]);
  assertEquals(f.calls.find((c) => c.url.endsWith("/fin/start"))!.body.user, { id: `line:${U}` });
});

Deno.test("Fin 逾時（>5 秒）→ 退回原流程，http_status=null、response 記 timeout", async () => {
  const db = fakeDb();
  const f = fakeFetch((url, init) => {
    if (url.includes("/profile/")) return Response.json({});
    return new Promise<Response>((_, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("timed out", "TimeoutError"))));
  });
  const t0 = Date.now();
  const ev = text("hi");
  assertEquals(await routeToFin(db, [ev], { channelId: CH, accessToken: "t", env: ENV, fetchFn: f.fn }), [ev]);
  assert(Date.now() - t0 >= 4900);
  const log = db.tables.fin_line_events[0];
  assertEquals([log.http_status, log.payload.response], [null, { error: "timeout" }]);
});

Deno.test("handoff session → 不送 Fin、交回原流程，並延長 last_event_at；24h 無訊息後重新交給 Fin", async () => {
  const now = new Date("2026-10-16T05:00:00Z");
  const db = fakeDb({ fin_line_sessions: [{ id: "s1", line_oa_channel_id: CH, line_user_id: U, external_conversation_id: crypto.randomUUID(), status: "handoff", last_event_at: new Date(now.getTime() - 3600_000).toISOString() }] });
  const f = finOk();
  const ev = text("真人在嗎");
  assertEquals(await routeToFin(db, [ev], { channelId: CH, accessToken: "t", env: ENV, fetchFn: f.fn, now }), [ev]);
  assertEquals(finCalls(f).length, 0);
  assertEquals(db.tables.fin_line_sessions[0].last_event_at, now.toISOString());
  const later = new Date(now.getTime() + SESSION_TTL_MS + 1000);
  assertEquals(await routeToFin(db, [text("又來了")], { channelId: CH, accessToken: "t", env: ENV, fetchFn: f.fn, now: later }), []);
  assertEquals(finCalls(f).map((c) => c.url.split("/").pop()), ["start"]);
});

Deno.test("DB 例外 → 退回原流程並記 bridge_error", async () => {
  const db = fakeDb();
  const broken = { from: (t: string) => (t === "fin_line_sessions" ? { select: () => { throw new Error("db down"); } } : db.from(t)) };
  const ev = text("hi");
  assertEquals(await routeToFin(broken, [ev], { channelId: CH, accessToken: "t", env: ENV, fetchFn: finOk().fn }), [ev]);
  assertEquals(db.tables.fin_line_events[0].event_type, "bridge_error");
});
