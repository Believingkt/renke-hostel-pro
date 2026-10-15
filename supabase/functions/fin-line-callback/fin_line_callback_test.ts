import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractText, handleCallback, HANDOFF_TEXT, quickReplyMessage, stripHtml } from "./handler.ts";
import { routeToFin, type FinEnv } from "../_shared/finLineBridge.ts";
import { fakeDb, fakeFetch } from "../_shared/finLineTestDb.ts";

const TOKEN = "cb-test-token-0123456789";
const CH = "22222222-2222-4222-8222-222222222222";
const EXT = "33333333-3333-4333-8333-333333333333";
const EXT_BUTLER = "44444444-4444-4444-8444-444444444444";
const U = "Uguest1";

function setup() {
  const db = fakeDb({
    line_oa_channels: [{ id: CH, channel_access_token: "oa-line-token" }],
    fin_line_sessions: [
      { id: "s1", line_oa_channel_id: CH, line_user_id: U, external_conversation_id: EXT, status: "active", last_event_at: "2026-10-16T00:00:00.000Z", intercom_conversation_id: null },
      { id: "s2", line_oa_channel_id: null, line_user_id: "Ubutler", external_conversation_id: EXT_BUTLER, status: "active", last_event_at: "2026-10-16T00:00:00.000Z" },
    ],
  });
  return db;
}

// linePush 用全域 fetch → 測試期間替換
async function withFetch<T>(f: ReturnType<typeof fakeFetch>, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = f.fn;
  try { return await fn(); } finally { globalThis.fetch = orig; }
}
const lineOk = () => fakeFetch(() => Response.json({}));
const post = (db: any, body: unknown, headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` }) =>
  handleCallback(new Request("https://x.test/fin-line-callback", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }),
    { db, callbackToken: TOKEN, butlerToken: "butler-line-token" });

Deno.test("4a. 無 token／錯 token → 401；三種 header 皆可；缺 env → 500；非 POST → 405", async () => {
  const db = setup();
  assertEquals((await post(db, {}, {})).status, 401);
  assertEquals((await post(db, {}, { Authorization: "Bearer wrong" })).status, 401);
  assertEquals(db.tables.fin_line_events ?? [], []); // 未驗證不落表
  for (const h of [{ Authorization: `Bearer ${TOKEN}` }, { "X-Callback-Token": TOKEN }, { "X-Intercom-Token": TOKEN }]) {
    assertEquals((await post(db, { event_type: "typing", external_conversation_id: EXT }, h)).status, 200);
  }
  const miss = await handleCallback(new Request("https://x.test/f", { method: "POST" }), { db, callbackToken: undefined, butlerToken: null });
  assertEquals(miss.status, 500);
  assertEquals((await handleCallback(new Request("https://x.test/f"), { db, callbackToken: TOKEN, butlerToken: null })).status, 405);
});

Deno.test("4b. new_message → 用館方 OA token LINE Push 給 line_user_id；回寫 intercom_conversation_id、落表", async () => {
  const db = setup(); const f = lineOk();
  const r = await withFetch(f, () => post(db, { event_type: "new_message", conversation_id: 98765, external_conversation_id: EXT, message: { body: "<p>您好！11/7 還有 <b>12 人包區</b></p><p>需要幫您預訂嗎？</p>" } }));
  assertEquals(r.status, 200);
  assertEquals(f.calls.length, 1);
  const c = f.calls[0];
  assertEquals(c.url, "https://api.line.me/v2/bot/message/push");
  assertEquals((c.init.headers as Record<string, string>).Authorization, "Bearer oa-line-token");
  assertEquals(c.body, { to: U, messages: [{ type: "text", text: "您好！11/7 還有 12 人包區\n需要幫您預訂嗎？" }] });
  const s = db.tables.fin_line_sessions[0];
  assertEquals(s.intercom_conversation_id, "98765");
  assert(s.last_event_at !== "2026-10-16T00:00:00.000Z"); // 已更新
  const log = db.tables.fin_line_events[0];
  assertEquals([log.direction, log.event_type, log.session_id, log.payload.conversation_id], ["out", "new_message", "s1", 98765]);
});

Deno.test("4b'. 小安管家 session（channel null）→ 用 butler token", async () => {
  const db = setup(); const f = lineOk();
  await withFetch(f, () => post(db, { event_type: "new_message", external_conversation_id: EXT_BUTLER, body: "hi" }));
  assertEquals((f.calls[0].init.headers as Record<string, string>).Authorization, "Bearer butler-line-token");
  assertEquals(f.calls[0].body.to, "Ubutler");
});

Deno.test("4c. quick_reply_options → LINE quick reply 結構（postback data=fin_qr=<id>、label ≤ 20 字、最多 13 個）", async () => {
  const db = setup(); const f = lineOk();
  const options = [{ id: "opt_1", text: "查 11/7 空房" }, { id: "opt 2", label: "我要找真人客服幫我處理訂房的問題謝謝" }, { id: "", text: "無 id 略過" },
    ...Array.from({ length: 15 }, (_, i) => ({ id: `x${i}`, text: `選項${i}` }))];
  await withFetch(f, () => post(db, { event_type: "quick_reply_options", external_conversation_id: EXT, body: "請問想做什麼？", quick_reply_options: options }));
  const m = f.calls[0].body.messages[0];
  assertEquals(m.type, "text");
  assertEquals(m.text, "請問想做什麼？");
  assertEquals(m.quickReply.items.length, 13);
  assertEquals(m.quickReply.items[0], { type: "action", action: { type: "postback", label: "查 11/7 空房", data: "fin_qr=opt_1", displayText: "查 11/7 空房" } });
  assertEquals(m.quickReply.items[1].action.label, "我要找真人客服幫我處理訂房的問題謝謝".slice(0, 20));
  assertEquals(m.quickReply.items[1].action.data, "fin_qr=opt%202");
  // 沒有文字時用預設提示
  assertEquals(quickReplyMessage({ options: [{ id: "a", title: "A" }] })!.text, "請選擇：");
});

Deno.test("4d. workflow_finished → status=handoff、推「已轉接」一次；之後 LINE 訊息不再送 Fin", async () => {
  const db = setup(); const f = lineOk();
  await withFetch(f, () => post(db, { event_type: "workflow_finished", external_conversation_id: EXT }));
  assertEquals(db.tables.fin_line_sessions[0].status, "handoff");
  assertEquals(f.calls[0].body.messages, [{ type: "text", text: HANDOFF_TEXT }]);
  await withFetch(f, () => post(db, { event_type: "resolution_state_updated", external_conversation_id: EXT }));
  assertEquals(f.calls.length, 1); // 已 handoff 不重複推

  const fin = fakeFetch(() => Response.json({}));
  const env: FinEnv = { token: "t", base: "https://api.intercom.io", path: "/custom_channel_events" };
  const ev = { type: "message", source: { type: "user", userId: U }, message: { type: "text", text: "人呢" } };
  const rest = await routeToFin(db, [ev], { channelId: CH, accessToken: "x", env, fetchFn: fin.fn, now: new Date() });
  assertEquals(rest, [ev]);
  assertEquals(fin.calls.filter((c) => c.url.includes("intercom")).length, 0);
});

Deno.test("含 handoff 語意的事件（event_type 或 state）→ handoff", async () => {
  for (const p of [{ event_type: "conversation_handoff" }, { event_type: "state_changed", state: "escalated" }]) {
    const db = setup(); const f = lineOk();
    await withFetch(f, () => post(db, { ...p, external_conversation_id: EXT }));
    assertEquals(db.tables.fin_line_sessions[0].status, "handoff", JSON.stringify(p));
  }
});

Deno.test("5. 未知 event_type／typing → 200 且只落表、不推播；找不到 session 只記錄；壞 JSON 也 200", async () => {
  const db = setup(); const f = lineOk();
  await withFetch(f, async () => {
    assertEquals((await post(db, { event_type: "something_new", external_conversation_id: EXT, foo: 1 })).status, 200);
    assertEquals((await post(db, { event_type: "typing", external_conversation_id: EXT })).status, 200);
    assertEquals((await post(db, { event_type: "new_message", external_conversation_id: "55555555-5555-4555-8555-555555555555", body: "x" })).status, 200);
    assertEquals((await post(db, "{not json")).status, 200);
  });
  assertEquals(f.calls.length, 0);
  assertEquals(db.tables.fin_line_events.map((l) => l.event_type), ["something_new", "typing", "new_message", "invalid_json"]);
  assertEquals(db.tables.fin_line_events[0].payload.foo, 1);
  assertEquals(db.tables.fin_line_events[2].session_id, null);
  assertEquals(db.tables.fin_line_sessions[0].status, "active");
});

Deno.test("LINE push 失敗 → 仍回 200，記 callback_error", async () => {
  const db = setup(); const f = fakeFetch(() => new Response("bad", { status: 400 }));
  assertEquals((await withFetch(f, () => post(db, { event_type: "new_message", external_conversation_id: EXT, body: "hi" }))).status, 200);
  assertEquals(db.tables.fin_line_events.at(-1)!.event_type, "callback_error");
});

Deno.test("批次（陣列或 { events: [] }）逐筆處理", async () => {
  const db = setup(); const f = lineOk();
  await withFetch(f, () => post(db, { events: [{ event_type: "new_message", external_conversation_id: EXT, text: "a" }, { event_type: "new_message", external_conversation_id: EXT, content: { text: "b" } }] }));
  assertEquals(f.calls.map((c) => c.body.messages[0].text), ["a", "b"]);
});

Deno.test("extractText／stripHtml 寬鬆取文字", () => {
  assertEquals(extractText({ body: "  ", message: { body: "<p>A&amp;B</p>" } }), "A&B");
  assertEquals(extractText({ content: "c" }), "c");
  assertEquals(extractText({}), "");
  assertEquals(stripHtml("a<br>b<br/>c"), "a\nb\nc");
});
