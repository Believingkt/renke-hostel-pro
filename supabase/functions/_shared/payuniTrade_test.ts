// PAYUNi W3 信用卡測試：PAYUNi 回應全部 mock、記憶體 DB，不連網、不含真實金鑰。
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { encrypt, hashInfo, parseNotify, type PayuniCall, type PayuniConfig, type PayuniResult } from "./payuni.ts";
import { FakeDb } from "./payuniTestFakes.ts";
import {
  handleCardCharge, handleEmbedToken, handleTradeNotify, handleTradeQuery, handleTradeReturn, RETURN_ERROR_URL, type PayuniTradeDeps,
} from "./payuniTradeHandlers.ts";
import { inSweepWindow, nextMerTradeNo, resolveChargeAmount, resolveIframeDomain } from "./payuniTrade.ts";
import { buildPayuniSuccessPatch } from "./orderPaymentSuccess.ts";
import { buildTappayNotifySuccessPatch } from "./patchBuilders.ts";

const KEY = "12345678901234567890123456789012";
const IV = "1234567890123456";
const cfg: PayuniConfig = { env: "sandbox", baseUrl: "https://sandbox-api.payuni.com.tw", agentId: "TEST", hashKey: KEY, hashIv: IV, agentMerId: null };
const NOW = Date.parse("2026-11-01T10:00:00Z");
const ACC = "11111111-1111-4111-8111-111111111111";
const ORD = "o-1";
const ORIGIN = "https://booking.lakeze.com";

const acc = (o: Record<string, unknown> = {}) => ({
  id: ACC, name: "測試館A", custom_domain: null, short_url_alias: "testa", payment_provider_active: "payuni",
  payuni_mer_id: "TEST0001", payuni_mer_status: 1, payuni_payment_tools: { CREDIT: 1 }, ...o,
});
const order = (o: Record<string, unknown> = {}) => ({
  id: ORD, order_number: "LL8Y46U8", accommodation_id: ACC, final_price: 12000, paid_amount: 0, payment_status: "pending_payment",
  order_status: "pending", guest_email: "g@example.com", payment_method: "credit_card_payuni", notes: null, discount_code: null,
  created_at: new Date(NOW - 60 * 60 * 1000).toISOString(), deposit_percent: 30, ...o,
});
const tx = (o: Record<string, unknown> = {}) => ({
  id: "t-1", order_id: ORD, accommodation_id: ACC, provider: "payuni", mer_id: "TEST0001", mer_trade_no: "LL8Y46U8-P1", kind: "full",
  amount: 12000, status: "pending", raw_response: { sdk_token: "SDK", iframe_domain: ORIGIN }, created_at: new Date(NOW - 60_000).toISOString(), ...o,
});

function setup(tables: Record<string, any[]>, reply: PayuniResult | ((c: PayuniCall) => PayuniResult) = { ok: true, status: "SUCCESS", data: {}, raw: {} }) {
  const db = new FakeDb(tables);
  const calls: PayuniCall[] = [];
  const fx = { booking: 0, final: 0, kol: 0, push: 0, alerts: [] as string[] };
  const deps: PayuniTradeDeps = {
    admin: db.client(), env: "sandbox", notifyBase: "https://x.supabase.co/functions/v1", now: () => NOW,
    callPayuni: (c) => { calls.push(c); return Promise.resolve(typeof reply === "function" ? reply(c) : reply); },
    sendAlert: (s) => { fx.alerts.push(s); return Promise.resolve(true); },
    effects: {
      sendBookingConfirmation: () => { fx.booking++; return Promise.resolve(); },
      sendFinalPaymentReceived: () => { fx.final++; return Promise.resolve(); },
      kolWebhook: () => { fx.kol++; return Promise.resolve(); },
      push: () => { fx.push++; return Promise.resolve(); },
      sendAtmPaymentReceived: () => Promise.resolve(),
      sendAtmCreated: () => Promise.resolve(),
    },
  };
  return { db, deps, calls, fx };
}
const TOKEN_OK: PayuniResult = { ok: true, status: "SUCCESS", data: { Token: "SDK-NEW" }, raw: {} };

// 1. 金額由後端決定
Deno.test("金額：前端帶任意金額無效；訂金比例對刷卡無效；補收＝final−paid", async () => {
  const { db, deps, calls } = setup({ accommodation_info: [acc()], orders: [order()] }, TOKEN_OK);
  const r = await handleEmbedToken(deps, { order_number: "LL8Y46U8", purpose: "booking", amount: 1 }, ORIGIN);
  assertEquals([r.status, r.body.amount, r.body.mer_trade_no, r.body.env], [200, 12000, "LL8Y46U8-P1", "S"]);
  assertEquals(db.rows("payment_transactions")[0].amount, 12000);
  assertEquals(calls[0].payload.IFrameDomain, ORIGIN);
  assertFalse("UseTokenType" in calls[0].payload);
  assertEquals(resolveChargeAmount({ final_price: 12000, paid_amount: 3600 }), 8400);
});

Deno.test("補收：final_price − paid_amount ≤ 0 → 400「無需付款」", async () => {
  const { deps } = setup({ accommodation_info: [acc()], orders: [order({ paid_amount: 12000, payment_status: "paid" })] }, TOKEN_OK);
  const r = await handleEmbedToken(deps, { order_number: "LL8Y46U8", purpose: "supplement" }, ORIGIN);
  assertEquals([r.status, r.body.error], [400, "無需付款"]);
});

// 2. MerTradeNo
Deno.test("MerTradeNo：首次 P1、失敗重試 P2、已付款 → 409", async () => {
  assertEquals(nextMerTradeNo("LL8Y46U8", "P", []), "LL8Y46U8-P1");
  assertEquals(nextMerTradeNo("LL8Y46U8", "A", ["LL8Y46U8-P1", "LL8Y46U8-A1"]), "LL8Y46U8-A2");
  const { deps } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx({ status: "failed" })] }, TOKEN_OK);
  assertEquals((await handleEmbedToken(deps, { order_number: "LL8Y46U8", purpose: "booking" }, ORIGIN)).body.mer_trade_no, "LL8Y46U8-P2");
  const s2 = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx({ status: "paid" })] }, TOKEN_OK);
  const r = await handleEmbedToken(s2.deps, { order_number: "LL8Y46U8", purpose: "booking" }, ORIGIN);
  assertEquals([r.status, r.body.error, s2.calls.length], [409, "已付款", 0]);
});

// 3. Token 過期、網域白名單、未開通
Deno.test("Token 過期 → TOKEN_EXPIRED；IFrameDomain 不在白名單 → 400；未開通 → 400", async () => {
  const { deps, calls } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx({ created_at: new Date(NOW - 11 * 60_000).toISOString() })] });
  assertEquals((await handleCardCharge(deps, { mer_trade_no: "LL8Y46U8-P1" }, null)).body, { ok: false, code: "TOKEN_EXPIRED" });
  assertEquals(calls.length, 0);
  const s = setup({ accommodation_info: [acc()], orders: [order()] }, TOKEN_OK);
  assertEquals((await handleEmbedToken(s.deps, { order_number: "LL8Y46U8", purpose: "booking" }, "https://evil.example.com")).status, 400);
  assertEquals(resolveIframeDomain("http://booking.lakeze.com", "sandbox"), null);
  assertEquals(resolveIframeDomain("https://testa.lakeze.com", "production", ["testa.lakeze.com"]), "https://testa.lakeze.com");
  assertEquals(resolveIframeDomain("https://abc.preview.emergentagent.com", "production"), null);
  assertEquals(resolveIframeDomain("https://abc.preview.emergentagent.com", "sandbox"), "https://abc.preview.emergentagent.com");
  const s3 = setup({ accommodation_info: [acc({ payuni_payment_tools: { CREDIT: 9 } })], orders: [order()] }, TOKEN_OK);
  assertEquals((await handleEmbedToken(s3.deps, { order_number: "LL8Y46U8", purpose: "booking" }, ORIGIN)).body.error, "此館尚未開通線上刷卡");
});

// 4. merchant_trade 回應
Deno.test("card-charge：3D URL → pending＋redirect；payload 金額取交易列、API3D=1、無發票參數；sdk_token 清除", async () => {
  const { db, deps, calls } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx()] },
    { ok: true, status: "SUCCESS", data: { URL: "https://sandbox-api.payuni.com.tw/3d" }, raw: {} });
  const r = await handleCardCharge(deps, { mer_trade_no: "LL8Y46U8-P1", amount: 1 }, "1.2.3.4, 5.6.7.8");
  assertEquals(r.body, { ok: true, redirect_url: "https://sandbox-api.payuni.com.tw/3d" });
  const p = calls[0].payload;
  assertEquals([p.TradeAmt, p.API3D, p.Token, p.UserIP, p.UsrMail], [12000, 1, "SDK", "1.2.3.4", "g@example.com"]);
  assertEquals(p.NotifyURL, "https://x.supabase.co/functions/v1/payuni-trade-notify");
  assertFalse("CarrierType" in p);
  const t = db.rows("payment_transactions")[0];
  assertEquals([t.status, "sdk_token" in t.raw_response], ["pending", false]);
});

Deno.test("card-charge：SUCCESS+TradeStatus=1 → paid；UNKNOWN → unknown；失敗 → failed", async () => {
  const ok = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx()] },
    { ok: true, status: "SUCCESS", data: { TradeStatus: "1", TradeAmt: "12000", TradeNo: "PN1", Card6No: "414763", Card4No: "0002", AuthCode: "A1" }, raw: {} });
  assertEquals((await handleCardCharge(ok.deps, { mer_trade_no: "LL8Y46U8-P1" }, null)).body, { ok: true, paid: true });
  const t = ok.db.rows("payment_transactions")[0];
  assertEquals([t.status, t.provider_trade_no, t.card_first6, t.card_last4], ["paid", "PN1", "414763", "0002"]);
  assertEquals(ok.db.rows("orders")[0].payment_status, "paid");
  const un = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx()] }, { ok: false, status: "UNKNOWN", raw: {} });
  assertEquals((await handleCardCharge(un.deps, { mer_trade_no: "LL8Y46U8-P1" }, null)).body, { ok: true, pending: true });
  assertEquals(un.db.rows("payment_transactions")[0].status, "unknown");
  const bad = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx()] }, { ok: false, status: "MERTRADE01", message: "授權失敗", raw: {} });
  assertEquals((await handleCardCharge(bad.deps, { mer_trade_no: "LL8Y46U8-P1" }, null)).body, { ok: false, message: "授權失敗" });
  assertEquals(bad.db.rows("payment_transactions")[0].status, "failed");
});

// 5. Notify
async function notifyReq(data: Record<string, string>, tamper = false) {
  const enc = await encrypt(data, KEY, IV);
  let hash = await hashInfo(enc, KEY, IV);
  if (tamper) hash = (hash[0] === "A" ? "B" : "A") + hash.slice(1);
  return new Request("https://x/payuni-trade-notify", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ MerID: "TEST0001", Version: "1.0", EncryptInfo: enc, HashInfo: hash }),
  });
}
const PAID = { MerID: "TEST0001", MerTradeNo: "LL8Y46U8-P1", TradeNo: "PN1", TradeAmt: "12000", TradeStatus: "1", AuthDay: "20261101", AuthTime: "100000", AuthCode: "A1" };

Deno.test("notify：成功 → 副作用只觸發一次；重送同一筆不重複", async () => {
  const { db, deps, fx } = setup({ accommodation_info: [acc()], orders: [order({ discount_code: "KOL1" })], payment_transactions: [tx()] });
  const r = await handleTradeNotify(deps, await parseNotify(await notifyReq(PAID), { config: cfg }));
  assertEquals([r.status, await r.text()], [200, "OK"]);
  const o = db.rows("orders")[0];
  assertEquals([o.payment_status, o.paid_amount, o.payment_method], ["paid", 12000, "credit_card_payuni"]);
  assertEquals([fx.booking, fx.kol, fx.final], [1, 1, 0]);
  await handleTradeNotify(deps, await parseNotify(await notifyReq(PAID), { config: cfg }));
  db.rows("payuni_notify_events").length = 0; // 即使事件表沒擋到，交易已 paid 也不重做
  await handleTradeNotify(deps, await parseNotify(await notifyReq(PAID), { config: cfg }));
  assertEquals([fx.booking, db.rpcCalls.length], [1, 1]);
  const ev = db.rows("payuni_notify_events")[0];
  assertEquals([ev.source, ev.notify_type, ev.execute_time], ["trade", "credit", "20261101100000"]);
});

Deno.test("notify：金額不符 → 交易 paid＋異常＋告警，訂單不確認", async () => {
  const { db, deps, fx } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx()] });
  await handleTradeNotify(deps, await parseNotify(await notifyReq({ ...PAID, TradeAmt: "1" }), { config: cfg }));
  const t = db.rows("payment_transactions")[0];
  assertEquals(t.status, "paid");
  assert(String(t.raw_response.anomaly).startsWith("AMOUNT_MISMATCH"));
  assertEquals([db.rows("orders")[0].payment_status, fx.booking, fx.alerts.length, db.rows("notifications").length], ["pending_payment", 0, 1, 1]);
});

Deno.test("notify：竄改 HashInfo → 不改資料；找不到交易 → UNKNOWN_TRADE；TradeStatus 2 → failed", async () => {
  const { db, deps } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx()] });
  await handleTradeNotify(deps, await parseNotify(await notifyReq(PAID, true), { config: cfg }));
  assertEquals([db.rows("payment_transactions")[0].status, db.rows("payuni_notify_events")[0].process_error], ["pending", "HASH_MISMATCH"]);
  await handleTradeNotify(deps, await parseNotify(await notifyReq({ ...PAID, MerTradeNo: "NOPE-P1", TradeNo: "X" }), { config: cfg }));
  assertEquals(db.rows("payuni_notify_events")[1].process_error, "UNKNOWN_TRADE");
  await handleTradeNotify(deps, await parseNotify(await notifyReq({ ...PAID, TradeStatus: "2", TradeNo: "PN2" }), { config: cfg }));
  assertEquals([db.rows("payment_transactions")[0].status, db.rows("orders")[0].payment_status], ["failed", "pending_payment"]);
});

// 6. trade-return
Deno.test("trade-return：303 到原網域；驗章失敗也 303 到 error；URL 不含解密內容", async () => {
  const { db } = setup({ orders: [order()], payment_transactions: [tx()] });
  const ok = await handleTradeReturn(db.client(), await parseNotify(await notifyReq(PAID), { config: cfg }));
  assertEquals([ok.status, ok.headers.get("Location")], [303, `${ORIGIN}/payment-result?order=LL8Y46U8&tx=LL8Y46U8-P1`]);
  for (const s of ["PN1", "A1", "12000"]) assertFalse(ok.headers.get("Location")!.includes(s));
  const bad = await handleTradeReturn(db.client(), await parseNotify(await notifyReq(PAID, true), { config: cfg }));
  assertEquals([bad.status, bad.headers.get("Location")], [303, RETURN_ERROR_URL]);
});

// 7. sweep
Deno.test("sweep：只查 15 分鐘～24 小時的 pending／unknown；非 service → 403", async () => {
  const at = (m: number) => new Date(NOW - m * 60_000).toISOString();
  const rows = [
    tx({ id: "a", mer_trade_no: "LL8Y46U8-P1", created_at: at(5) }),
    tx({ id: "b", mer_trade_no: "LL8Y46U8-P2", created_at: at(20) }),
    tx({ id: "c", mer_trade_no: "LL8Y46U8-P3", created_at: at(25 * 60) }),
    tx({ id: "d", mer_trade_no: "LL8Y46U8-P4", created_at: at(20), status: "failed" }),
  ];
  const { deps, calls } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: rows }, { ok: true, status: "SUCCESS", data: { TradeStatus: "0" }, raw: {} });
  const caller = { isService: true, isSuperAdmin: false, isAccommodationAdmin: () => Promise.resolve(false) };
  await handleTradeQuery(deps, { action: "sweep" }, caller);
  assertEquals(calls.map((c) => c.payload.MerTradeNo), ["LL8Y46U8-P2"]);
  assertEquals((await handleTradeQuery(deps, { action: "sweep" }, { ...caller, isService: false })).status, 403);
  assert(inSweepWindow(at(15), NOW));
  assertFalse(inSweepWindow(at(14), NOW));
});

Deno.test("sweep 逾時：以最後一次付款嘗試起算 30 分鐘；查到已付款就走付款成功不取消", async () => {
  const at = (m: number) => new Date(NOW - m * 60_000).toISOString();
  const s1 = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx({ status: "failed", created_at: at(20) })] });
  const caller = { isService: true, isSuperAdmin: false, isAccommodationAdmin: () => Promise.resolve(false) };
  assertEquals((await handleTradeQuery(s1.deps, { action: "sweep" }, caller)).body.cancelled, []);
  const s2 = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx({ status: "failed", created_at: at(40) })] });
  assertEquals((await handleTradeQuery(s2.deps, { action: "sweep" }, caller)).body.cancelled, ["LL8Y46U8"]);
  const o = s2.db.rows("orders")[0];
  assertEquals(o.order_status, "cancelled");
  assert(String(o.notes).includes("payment_timeout"));
  assertEquals(s2.fx.booking, 0);
  const s3 = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx({ created_at: at(40) })] },
    { ok: true, status: "SUCCESS", data: { "Result[0][TradeStatus]": "1", "Result[0][TradeAmt]": "12000", "Result[0][TradeNo]": "PN9" }, raw: {} });
  assertEquals((await handleTradeQuery(s3.deps, { action: "sweep" }, caller)).body.cancelled, []);
  assertEquals([s3.db.rows("orders")[0].payment_status, s3.db.rows("orders")[0].order_status], ["paid", "confirmed"]);
  const s4 = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx({ created_at: at(40) })] }, { ok: false, status: "ERROR", raw: {} });
  assertEquals((await handleTradeQuery(s4.deps, { action: "sweep" }, caller)).body.cancelled, []);
});

Deno.test("手動查詢：hotel_admin 可查本館；其他人 403", async () => {
  const { deps } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx()] }, { ok: true, status: "SUCCESS", data: { TradeStatus: "0", CloseStatus: "1" }, raw: {} });
  const r = await handleTradeQuery(deps, { mer_trade_no: "LL8Y46U8-P1" }, { isService: false, isSuperAdmin: false, isAccommodationAdmin: (id) => Promise.resolve(id === ACC) });
  assertEquals([r.status, r.body.trade_status, r.body.close_status], [200, "0", "1"]);
  assertEquals((await handleTradeQuery(deps, { mer_trade_no: "LL8Y46U8-P1" }, { isService: false, isSuperAdmin: false, isAccommodationAdmin: () => Promise.resolve(false) })).status, 403);
});

// patch 一致性
Deno.test("同一筆成功：TapPay 與 PAYUNi patch 除 payment_method／balance_payment_method 外完全相同", () => {
  for (const [status, cur] of [["paid", "pending"], ["deposit_paid", "pending_payment"], ["paid", "confirmed"]] as const) {
    const input = { newPaymentStatus: status, newPaidAmount: 5000, newNotes: "n", currentOrderStatus: cur, confirmedAtIso: "2026-11-01T00:00:00Z" };
    const { payment_method: _a, balance_payment_method: _b, ...tp } = buildTappayNotifySuccessPatch({ ...input, isAtm: false }) as Record<string, unknown>;
    const { payment_method: pm, balance_payment_method: _c, ...pu } = buildPayuniSuccessPatch(input);
    assertEquals(pu, tp);
    assertEquals(pm, "credit_card_payuni");
  }
});

// ---------------- 審查後修正（D3／D6／D8～D11／E1） ----------------
const SVC = { isService: true, isSuperAdmin: false, isAccommodationAdmin: () => Promise.resolve(false) };

Deno.test("E1：同一 mer_trade_no 併發兩次 card-charge → 只有一次呼叫 PAYUNi，另一個 409", async () => {
  const { deps, calls } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx()] },
    { ok: true, status: "SUCCESS", data: { URL: "https://sandbox-api.payuni.com.tw/3d" }, raw: {} });
  const [a, b] = await Promise.all([
    handleCardCharge(deps, { mer_trade_no: "LL8Y46U8-P1" }, null),
    handleCardCharge(deps, { mer_trade_no: "LL8Y46U8-P1" }, null),
  ]);
  assertEquals(calls.length, 1);
  assertEquals([a.status, b.status].sort(), [200, 409]);
  assertEquals([a, b].find((r) => r.status === 409)!.body, { ok: false, code: "INVALID_STATE" });
});

Deno.test("D9：已 paid 的交易不會被晚到的 TradeStatus 2／8 或 card-charge 失敗改掉", async () => {
  const { db, deps } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx()] });
  await handleTradeNotify(deps, await parseNotify(await notifyReq(PAID), { config: cfg }));
  // deno-lint-ignore no-explicit-any
  const stale: any = { ...db.rows("payment_transactions")[0], status: "pending" };
  const { applyPayuniTradeResult } = await import("./payuniTrade.ts");
  await applyPayuniTradeResult(deps, stale, { TradeStatus: "2" });
  await applyPayuniTradeResult(deps, stale, { TradeStatus: "8" });
  assertEquals(db.rows("payment_transactions")[0].status, "paid");
});

Deno.test("D10：TradeStatus=1 但缺 TradeAmt → 不入帳、標 awaiting_notify", async () => {
  const { db, deps, fx } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx()] },
    { ok: true, status: "SUCCESS", data: { TradeStatus: "1", TradeNo: "PN1" }, raw: {} });
  await handleCardCharge(deps, { mer_trade_no: "LL8Y46U8-P1" }, null);
  const t = db.rows("payment_transactions")[0];
  assertEquals([t.status, t.raw_response.awaiting_notify, db.rows("orders")[0].payment_status, fx.booking], ["pending", true, "pending_payment", 0]);
});

Deno.test("D8：sandbox 不再允許 lovable.app／lovableproject.com", () => {
  assertEquals(resolveIframeDomain("https://x.lovable.app", "sandbox"), null);
  assertEquals(resolveIframeDomain("https://x.lovableproject.com", "sandbox"), null);
  assertEquals(resolveIframeDomain("http://localhost:5173", "sandbox"), "http://localhost:5173");
  assertEquals(resolveIframeDomain("http://localhost:5173", "production"), null);
});

Deno.test("D6：逾時取消走 update_order_with_context（p_source=payuni_payment_timeout），pending 交易改 expired", async () => {
  const at = (m: number) => new Date(NOW - m * 60_000).toISOString();
  const { db, deps } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx({ status: "failed", created_at: at(40) })] });
  await handleTradeQuery(deps, { action: "sweep" }, SVC);
  const call = db.rpcCalls.find((c) => c.name === "update_order_with_context")!;
  assertEquals([call.args.p_source, call.args.p_patch.order_status], ["payuni_payment_timeout", "cancelled"]);
});

Deno.test("D11：24 小時外的 pending 交易取消前補查；查詢失敗不取消；查到未付才取消並改 expired", async () => {
  const old = new Date(NOW - 25 * 60 * 60_000).toISOString();
  const fail = setup({ accommodation_info: [acc()], orders: [order({ created_at: old })], payment_transactions: [tx({ created_at: old })] }, { ok: false, status: "ERROR", raw: {} });
  assertEquals((await handleTradeQuery(fail.deps, { action: "sweep" }, SVC)).body.cancelled, []);
  assertEquals(fail.calls.length, 1);
  const ok = setup({ accommodation_info: [acc()], orders: [order({ created_at: old })], payment_transactions: [tx({ created_at: old })] },
    { ok: true, status: "SUCCESS", data: { TradeStatus: "0" }, raw: {} });
  assertEquals((await handleTradeQuery(ok.deps, { action: "sweep" }, SVC)).body.cancelled, ["LL8Y46U8"]);
  assertEquals(ok.db.rows("payment_transactions")[0].status, "expired");
});

// D3：orders insert 欄位與 create-paid-order 只能差允許清單
function insertKeys(path: string): Set<string> {
  const src = Deno.readTextFileSync(new URL(path, import.meta.url));
  const i = src.search(/from\("orders"\)\s*\.insert\(\[\{/);
  const start = src.indexOf("[{", i) + 2;
  const end = src.indexOf("}])", start);
  return new Set([...src.slice(start, end).matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]));
}
Deno.test("D3：payuni-create-pending-order 與 create-paid-order 的 orders insert 欄位只差允許清單", () => {
  const ALLOWED = new Set(["payment_method", "payment_status", "paid_amount", "deposit_amount", "deposit_payment_method", "balance_payment_method", "notes", "order_status",
    "booking_deposit_amount", "booking_deposit_percentage"]); // W4：ATM 訂金快照
  const a = insertKeys("../create-paid-order/index.ts");
  const b = insertKeys("../payuni-create-pending-order/index.ts");
  assert(a.size > 20 && b.size > 20);
  const diff = [...a].filter((k) => !b.has(k)).concat([...b].filter((k) => !a.has(k))).filter((k) => !ALLOWED.has(k));
  assertEquals(diff, []);
});

Deno.test("status 輪詢：需 order_number 與 mer_trade_no 相符，只回狀態", async () => {
  const { deps } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [tx()] });
  const anon = { isService: false, isSuperAdmin: false, isAccommodationAdmin: () => Promise.resolve(false) };
  const r = await handleTradeQuery(deps, { action: "status", mer_trade_no: "LL8Y46U8-P1", order_number: "LL8Y46U8" }, anon);
  assertEquals(r.body, { tx_status: "pending", payment_status: "pending_payment", order_status: "pending", amount_due: 12000, accommodation_id: ACC });
  assertEquals((await handleTradeQuery(deps, { action: "status", mer_trade_no: "LL8Y46U8-P1", order_number: "X" }, anon)).status, 404);
});

Deno.test("D1 list：只列該館的金額異常／pending／unknown；非該館管理員 403", async () => {
  const rows = [
    tx({ id: "a", mer_trade_no: "LL8Y46U8-P1", status: "paid", raw_response: { anomaly: "AMOUNT_MISMATCH expected=12000 got=1" } }),
    tx({ id: "b", mer_trade_no: "LL8Y46U8-P2", status: "failed" }),
    tx({ id: "c", mer_trade_no: "LL8Y46U8-P3", status: "unknown" }),
  ];
  const { deps } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: rows });
  const admin = { isService: false, isSuperAdmin: false, isAccommodationAdmin: (id: string) => Promise.resolve(id === ACC) };
  const r = await handleTradeQuery(deps, { action: "list", accommodation_id: ACC }, admin);
  // deno-lint-ignore no-explicit-any
  assertEquals((r.body.rows as any[]).map((x) => x.mer_trade_no).sort(), ["LL8Y46U8-P1", "LL8Y46U8-P3"]);
  assertEquals((await handleTradeQuery(deps, { action: "list", accommodation_id: "other" }, admin)).status, 403);
});

Deno.test("取消後入帳：交易 paid＋PAID_AFTER_CANCEL，訂單不復活、無付款成功副作用；通知＋告警；重送不重複", async () => {
  const { db, deps, fx } = setup({ accommodation_info: [acc()], orders: [order({ order_status: "cancelled" })], payment_transactions: [tx({ status: "expired" })] });
  await handleTradeNotify(deps, await parseNotify(await notifyReq(PAID), { config: cfg }));
  const t = db.rows("payment_transactions")[0];
  assertEquals([t.status, t.raw_response.anomaly, t.provider_trade_no], ["paid", "PAID_AFTER_CANCEL", "PN1"]);
  const o = db.rows("orders")[0];
  assertEquals([o.order_status, o.payment_status, o.paid_amount], ["cancelled", "pending_payment", 0]);
  assertEquals([fx.booking, fx.final, fx.kol, fx.push, db.rpcCalls.length], [0, 0, 0, 0, 0]);
  assertEquals(fx.alerts.length, 1);
  const n = db.rows("notifications");
  assertEquals(n.length, 1);
  assertEquals(n[0].description, "測試館A 訂單 LL8Y46U8 已逾時取消但 PAYUNi 回報付款成功 NT$12000，請人工處理（退款或恢復訂單）");
  db.rows("payuni_notify_events").length = 0;
  await handleTradeNotify(deps, await parseNotify(await notifyReq(PAID), { config: cfg }));
  assertEquals([fx.alerts.length, db.rows("notifications").length], [1, 1]);
});

Deno.test("取消後入帳且金額不符：以 PAID_AFTER_CANCEL 為主，告警註明金額不符", async () => {
  const { db, deps, fx } = setup({ accommodation_info: [acc()], orders: [order({ order_status: "cancelled" })], payment_transactions: [tx()] });
  await handleTradeNotify(deps, await parseNotify(await notifyReq({ ...PAID, TradeAmt: "1" }), { config: cfg }));
  const t = db.rows("payment_transactions")[0];
  assertEquals([t.status, t.raw_response.anomaly, t.raw_response.amount_mismatch], ["paid", "PAID_AFTER_CANCEL", "AMOUNT_MISMATCH expected=12000 got=1"]);
  assert(String(db.rows("notifications")[0].description).includes("金額不符：應付 NT$12000"));
  assertEquals([fx.alerts.length, fx.booking, db.rows("orders")[0].order_status], [1, 0, "cancelled"]);
});

Deno.test("PaymentAudit list 會列出取消後入帳的交易", async () => {
  const { deps } = setup({ accommodation_info: [acc()], orders: [order()], payment_transactions: [
    tx({ id: "a", status: "paid", raw_response: { anomaly: "PAID_AFTER_CANCEL" } }),
    tx({ id: "b", mer_trade_no: "LL8Y46U8-P2", status: "paid", raw_response: {} }),
  ] });
  const admin = { isService: false, isSuperAdmin: true, isAccommodationAdmin: () => Promise.resolve(false) };
  const r = await handleTradeQuery(deps, { action: "list", accommodation_id: ACC }, admin);
  // deno-lint-ignore no-explicit-any
  assertEquals((r.body.rows as any[]).map((x) => [x.mer_trade_no, x.anomaly]), [["LL8Y46U8-P1", "PAID_AFTER_CANCEL"]]);
});

Deno.test("sweep：超過 24 小時的 unknown 每筆只告警一次（stale_alerted），24 小時內不觸發", async () => {
  const at = (m: number) => new Date(NOW - m * 60_000).toISOString();
  const rows = [
    tx({ id: "old", mer_trade_no: "LL8Y46U8-P1", status: "unknown", created_at: at(25 * 60), raw_response: {} }),
    tx({ id: "new", mer_trade_no: "LL8Y46U8-P2", status: "unknown", created_at: at(60), raw_response: {} }),
  ];
  const { db, deps, fx } = setup({ accommodation_info: [acc()], orders: [order({ payment_status: "paid", paid_amount: 12000 })], payment_transactions: rows },
    { ok: true, status: "SUCCESS", data: { TradeStatus: "8" }, raw: {} });
  const r1 = await handleTradeQuery(deps, { action: "sweep" }, SVC);
  assertEquals(r1.body.staleAlerted, ["LL8Y46U8-P1"]);
  assertEquals(fx.alerts.length, 1);
  assert(fx.alerts[0].includes("LL8Y46U8-P1"));
  assertEquals(db.rows("payment_transactions").find((t) => t.id === "old")!.raw_response.stale_alerted, true);
  assertFalse(db.rows("payment_transactions").find((t) => t.id === "new")!.raw_response.stale_alerted);
  const r2 = await handleTradeQuery(deps, { action: "sweep" }, SVC);
  assertEquals([r2.body.staleAlerted, fx.alerts.length], [[], 1]);
});

Deno.test("sweep：stale 告警寄送失敗（throw 或回 false）→ 不標 stale_alerted，下輪重試", async () => {
  const at = (m: number) => new Date(NOW - m * 60_000).toISOString();
  const { db, deps } = setup({ accommodation_info: [acc()], orders: [order({ payment_status: "paid", paid_amount: 12000 })],
    payment_transactions: [tx({ status: "unknown", created_at: at(25 * 60), raw_response: {} })] });
  deps.sendAlert = () => Promise.reject(new Error("smtp down"));
  assertEquals((await handleTradeQuery(deps, { action: "sweep" }, SVC)).body.staleAlerted, []);
  deps.sendAlert = () => Promise.resolve(false);
  assertEquals((await handleTradeQuery(deps, { action: "sweep" }, SVC)).body.staleAlerted, []);
  assertFalse(db.rows("payment_transactions")[0].raw_response.stale_alerted);
  deps.sendAlert = () => Promise.resolve(true);
  assertEquals((await handleTradeQuery(deps, { action: "sweep" }, SVC)).body.staleAlerted, ["LL8Y46U8-P1"]);
});
