import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { conversationIdOf, eventNameOf, handleCallback, HANDOFF_TEXT, signatureCandidates, stripHtml, verifySignature } from "./handler.ts";
import { routeToFin, type FinEnv } from "../_shared/finLineBridge.ts";
import { fakeDb, fakeFetch } from "../_shared/finLineTestDb.ts";

const SECRET = "fin-webhook-secret-0123456789";
const TOKEN = "cb-test-token-0123456789";
const CH = "22222222-2222-4222-8222-222222222222";
const EXT = "33333333-3333-4333-8333-333333333333";
const EXT_BUTLER = "44444444-4444-4444-8444-444444444444";
const U = "Uguest1";
const ENV: FinEnv = { token: "t", base: "https://api.intercom.io", version: "2.16" };

function setup() {
  return fakeDb({
    line_oa_channels: [{ id: CH, channel_access_token: "oa-line-token" }],
    fin_line_sessions: [
      { id: "s1", line_oa_channel_id: CH, line_user_id: U, external_conversation_id: EXT, status: "active", last_event_at: "2026-10-16T00:00:00.000Z" },
      { id: "s2", line_oa_channel_id: null, line_user_id: "Ubutler", external_conversation_id: EXT_BUTLER, status: "active", last_event_at: "2026-10-16T00:00:00.000Z" },
    ],
  });
}

async function withFetch<T>(f: ReturnType<typeof fakeFetch>, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = f.fn;
  try { return await fn(); } finally { globalThis.fetch = orig; }
}
const lineOk = () => fakeFetch(() => Response.json({}));
const req = (raw: string, headers: Record<string, string>) => new Request("https://x.test/fin-line-callback", { method: "POST", headers, body: raw });

/** 以 secret 簽章（預設 hex）送出 */
async function post(db: any, body: unknown, enc: "hex" | "base64" = "hex") {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const sig = (await signatureCandidates(raw, SECRET))[enc];
  return handleCallback(req(raw, { "X-Fin-Agent-API-Webhook-Signature": sig }), { db, webhookSecret: SECRET, butlerToken: "butler-line-token" });
}
const replied = (id: string, body: string, conversation_id = EXT) => ({ event_name: "fin_replied", conversation_id, message: { id, author: "fin", body }, sources: [{ title: "FAQ", url: "https://x" }] });
const status = (s: string, extra: Record<string, unknown> = {}) => ({ event_name: "fin_status_updated", conversation_id: EXT, status: s, ...extra });

Deno.test("簽章：hex 與 base64 皆通過；錯簽／缺簽 401 且不落表；非 POST 405", async () => {
  const db = setup();
  const raw = JSON.stringify(status("awaiting_user_reply"));
  const { hex, base64 } = await signatureCandidates(raw, SECRET);
  assertEquals(hex.length, 64);
  assert(await verifySignature(raw, hex, SECRET));
  assert(await verifySignature(raw, hex.toUpperCase(), SECRET));
  assert(await verifySignature(raw, base64, SECRET));
  assert(await verifySignature(raw, `sha256=${hex}`, SECRET));
  assert(!(await verifySignature(raw + " ", hex, SECRET)));
  assert(!(await verifySignature(raw, "", SECRET)));

  const deps = { db, webhookSecret: SECRET, butlerToken: null };
  assertEquals((await handleCallback(req(raw, { "X-Fin-Agent-API-Webhook-Signature": hex }), deps)).status, 200);
  assertEquals((await handleCallback(req(raw, { "X-Fin-Agent-API-Webhook-Signature": base64 }), deps)).status, 200);
  const before = db.tables.fin_line_events.length;
  assertEquals((await handleCallback(req(raw, { "X-Fin-Agent-API-Webhook-Signature": "deadbeef" }), deps)).status, 401);
  assertEquals((await handleCallback(req(raw, {}), deps)).status, 401);
  // 有 secret 時不接受 token（即使 token 正確）
  assertEquals((await handleCallback(req(raw, { Authorization: `Bearer ${TOKEN}` }), { ...deps, callbackToken: TOKEN })).status, 401);
  assertEquals(db.tables.fin_line_events.length, before);
  assertEquals((await handleCallback(new Request("https://x.test/f"), deps)).status, 405);
});

Deno.test("無 FIN_WEBHOOK_SECRET → 退回 FIN_CALLBACK_TOKEN（三種 header）；兩者都沒設 → 500", async () => {
  const db = setup();
  const raw = JSON.stringify(status("awaiting_user_reply"));
  const deps = { db, callbackToken: TOKEN, butlerToken: null };
  for (const h of [{ Authorization: `Bearer ${TOKEN}` }, { "X-Callback-Token": TOKEN }, { "X-Intercom-Token": TOKEN }] as Record<string, string>[]) {
    assertEquals((await handleCallback(req(raw, h), deps)).status, 200);
  }
  assertEquals((await handleCallback(req(raw, { Authorization: "Bearer wrong" }), deps)).status, 401);
  assertEquals((await handleCallback(req(raw, {}), deps)).status, 401);
  assertEquals((await handleCallback(req(raw, {}), { db, butlerToken: null })).status, 500);
});

Deno.test("fin_replied → 去 HTML 後用館方 OA token LINE Push；sources 不推；落表帶 session_id", async () => {
  const db = setup(); const f = lineOk();
  const r = await withFetch(f, () => post(db, replied("m1", "<p>您好！11/7 還有 <b>12 人包區</b></p><p>需要幫您預訂嗎？</p>")));
  assertEquals(r.status, 200);
  assertEquals(f.calls.length, 1);
  const c = f.calls[0];
  assertEquals(c.url, "https://api.line.me/v2/bot/message/push");
  assertEquals((c.init.headers as Record<string, string>).Authorization, "Bearer oa-line-token");
  assertEquals(c.body, { to: U, messages: [{ type: "text", text: "您好！11/7 還有 12 人包區\n需要幫您預訂嗎？" }] });
  assert(db.tables.fin_line_sessions[0].last_event_at !== "2026-10-16T00:00:00.000Z");
  const log = db.tables.fin_line_events[0];
  assertEquals([log.direction, log.event_type, log.session_id, log.payload.message.id], ["out", "fin_replied", "s1", "m1"]);
});

Deno.test("fin_replied 去重：相同 message.id 第二次只落表不推；不同 id 照推；base64 簽章亦可", async () => {
  const db = setup(); const f = lineOk();
  await withFetch(f, async () => {
    await post(db, replied("m1", "第一則"));
    await post(db, replied("m1", "第一則"), "base64");
    await post(db, replied("m2", "第二則"));
  });
  assertEquals(f.calls.map((c) => c.body.messages[0].text), ["第一則", "第二則"]);
  assertEquals(db.tables.fin_line_events.filter((l) => l.event_type === "fin_replied").length, 3);
  // 其他 session 的相同 message.id 不影響
  await withFetch(f, () => post(db, replied("m1", "管家", EXT_BUTLER)));
  assertEquals((f.calls.at(-1)!.init.headers as Record<string, string>).Authorization, "Bearer butler-line-token");
  assertEquals(f.calls.at(-1)!.body.to, "Ubutler");
});

Deno.test("fin_status_updated escalated → handoff、推「已轉接」一次（reason 只落表）；之後 LINE 訊息不再送 Fin", async () => {
  const db = setup(); const f = lineOk();
  await withFetch(f, async () => {
    await post(db, status("escalated", { reason: "user_requested_human" }));
    await post(db, status("escalated", { reason: "again" }));
  });
  assertEquals(db.tables.fin_line_sessions[0].status, "handoff");
  assertEquals(f.calls.length, 1);
  assertEquals(f.calls[0].body.messages, [{ type: "text", text: HANDOFF_TEXT }]);
  assertEquals(db.tables.fin_line_events[0].payload.reason, "user_requested_human");

  const fin = fakeFetch(() => Response.json({}));
  const ev = { type: "message", source: { type: "user", userId: U }, message: { type: "text", text: "人呢" } };
  assertEquals(await routeToFin(db, [ev], { channelId: CH, accessToken: "x", env: ENV, fetchFn: fin.fn, now: new Date() }), [ev]);
  assertEquals(fin.calls.filter((c) => c.url.includes("intercom")).length, 0);
});

Deno.test("fin_status_updated resolved／complete → session closed、不推文字；下一則重新 /fin/start、新 conversation_id", async () => {
  for (const s of ["resolved", "complete"]) {
    const db = setup(); const f = lineOk();
    await withFetch(f, () => post(db, status(s)));
    assertEquals([db.tables.fin_line_sessions[0].status, f.calls.length], ["closed", 0], s);

    const fin = fakeFetch(() => Response.json({}));
    const ev = { type: "message", source: { type: "user", userId: U }, message: { type: "text", text: "再問一下" } };
    assertEquals(await routeToFin(db, [ev], { channelId: CH, accessToken: "x", env: ENV, fetchFn: fin.fn, now: new Date() }), []);
    const calls = fin.calls.filter((c) => c.url.includes("intercom"));
    assertEquals(calls.map((c) => c.url), ["https://api.intercom.io/fin/start"], s);
    assert(calls[0].body.conversation_id !== EXT);
    assertEquals(db.tables.fin_line_sessions.at(-1)!.external_conversation_id, calls[0].body.conversation_id);
  }
});

Deno.test("awaiting_user_reply／其他 status、csat_requested、fin_reply_chunk、未知事件 → 只落表、200、status 不變、不推", async () => {
  const db = setup(); const f = lineOk();
  const events = [
    status("awaiting_user_reply"), status("thinking"), status(""),
    { event_name: "csat_requested", conversation_id: EXT },
    { event_name: "fin_reply_chunk", conversation_id: EXT, message: { id: "c1", body: "部分" } },
    { event_name: "something_new", conversation_id: EXT, foo: 1 },
  ];
  await withFetch(f, async () => {
    for (const e of events) assertEquals((await post(db, e)).status, 200);
  });
  assertEquals(f.calls.length, 0);
  assertEquals(db.tables.fin_line_sessions[0].status, "active");
  assertEquals(db.tables.fin_line_events.map((l) => l.event_type), ["fin_status_updated", "fin_status_updated", "fin_status_updated", "csat_requested", "fin_reply_chunk", "something_new"]);
  assert(db.tables.fin_line_events.every((l) => l.session_id === "s1"));
});

Deno.test("舊 Custom Channel 事件（new_message、quick_reply_options、resolution_state_updated、workflow_finished）不再處理：只落表", async () => {
  const db = setup(); const f = lineOk();
  await withFetch(f, async () => {
    await post(db, { event_type: "new_message", conversation_id: EXT, body: "x" });
    await post(db, { event_type: "quick_reply_options", conversation_id: EXT, quick_reply_options: [{ id: "a", text: "A" }] });
    await post(db, { event_type: "resolution_state_updated", conversation_id: EXT, state: "routed_to_team" });
    await post(db, { event_type: "workflow_finished", conversation_id: EXT });
  });
  assertEquals([f.calls.length, db.tables.fin_line_sessions[0].status], [0, "active"]);
});

Deno.test("找不到 session 只記錄；缺 conversation_id 只記錄；壞 JSON 也 200；LINE push 失敗記 callback_error", async () => {
  const db = setup(); const f = lineOk();
  await withFetch(f, async () => {
    assertEquals((await post(db, replied("m9", "x", "55555555-5555-4555-8555-555555555555"))).status, 200);
    assertEquals((await post(db, { event_name: "fin_replied", message: { id: "m8", body: "x" } })).status, 200);
    assertEquals((await post(db, "{not json")).status, 200);
  });
  assertEquals(f.calls.length, 0);
  assertEquals(db.tables.fin_line_events.map((l) => [l.event_type, l.session_id]), [["fin_replied", null], ["fin_replied", null], ["invalid_json", null]]);

  const bad = fakeFetch(() => new Response("bad", { status: 400 }));
  assertEquals((await withFetch(bad, () => post(db, replied("m10", "hi")))).status, 200);
  assertEquals(db.tables.fin_line_events.at(-1)!.event_type, "callback_error");
});

Deno.test("批次（陣列或 { events: [] }）逐筆處理；event_name 優先、event_type／type 備援", async () => {
  const db = setup(); const f = lineOk();
  await withFetch(f, () => post(db, { events: [replied("a1", "a"), { type: "fin_replied", conversation_id: EXT, message: { id: "a2", body: "b" } }] }));
  assertEquals(f.calls.map((c) => c.body.messages[0].text), ["a", "b"]);
  assertEquals(eventNameOf({ event_name: "fin_replied", event_type: "x" }), "fin_replied");
  assertEquals(eventNameOf({ event_type: "fin_status_updated" }), "fin_status_updated");
  assertEquals(conversationIdOf({ conversation_id: 123 }), "123");
  assertEquals(conversationIdOf({}), null);
});

Deno.test("stripHtml", () => {
  assertEquals(stripHtml("<p>A&amp;B</p>"), "A&B");
  assertEquals(stripHtml("a<br>b<br/>c"), "a\nb\nc");
});
