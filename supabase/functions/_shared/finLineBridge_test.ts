import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { finEnv, isFinCandidate, quickReplyOptionId, routeToFin, SESSION_TTL_MS, type FinEnv } from "./finLineBridge.ts";
import { fakeDb, fakeFetch } from "./finLineTestDb.ts";

const ENV: FinEnv = { token: "fin-test-token", base: "https://api.intercom.io", path: "/custom_channel_events" };
const CH = "11111111-1111-4111-8111-111111111111";
const U = "Uabc123";
const text = (t: string, userId = U) => ({ type: "message", replyToken: "rt", source: { type: "user", userId }, message: { type: "text", text: t } });
const postback = (data: string) => ({ type: "postback", replyToken: "rt", source: { type: "user", userId: U }, postback: { data } });
const follow = { type: "follow", replyToken: "rt", source: { type: "user", userId: U } };

function finOk(status = 200) {
  return fakeFetch((url) => {
    if (url.includes("/v2/bot/profile/")) return Response.json({ displayName: "王小明" });
    return new Response(status >= 300 ? "boom" : JSON.stringify({ ok: true }), { status });
  });
}
const finCalls = (f: ReturnType<typeof fakeFetch>) => f.calls.filter((c) => c.url.startsWith(ENV.base));

Deno.test("isFinCandidate：只收 user 文字（bind: 除外）與 fin_qr postback", () => {
  assert(isFinCandidate(text("請問 11/7 有空房嗎")));
  assert(!isFinCandidate(text("bind:0a1b2c3d-aaaa-bbbb-cccc-000000000000")));
  assert(!isFinCandidate(text("text=bind:abc")));
  assert(!isFinCandidate(text("   ")));
  assert(isFinCandidate(postback("fin_qr=opt_1")));
  assert(!isFinCandidate(postback("action=trip&x=1")));
  assert(!isFinCandidate(follow));
  assert(!isFinCandidate({ ...text("hi"), source: { type: "group", groupId: "G1", userId: U } }));
  assert(!isFinCandidate({ type: "message", source: { type: "user", userId: U }, message: { type: "sticker" } }));
  assertEquals(quickReplyOptionId("fin_qr=opt%201&x=1"), "opt 1");
});

Deno.test("finEnv：預設 base／path，env 可調整", () => {
  const keys = ["FIN_AGENT_API_TOKEN", "FIN_AGENT_API_BASE", "FIN_AGENT_API_PATH"];
  const saved = keys.map((k) => Deno.env.get(k));
  try {
    keys.forEach((k) => Deno.env.delete(k));
    assertEquals(finEnv(), { token: undefined, base: "https://api.intercom.io", path: "/custom_channel_events" });
    Deno.env.set("FIN_AGENT_API_BASE", "https://api.eu.intercom.io/");
    Deno.env.set("FIN_AGENT_API_PATH", "custom_channel/events/");
    assertEquals(finEnv().base + finEnv().path, "https://api.eu.intercom.io/custom_channel/events");
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

Deno.test("2. 第一則 → new_conversation + new_message；第二則只 new_message；25 小時後新 session", async () => {
  const db = fakeDb(); const f = finOk();
  const t0 = new Date("2026-10-16T01:00:00Z");
  const ctx = { channelId: CH, accessToken: "line-tok", env: ENV, fetchFn: f.fn };

  const rest1 = await routeToFin(db, [text("請問有空房嗎"), follow], { ...ctx, now: t0 });
  assertEquals(rest1, [follow]); // follow 走原流程
  const c1 = finCalls(f);
  assertEquals(c1.map((c) => c.url), [`${ENV.base}${ENV.path}/notify_new_conversation`, `${ENV.base}${ENV.path}/notify_new_message`]);
  assertEquals(c1[0].init.method, "POST");
  assertEquals((c1[0].init.headers as Record<string, string>).Authorization, "Bearer fin-test-token");
  const s1 = db.tables.fin_line_sessions[0];
  assertEquals([s1.line_oa_channel_id, s1.line_user_id, s1.status], [CH, U, "active"]);
  assertEquals(c1[0].body.external_conversation_id, s1.external_conversation_id);
  assertEquals(c1[0].body.contact, { type: "user", external_id: `line:${U}`, name: "王小明" });
  assertEquals(c1[1].body.body, "請問有空房嗎");
  assert(c1[0].body.event_id && c1[0].body.event_id !== c1[1].body.event_id);

  const t1 = new Date(t0.getTime() + 3600_000);
  await routeToFin(db, [text("12 人")], { ...ctx, now: t1 });
  const c2 = finCalls(f).slice(2);
  assertEquals(c2.map((c) => c.url.split("/").pop()), ["notify_new_message"]);
  assertEquals(c2[0].body.external_conversation_id, s1.external_conversation_id);
  assertEquals(db.tables.fin_line_sessions.length, 1);
  assertEquals(s1.last_event_at, t1.toISOString());

  const t2 = new Date(t1.getTime() + SESSION_TTL_MS + 3600_000); // 25 小時後
  await routeToFin(db, [text("還在嗎")], { ...ctx, now: t2 });
  const c3 = finCalls(f).slice(3);
  assertEquals(c3.map((c) => c.url.split("/").pop()), ["notify_new_conversation", "notify_new_message"]);
  assertEquals(db.tables.fin_line_sessions.length, 2);
  assert(c3[0].body.external_conversation_id !== s1.external_conversation_id);

  // 每次 Fin 呼叫的 request/response 都落表（direction=in）
  const logs = db.tables.fin_line_events;
  assertEquals(logs.length, 5);
  assert(logs.every((l) => l.direction === "in" && l.http_status === 200 && l.payload.request && l.session_id));
});

Deno.test("postback fin_qr → notify_quick_reply_selected（帶 option id）", async () => {
  const db = fakeDb(); const f = finOk();
  const ctx = { channelId: null, accessToken: "butler-tok", env: ENV, fetchFn: f.fn };
  await routeToFin(db, [text("hi")], ctx);
  const rest = await routeToFin(db, [postback("fin_qr=opt_2")], ctx);
  assertEquals(rest, []);
  const last = finCalls(f).at(-1)!;
  assertEquals([last.url.split("/").pop(), last.body.quick_reply_option_id], ["notify_quick_reply_selected", "opt_2"]);
  assertEquals(db.tables.fin_line_sessions[0].line_oa_channel_id, null); // 小安管家 OA
});

Deno.test("小安管家與館方 OA 的 session 分開；不同使用者分開", async () => {
  const db = fakeDb(); const f = finOk();
  await routeToFin(db, [text("a")], { channelId: null, accessToken: "b", env: ENV, fetchFn: f.fn });
  await routeToFin(db, [text("b")], { channelId: CH, accessToken: "c", env: ENV, fetchFn: f.fn });
  await routeToFin(db, [text("c", "Uother")], { channelId: CH, accessToken: "c", env: ENV, fetchFn: f.fn });
  assertEquals(db.tables.fin_line_sessions.length, 3);
});

Deno.test("3. Fin 回 500 → 退回原流程且落表；new_conversation 失敗的 session 關閉、下一則重開", async () => {
  const db = fakeDb(); const f = finOk(500);
  const ev = text("hi");
  const rest = await routeToFin(db, [ev], { channelId: CH, accessToken: "t", env: ENV, fetchFn: f.fn });
  assertEquals(rest, [ev]);
  assertEquals(db.tables.fin_line_events.map((l) => [l.direction, l.event_type, l.http_status]), [["in", "notify_new_conversation", 500]]);
  assertEquals(db.tables.fin_line_sessions[0].status, "closed");

  const f2 = finOk(200);
  assertEquals(await routeToFin(db, [text("again")], { channelId: CH, accessToken: "t", env: ENV, fetchFn: f2.fn }), []);
  assertEquals(db.tables.fin_line_sessions.length, 2);
});

Deno.test("3b. new_message 失敗（既有 session）→ 退回原流程；session 仍為 active", async () => {
  const db = fakeDb();
  let fail = false;
  const f = fakeFetch((url) => (url.includes("/profile/") ? Response.json({}) : new Response("x", { status: fail ? 502 : 200 })));
  const ctx = { channelId: CH, accessToken: "t", env: ENV, fetchFn: f.fn };
  await routeToFin(db, [text("1")], ctx);
  fail = true;
  const ev = text("2");
  assertEquals(await routeToFin(db, [ev], ctx), [ev]);
  assertEquals(db.tables.fin_line_sessions[0].status, "active");
  assertEquals(db.tables.fin_line_events.at(-1)!.http_status, 502);
  // profile 沒有 displayName → contact 省略 name
  assertEquals(f.calls.find((c) => c.url.endsWith("notify_new_conversation"))!.body.contact, { type: "user", external_id: `line:${U}` });
});

Deno.test("3c. Fin 逾時（>5 秒）→ 退回原流程，http_status=null、response 記 timeout", async () => {
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

Deno.test("handoff session → 不送 Fin、交回原流程，並延長 last_event_at", async () => {
  const now = new Date("2026-10-16T05:00:00Z");
  const db = fakeDb({ fin_line_sessions: [{ id: "s1", line_oa_channel_id: CH, line_user_id: U, external_conversation_id: crypto.randomUUID(), status: "handoff", last_event_at: new Date(now.getTime() - 3600_000).toISOString() }] });
  const f = finOk();
  const ev = text("真人在嗎");
  assertEquals(await routeToFin(db, [ev], { channelId: CH, accessToken: "t", env: ENV, fetchFn: f.fn, now }), [ev]);
  assertEquals(finCalls(f).length, 0);
  assertEquals(db.tables.fin_line_sessions[0].last_event_at, now.toISOString());
});

Deno.test("DB 例外 → 退回原流程並記 bridge_error", async () => {
  const db = fakeDb();
  const broken = { from: (t: string) => (t === "fin_line_sessions" ? { select: () => { throw new Error("db down"); } } : db.from(t)) };
  const ev = text("hi");
  assertEquals(await routeToFin(broken, [ev], { channelId: CH, accessToken: "t", env: ENV, fetchFn: finOk().fn }), [ev]);
  assertEquals(db.tables.fin_line_events[0].event_type, "bridge_error");
});
