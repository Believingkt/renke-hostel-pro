// PAYUNi W4 ATM 測試：PAYUNi 回應全部 mock、記憶體 DB，不連網、不含真實金鑰。
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { encrypt, hashInfo, parseNotify, type PayuniCall, type PayuniConfig, type PayuniResult } from "./payuni.ts";
import { FakeDb } from "./payuniTestFakes.ts";
import { handleTradeNotify, handleTradeQuery, type PayuniTradeDeps } from "./payuniTradeHandlers.ts";
import { atmDeadlines, handleAtmCreate } from "./payuniAtm.ts";

const KEY = "12345678901234567890123456789012";
const IV = "1234567890123456";
const cfg: PayuniConfig = { env: "sandbox", baseUrl: "https://sandbox-api.payuni.com.tw", agentId: "TEST", hashKey: KEY, hashIv: IV, agentMerId: null };
const NOW = Date.parse("2026-11-01T02:00:00Z"); // 台北 10:00
const ACC = "11111111-1111-4111-8111-111111111111";
const ORD = "o-1";

const acc = (o: Record<string, unknown> = {}) => ({
  id: ACC, name: "測試館A", payment_provider_active: "payuni", payuni_mer_id: "TEST0001", payuni_mer_status: 1,
  payuni_payment_tools: { CREDIT: 1, ATM: 1 }, ...o,
});
const order = (o: Record<string, unknown> = {}) => ({
  id: ORD, order_number: "LL8Y46U8", accommodation_id: ACC, final_price: 12000, paid_amount: 0, payment_status: "pending_payment",
  order_status: "pending", guest_email: "g@example.com", payment_method: "atm_payuni", notes: null, discount_code: null,
  booking_deposit_amount: 3600, booking_deposit_percentage: 30, created_at: new Date(NOW - 60_000).toISOString(), ...o,
});
const atmTx = (o: Record<string, unknown> = {}) => ({
  id: "t-1", order_id: ORD, accommodation_id: ACC, provider: "payuni", mer_id: "TEST0001", mer_trade_no: "LL8Y46U8-D1", kind: "deposit",
  payment_type: 2, amount: 3600, status: "pending", created_at: new Date(NOW - 60_000).toISOString(),
  raw_response: { purpose: "deposit", BankType: "822", PayNo: "96880012345678", ExpireDate: "2026-11-01", expire_at: new Date(NOW + 19 * 60_000).toISOString() }, ...o,
});
const ATM_OK: PayuniResult = { ok: true, status: "SUCCESS", data: { TradeStatus: "0", TradeNo: "PN-ATM1", PayNo: "96880012345678", BankType: "822", ExpireDate: "2026-11-01" }, raw: {} };

function setup(tables: Record<string, any[]>, reply: PayuniResult = ATM_OK, bank: string | null = "822") {
  const db = new FakeDb(tables);
  const calls: PayuniCall[] = [];
  const fx = { booking: 0, final: 0, kol: 0, push: 0, created: 0, atm: [] as string[], alerts: [] as string[] };
  const deps: PayuniTradeDeps = {
    admin: db.client(), env: "sandbox", notifyBase: "https://x.supabase.co/functions/v1", now: () => NOW, atmBankType: bank,
    callPayuni: (c) => { calls.push(c); return Promise.resolve(reply); },
    sendAlert: (s) => { fx.alerts.push(s); return Promise.resolve(true); },
    effects: {
      sendBookingConfirmation: () => { fx.booking++; return Promise.resolve(); },
      sendFinalPaymentReceived: () => { fx.final++; return Promise.resolve(); },
      kolWebhook: () => { fx.kol++; return Promise.resolve(); },
      push: () => { fx.push++; return Promise.resolve(); },
      sendAtmPaymentReceived: (_id, amt, kind) => { fx.atm.push(`${kind}:${amt}`); return Promise.resolve(); },
      sendAtmCreated: () => { fx.created++; return Promise.resolve(); },
    },
  };
  return { db, deps, calls, fx };
}
const base = () => ({ accommodation_info: [acc()], orders: [order()] });

// ---------------- 取號 ----------------
Deno.test("取號：金額＝訂單訂金快照；payload 欄位正確、不帶發票；寫回 atm_* 與本地 20 分鐘期限；寄確認信", async () => {
  const { db, deps, calls, fx } = setup(base());
  const r = await handleAtmCreate(deps, { order_number: "LL8Y46U8", purpose: "deposit" });
  assertEquals(r.status, 200);
  assertEquals([r.body.amount, r.body.mer_trade_no, r.body.bank_code, r.body.bank_name, r.body.pay_no, r.body.balance_on_site],
    [3600, "LL8Y46U8-D1", "822", "中國信託商業銀行", "96880012345678", 8400]);
  const c = calls[0];
  assertEquals([c.path, c.version, c.kind], ["/api/atm", "1.3", "merchant"]);
  const p = c.payload;
  assertEquals([p.MerID, p.TradeAmt, p.BankType, p.PaySet, p.ExpireDate, p.UsrMail], ["TEST0001", 3600, "822", 1, "2026-11-01", "g@example.com"]);
  assertEquals([p.ProdDesc, p.NotifyURL], ["測試館A 訂房訂金 LL8Y46U8", "https://x.supabase.co/functions/v1/payuni-trade-notify"]);
  for (const k of ["CarrierType", "Coupon", "LgsType", "ReturnURL"]) assertFalse(k in p);
  const t = db.rows("payment_transactions")[0];
  assertEquals([t.kind, t.payment_type, t.amount, t.status, t.provider_trade_no], ["deposit", 2, 3600, "pending", "PN-ATM1"]);
  assertEquals([t.raw_response.BankType, t.raw_response.PayNo, t.raw_response.ExpireDate], ["822", "96880012345678", "2026-11-01"]);
  const o = db.rows("orders")[0];
  const expireAt = new Date(NOW + 20 * 60_000).toISOString();
  assertEquals([o.atm_vacc_no, o.atm_vacc_bank_code, o.atm_expire_at, r.body.expire_at], ["96880012345678", "822", expireAt, expireAt]);
  assertEquals(fx.created, 1);
});

Deno.test("ExpireDate：台北 23:39 取當天、23:40 起取隔天；補收 3 天到當日 23:59:59", () => {
  const at = (hhmm: string) => Date.parse(`2026-11-01T${hhmm}:00+08:00`);
  assertEquals(atmDeadlines("deposit", at("23:39")).expireDate, "2026-11-01");
  assertEquals(atmDeadlines("deposit", at("23:40")).expireDate, "2026-11-02");
  assertEquals(atmDeadlines("deposit", at("00:05")).expireDate, "2026-11-01");
  assertEquals(atmDeadlines("supplement", at("10:00")), { expireDate: "2026-11-04", expireAt: new Date("2026-11-04T23:59:59+08:00").toISOString() });
});

Deno.test("PAYUNI_ATM_BANK_TYPE 未設定或非 004／822／013 → 500「ATM 代收銀行未設定」，不呼叫 PAYUNi", async () => {
  for (const bank of [null, "999"]) {
    const { deps, calls } = setup(base(), ATM_OK, bank);
    const r = await handleAtmCreate(deps, { order_number: "LL8Y46U8", purpose: "deposit" });
    assertEquals([r.status, r.body.error, calls.length], [500, "ATM 代收銀行未設定", 0]);
  }
});

Deno.test("未開通 ATM → 400；訂金超過 30,000 → 400「金額超過 ATM 單筆上限，請改用信用卡」；已付訂金 → 409", async () => {
  const a = setup({ accommodation_info: [acc({ payuni_payment_tools: { CREDIT: 1 } })], orders: [order()] });
  assertEquals((await handleAtmCreate(a.deps, { order_number: "LL8Y46U8", purpose: "deposit" })).body.error, "此館尚未開通 ATM");
  const b = setup({ accommodation_info: [acc()], orders: [order({ final_price: 120000, booking_deposit_amount: 36000 })] });
  const rb = await handleAtmCreate(b.deps, { order_number: "LL8Y46U8", purpose: "deposit" });
  assertEquals([rb.status, rb.body.error, b.calls.length], [400, "金額超過 ATM 單筆上限，請改用信用卡", 0]);
  const c = setup({ accommodation_info: [acc()], orders: [order({ paid_amount: 3600, payment_status: "deposit_paid" })] });
  assertEquals((await handleAtmCreate(c.deps, { order_number: "LL8Y46U8", purpose: "deposit" })).status, 409);
});

Deno.test("訂金比例 100%：kind=full、ProdDesc「訂房款」、不顯示尾款", async () => {
  const { db, deps, calls } = setup({ accommodation_info: [acc()], orders: [order({ booking_deposit_amount: 12000, booking_deposit_percentage: 100 })] });
  const r = await handleAtmCreate(deps, { order_number: "LL8Y46U8", purpose: "deposit" });
  assertEquals([r.body.amount, r.body.balance_on_site, r.body.mer_trade_no], [12000, 0, "LL8Y46U8-D1"]);
  assertEquals([db.rows("payment_transactions")[0].kind, calls[0].payload.ProdDesc], ["full", "測試館A 訂房款 LL8Y46U8"]);
});

Deno.test("補收 -A{n}、尾款 -F{n}：金額＝final−paid", async () => {
  const s = setup({ accommodation_info: [acc()], orders: [order({ paid_amount: 3600, payment_status: "deposit_paid" })] });
  const r = await handleAtmCreate(s.deps, { order_number: "LL8Y46U8", purpose: "final" });
  assertEquals([r.body.mer_trade_no, r.body.amount, s.db.rows("payment_transactions")[0].kind], ["LL8Y46U8-F1", 8400, "final"]);
  const s2 = setup({ accommodation_info: [acc()], orders: [order({ paid_amount: 3600, payment_status: "deposit_paid" })] });
  assertEquals((await handleAtmCreate(s2.deps, { order_number: "LL8Y46U8", purpose: "supplement" })).body.mer_trade_no, "LL8Y46U8-A1");
});

Deno.test("已有有效虛擬帳號 → 回同一組不重複取號；逾期後再取 → -D2，舊交易改 expired", async () => {
  const a = setup({ ...base(), payment_transactions: [atmTx()] });
  const r = await handleAtmCreate(a.deps, { order_number: "LL8Y46U8", purpose: "deposit" });
  assertEquals([r.body.reused, r.body.mer_trade_no, r.body.pay_no, a.calls.length, a.fx.created], [true, "LL8Y46U8-D1", "96880012345678", 0, 0]);
  const b = setup({ ...base(), payment_transactions: [atmTx({ raw_response: { ...atmTx().raw_response, expire_at: new Date(NOW - 1000).toISOString() } })] });
  const r2 = await handleAtmCreate(b.deps, { order_number: "LL8Y46U8", purpose: "deposit" });
  assertEquals([r2.body.mer_trade_no, b.calls.length], ["LL8Y46U8-D2", 1]);
  assertEquals(b.db.rows("payment_transactions").map((t) => t.status), ["expired", "pending"]);
});

Deno.test("PAYUNi 取號失敗 → 交易 failed、Message 原樣回傳；UNKNOWN → unknown", async () => {
  const f = setup(base(), { ok: false, status: "ATM01", message: "銀行代碼錯誤", raw: {} });
  assertEquals((await handleAtmCreate(f.deps, { order_number: "LL8Y46U8", purpose: "deposit" })).body, { ok: false, message: "銀行代碼錯誤" });
  assertEquals([f.db.rows("payment_transactions")[0].status, f.db.rows("orders")[0].atm_vacc_no, f.fx.created], ["failed", undefined, 0]);
  const u = setup(base(), { ok: false, status: "UNKNOWN", raw: {} });
  await handleAtmCreate(u.deps, { order_number: "LL8Y46U8", purpose: "deposit" });
  assertEquals(u.db.rows("payment_transactions")[0].status, "unknown");
});

// ---------------- Notify ----------------
async function notifyReq(data: Record<string, string>, tamper = false) {
  const enc = await encrypt(data, KEY, IV);
  let hash = await hashInfo(enc, KEY, IV);
  if (tamper) hash = (hash[0] === "A" ? "B" : "A") + hash.slice(1);
  return new Request("https://x/payuni-trade-notify", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ MerID: "TEST0001", Version: "1.0", EncryptInfo: enc, HashInfo: hash }),
  });
}
const ATM_PAID = {
  MerID: "TEST0001", MerTradeNo: "LL8Y46U8-D1", TradeNo: "PN-ATM1", TradeAmt: "3600", TradeStatus: "1", PaymentType: "2",
  PayNo: "96880012345678", PayTime: "2026-11-01 10:10:00", Account5No: "8812345",
};
const notify = async (deps: PayuniTradeDeps, data: Record<string, string>, tamper = false) =>
  handleTradeNotify(deps, await parseNotify(await notifyReq(data, tamper), { config: cfg }));

Deno.test("ATM 入帳：訂單已付訂金（atm_payuni）、只寄訂金收據一次、不重寄確認信；存末五碼；重送不重複", async () => {
  const { db, deps, fx } = setup({ ...base(), orders: [order({ discount_code: "KOL1" })], payment_transactions: [atmTx()] });
  await notify(deps, ATM_PAID);
  const o = db.rows("orders")[0];
  assertEquals([o.payment_status, o.paid_amount, o.payment_method, o.order_status, o.balance_payment_method], ["deposit_paid", 3600, "atm_payuni", "confirmed", null]);
  const t = db.rows("payment_transactions")[0];
  assertEquals([t.status, t.raw_response.account5, t.raw_response.pay_time], ["paid", "12345", "2026-11-01 10:10:00"]);
  assertEquals([fx.atm, fx.booking, fx.final, fx.kol], [["deposit:3600"], 0, 0, 1]);
  const ev = db.rows("payuni_notify_events")[0];
  assertEquals([ev.notify_type, ev.execute_time, ev.processed, ev.process_error], ["atm_paid", "2026-11-01 10:10:00", true, null]);
  await notify(deps, ATM_PAID);
  db.rows("payuni_notify_events").length = 0;
  await notify(deps, ATM_PAID);
  assertEquals([fx.atm.length, db.rpcCalls.length], [1, 1]);
});

Deno.test("ATM 全額（100%）入帳 → paid、寄 auto_atm_final 收據", async () => {
  const { db, deps, fx } = setup({ ...base(), orders: [order({ booking_deposit_amount: 12000 })], payment_transactions: [atmTx({ kind: "full", amount: 12000 })] });
  await notify(deps, { ...ATM_PAID, TradeAmt: "12000" });
  assertEquals([db.rows("orders")[0].payment_status, db.rows("orders")[0].balance_payment_method, fx.atm], ["paid", "ATM 虛擬帳號轉帳(PAYUNi)", ["final:12000"]]);
});

Deno.test("ATM 錯帳（NewMerTradeNo）／金額不符 → 交易與訂單不動、記異常＋告警一次、process_error=ATM_MISMATCH", async () => {
  for (const extra of [{ NewMerTradeNo: "LL8Y46U8-D1-1" }, { TradeAmt: "3000" }] as Record<string, string>[]) {
    const { db, deps, fx } = setup({ ...base(), payment_transactions: [atmTx()] });
    await notify(deps, { ...ATM_PAID, ...extra });
    const t = db.rows("payment_transactions")[0];
    assertEquals(t.status, "pending");
    assert(String(t.raw_response.anomaly).startsWith("ATM_MISMATCH"));
    assertEquals([db.rows("orders")[0].payment_status, db.rows("orders")[0].paid_amount, fx.atm.length, db.rpcCalls.length], ["pending_payment", 0, 0, 0]);
    assertEquals([fx.alerts.length, db.rows("notifications").length], [1, 1]);
    const ev = db.rows("payuni_notify_events")[0];
    assertEquals([ev.processed, ev.process_error], [true, "ATM_MISMATCH"]);
    db.rows("payuni_notify_events").length = 0;
    await notify(deps, { ...ATM_PAID, ...extra });
    assertEquals(fx.alerts.length, 1);
  }
});

Deno.test("ATM NewMerTradeNo 為 \"-\"／空字串／空白／等於本筆 MerTradeNo → 不算錯帳，正常入帳、訂單確認", async () => {
  for (const n of ["-", "", "  ", " - ", "LL8Y46U8-D1"]) {
    const { db, deps, fx } = setup({ ...base(), orders: [order()], payment_transactions: [atmTx()] });
    await notify(deps, { ...ATM_PAID, NewMerTradeNo: n, PayBank: "812", Account5No: "54321" });
    const t = db.rows("payment_transactions")[0];
    assertEquals([t.status, t.raw_response.anomaly ?? null, t.raw_response.account5], ["paid", null, "54321"], `NewMerTradeNo=${JSON.stringify(n)}`);
    const o = db.rows("orders")[0];
    assertEquals([o.payment_status, o.paid_amount, o.order_status], ["deposit_paid", 3600, "confirmed"]);
    assertEquals([fx.alerts.length, fx.atm], [0, ["deposit:3600"]]);
    const ev = db.rows("payuni_notify_events")[0];
    assertEquals([ev.processed, ev.process_error], [true, null]);
  }
});

Deno.test("trade-query（query／sweep／reconcile 共用 applyPayuniTradeResult）：NewMerTradeNo=\"-\" 正常入帳；真的另一編號仍判錯帳", async () => {
  const { applyPayuniTradeResult, isAtmMisTransfer } = await import("./payuniTrade.ts");
  const tx = { mer_trade_no: "LL8Y46U8-D1" };
  assertEquals([isAtmMisTransfer({ NewMerTradeNo: "-" }, tx), isAtmMisTransfer({}, tx), isAtmMisTransfer({ NewMerTradeNo: "LL8Y46U8-D1-1" }, tx)], [false, false, true]);
  const { db, deps } = setup({ ...base(), orders: [order()], payment_transactions: [atmTx()] });
  const r = await applyPayuniTradeResult(deps, db.rows("payment_transactions")[0] as any, { ...ATM_PAID, NewMerTradeNo: "-", Status: "SUCCESS" });
  assertEquals([r.status, r.error ?? null, db.rows("orders")[0].payment_status], ["paid", null, "deposit_paid"]);
});

Deno.test("付款期限到期通知（TradeStatus=4）→ 交易 expired、訂單不取消", async () => {
  const { db, deps } = setup({ ...base(), payment_transactions: [atmTx()] });
  await notify(deps, { MerID: "TEST0001", MerTradeNo: "LL8Y46U8-D1", TradeNo: "PN-ATM1", TradeStatus: "4", PayNo: "96880012345678" });
  assertEquals([db.rows("payment_transactions")[0].status, db.rows("orders")[0].order_status], ["expired", "pending"]);
  assertEquals(db.rows("payuni_notify_events")[0].notify_type, "expired");
});

Deno.test("ATM Notify 竄改 HashInfo → 不改資料", async () => {
  const { db, deps, fx } = setup({ ...base(), payment_transactions: [atmTx()] });
  await notify(deps, ATM_PAID, true);
  assertEquals([db.rows("payment_transactions")[0].status, db.rows("orders")[0].payment_status, fx.atm.length], ["pending", "pending_payment", 0]);
});

Deno.test("訂單已逾期取消後才 ATM 入帳 → PAID_AFTER_CANCEL，訂單不復活", async () => {
  const { db, deps, fx } = setup({ ...base(), orders: [order({ order_status: "cancelled" })], payment_transactions: [atmTx({ status: "expired" })] });
  await notify(deps, ATM_PAID);
  assertEquals([db.rows("payment_transactions")[0].raw_response.anomaly, db.rows("orders")[0].order_status, fx.atm.length, fx.alerts.length],
    ["PAID_AFTER_CANCEL", "cancelled", 0, 1]);
});

Deno.test("稽核 list：ATM 交易列出虛擬帳號（遮中間）、截止、付款時間、末五碼", async () => {
  const { deps } = setup({ ...base(), payment_transactions: [atmTx({ status: "paid", notified_at: "2026-11-01T02:10:00Z", raw_response: { ...atmTx().raw_response, account5: "12345" } })] });
  const admin = { isService: false, isSuperAdmin: true, isAccommodationAdmin: () => Promise.resolve(false) };
  const r = await handleTradeQuery(deps, { action: "list", accommodation_id: ACC }, admin);
  const row = (r.body.rows as any[])[0];
  assertEquals(row.atm, { pay_no: "9688******5678", bank_type: "822", expire_at: atmTx().raw_response.expire_at, paid_at: "2026-11-01T02:10:00Z", account5: "12345" });
});

Deno.test("cancel-expired-atm-orders：未改動；條件只看 atm_vacc_no／atm_expire_at／pending_payment，不限 payment_method → PAYUNi ATM 單適用", () => {
  const src = Deno.readTextFileSync(new URL("../cancel-expired-atm-orders/index.ts", import.meta.url));
  for (const s of [".eq('payment_status', 'pending_payment')", ".not('atm_vacc_no', 'is', null)", ".lt('atm_expire_at', cutoffIso)"]) assert(src.includes(s), s);
  assertFalse(/payment_method/.test(src));
});

// ---------------- sweep：無虛擬帳號的 ATM 待付款單 ----------------
const SVC = { isService: true, isSuperAdmin: false, isAccommodationAdmin: () => Promise.resolve(false) };
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString();
const UNPAID: PayuniResult = { ok: true, status: "SUCCESS", data: { TradeStatus: "0" }, raw: {} };

Deno.test("sweep：無虛擬帳號的 ATM 單（取號失敗／未取號）30 分鐘後取消；未滿 30 分鐘不取消", async () => {
  const failed = setup({ ...base(), orders: [order({ created_at: ago(40) })], payment_transactions: [atmTx({ status: "failed", created_at: ago(40), raw_response: {} })] }, UNPAID);
  assertEquals((await handleTradeQuery(failed.deps, { action: "sweep" }, SVC)).body.cancelled, ["LL8Y46U8"]);
  const call = failed.db.rpcCalls.find((c) => c.name === "update_order_with_context")!;
  assertEquals([call.args.p_source, call.args.p_patch.order_status], ["payuni_payment_timeout", "cancelled"]);
  const none = setup({ ...base(), orders: [order({ created_at: ago(40) })] }, UNPAID);
  assertEquals((await handleTradeQuery(none.deps, { action: "sweep" }, SVC)).body.cancelled, ["LL8Y46U8"]);
  const fresh = setup({ ...base(), orders: [order({ created_at: ago(10) })] }, UNPAID);
  assertEquals((await handleTradeQuery(fresh.deps, { action: "sweep" }, SVC)).body.cancelled, []);
});

Deno.test("sweep：已有虛擬帳號的 ATM 單不碰（交給 cancel-expired-atm-orders）", async () => {
  const { db, deps } = setup({
    ...base(), orders: [order({ created_at: ago(40), atm_vacc_no: "96880012345678", atm_expire_at: ago(20) })],
    payment_transactions: [atmTx({ created_at: ago(40), raw_response: { ...atmTx().raw_response, expire_at: ago(20) } })],
  }, UNPAID);
  assertEquals((await handleTradeQuery(deps, { action: "sweep" }, SVC)).body.cancelled, []);
  assertEquals([db.rows("orders")[0].order_status, db.rpcCalls.length, db.rows("payment_transactions")[0].status], ["pending", 0, "pending"]);
});

Deno.test("sweep：ATM 取號 unknown → 取消前先補查；仍 unknown 或查詢失敗就不取消", async () => {
  const old = ago(25 * 60);
  const rows = () => ({ ...base(), orders: [order({ created_at: old })], payment_transactions: [atmTx({ status: "unknown", created_at: old, raw_response: { purpose: "deposit" } })] });
  const still = setup(rows(), UNPAID);
  assertEquals((await handleTradeQuery(still.deps, { action: "sweep" }, SVC)).body.cancelled, []);
  assertEquals(still.calls.filter((c) => c.path === "/api/trade/query").map((c) => c.payload.MerTradeNo), ["LL8Y46U8-D1"]);
  const fail = setup(rows(), { ok: false, status: "ERROR", raw: {} });
  assertEquals((await handleTradeQuery(fail.deps, { action: "sweep" }, SVC)).body.cancelled, []);
  assertEquals(fail.db.rpcCalls.length, 0);
});

Deno.test("sweep：無虛擬帳號 ATM 單若有 paid 交易不取消", async () => {
  const { deps } = setup({ ...base(), orders: [order({ created_at: ago(40) })], payment_transactions: [atmTx({ status: "paid", created_at: ago(40) })] }, UNPAID);
  assertEquals((await handleTradeQuery(deps, { action: "sweep" }, SVC)).body.cancelled, []);
});
