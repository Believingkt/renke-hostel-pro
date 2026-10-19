// PAYUNi W6 對帳測試：PAYUNi 回應全部 mock、記憶體 DB，不連網、不含真實金鑰。
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { PayuniCall, PayuniResult } from "./payuni.ts";
import { FakeDb } from "./payuniTestFakes.ts";
import type { PayuniTradeDeps } from "./payuniTradeHandlers.ts";
import { classifyTrade, compareRefunds, handleReconcile, previousTaipeiDay, type ReconcileCaller } from "./payuniReconcile.ts";

// 台北 2026-11-02 03:30
const NOW = Date.parse("2026-11-01T19:30:00Z");
const IN_DAY = "2026-11-01T02:00:00Z"; // 台北 11/01 10:00
const OLD = "2026-10-20T02:00:00Z";
const ACC = "11111111-1111-4111-8111-111111111111";
const ORD = "22222222-2222-4222-8222-222222222222";

const order = (o: Record<string, unknown> = {}) => ({
  id: ORD, order_number: "LL8Y46U8", accommodation_id: ACC, final_price: 6000, paid_amount: 6000, payment_status: "paid",
  order_status: "confirmed", guest_email: "g@example.com", payment_method: "credit_card_payuni", notes: null, discount_code: null, ...o,
});
const tx = (o: Record<string, unknown> = {}) => ({
  id: "t-1", order_id: ORD, accommodation_id: ACC, provider: "payuni", mer_id: "TEST0001", mer_trade_no: "LL8Y46U8-P1",
  provider_trade_no: "UNI-1", kind: "full", payment_type: 1, amount: 6000, status: "paid", raw_response: {},
  created_at: IN_DAY, updated_at: IN_DAY, notified_at: IN_DAY, ...o,
});
const refund = (o: Record<string, unknown>) => tx({ kind: "refund", parent_tx_id: "t-1", status: "paid", ...o });
const service: ReconcileCaller = { isService: true, isSuperAdmin: false, label: "system", isAccommodationAdmin: () => Promise.resolve(false) };
const hq: ReconcileCaller = { isService: false, isSuperAdmin: true, label: "hq@x", isAccommodationAdmin: () => Promise.resolve(true) };

function setup(tables: Record<string, any[]>, query: Record<string, Record<string, string> | null>) {
  const db = new FakeDb({ accommodation_info: [{ id: ACC, name: "測試館A" }], orders: [order()], ...tables });
  const calls: PayuniCall[] = [];
  const fx = { alerts: [] as Array<{ s: string; h: string }>, booking: 0 };
  const deps: PayuniTradeDeps = {
    admin: db.client(), env: "sandbox", notifyBase: "https://x/functions/v1", now: () => NOW,
    callPayuni: (c) => {
      calls.push(c);
      const key = String(c.payload.MerTradeNo ?? c.payload.TradeNo);
      const q = query[key];
      return Promise.resolve<PayuniResult>(q === undefined ? { ok: false, status: "TIMEOUT", raw: null } : q === null
        ? { ok: true, status: "SUCCESS", data: {}, raw: {} }
        : { ok: true, status: "SUCCESS", data: { TradeStatus: "1", DataSource: "A", ...q }, raw: {} });
    },
    sendAlert: (s, h) => { fx.alerts.push({ s, h }); return Promise.resolve(true); },
    effects: {
      sendBookingConfirmation: () => { fx.booking++; return Promise.resolve(); },
      sendFinalPaymentReceived: () => Promise.resolve(), kolWebhook: () => Promise.resolve(), push: () => Promise.resolve(),
      sendAtmPaymentReceived: () => Promise.resolve(), sendAtmCreated: () => Promise.resolve(),
    },
  };
  const run = (opts = {}) => handleReconcile(deps, { action: "run" }, service, opts);
  return { db, deps, calls, fx, run };
}
const diffs = (db: FakeDb) => db.rows("payuni_reconcile_diffs");
const runRow = (db: FakeDb) => db.rows("payuni_reconcile_runs")[0];

Deno.test("日期：台北 11/02 03:30 對帳 → run_date 2026-11-01、區間為台北 11/01 整天", () => {
  assertEquals(previousTaipeiDay(NOW), { runDate: "2026-11-01", startIso: "2026-10-31T16:00:00.000Z", endIso: "2026-11-01T16:00:00.000Z" });
});

Deno.test("一致 → 回填 TradeFee（DataSource=A 才回填）；DataSource=B → 記處理中不判定、不回填", async () => {
  let s = setup({ payment_transactions: [tx()] }, { "LL8Y46U8-P1": { TradeAmt: "6000", TradeFee: "168", RemainAmt: "6000" } });
  const r = await s.run();
  assertEquals([r.body.matched, r.body.completed], [1, true]);
  assertEquals(s.db.rows("payment_transactions")[0].provider_fee, 168);
  assertEquals(diffs(s.db).length, 0);
  assertEquals(s.fx.alerts.length, 0);
  s = setup({ payment_transactions: [tx()] }, { "LL8Y46U8-P1": { TradeAmt: "6000", TradeFee: "168", DataSource: "B" } });
  const b = await s.run();
  assertEquals([b.body.processing, b.body.matched], [1, 0]);
  assertEquals(s.db.rows("payment_transactions")[0].provider_fee, undefined);
  assertEquals(runRow(s.db).checked_tx_ids, ["t-1"]);
});

Deno.test("PAYUNi 已付、本地未付 → applyPayuniTradeResult 自動補入帳一次＋status_fixed（已處理）；彙總信附「自動補入帳 N 筆」", async () => {
  const s = setup({
    orders: [order({ paid_amount: 0, payment_status: "pending_payment", order_status: "pending" })],
    payment_transactions: [tx({ status: "pending", created_at: OLD, updated_at: OLD }), tx({ id: "t-9", mer_trade_no: "XX-P1", order_id: "o-x", amount: 500 })],
  }, { "LL8Y46U8-P1": { TradeAmt: "6000", TradeNo: "UNI-1" }, "XX-P1": { TradeAmt: "400" } });
  const r = await s.run();
  assertEquals(r.body.status_fixed, 1);
  assertEquals(s.db.rows("payment_transactions")[0].status, "paid");
  assertEquals(s.db.rows("orders")[0].payment_status, "paid");
  assertEquals(s.fx.booking, 1);
  const fixed = diffs(s.db).find((d) => d.diff_type === "status_fixed")!;
  assertEquals([fixed.resolved_by, !!fixed.resolved_at], ["system", true]);
  // XX-P1 金額不符 → 彙總信只列未解決差異，最後附自動補入帳行
  assertEquals(s.fx.alerts.length, 1);
  assert(s.fx.alerts[0].h.includes("金額不符"));
  assertFalse(s.fx.alerts[0].h.includes("已自動補入帳"));
  assert(s.fx.alerts[0].h.includes("自動補入帳 1 筆"));
  // 已 paid 不會再補一次（applyPayuniTradeResult 冪等）
  await handleReconcile(s.deps, { action: "run" }, service);
  assertEquals(s.fx.booking, 1);
});

Deno.test("金額不符、查無、本地已付 PAYUNi 未付 → 進差異清單、不改訂單與交易", async () => {
  const s = setup({
    payment_transactions: [tx(), tx({ id: "t-2", mer_trade_no: "LL8Y46U8-A1", provider_trade_no: "UNI-2", amount: 1000 }), tx({ id: "t-3", mer_trade_no: "LL8Y46U8-A2", amount: 800 })],
  }, { "LL8Y46U8-P1": { TradeAmt: "5000" }, "LL8Y46U8-A1": null, "LL8Y46U8-A2": { TradeStatus: "0", TradeAmt: "800" } });
  const before = JSON.stringify([s.db.rows("orders"), s.db.rows("payment_transactions")]);
  await s.run();
  assertEquals(diffs(s.db).map((d) => [d.mer_trade_no, d.diff_type]).sort(),
    [["LL8Y46U8-A1", "not_found"], ["LL8Y46U8-A2", "local_paid_remote_unpaid"], ["LL8Y46U8-P1", "amount_mismatch"]]);
  assertEquals(JSON.stringify([s.db.rows("orders"), s.db.rows("payment_transactions")]), before);
  assertEquals(diffs(s.db).find((d) => d.diff_type === "amount_mismatch")!.payuni_value.TradeAmt, 5000);
  assertEquals(runRow(s.db).diff_counts, { amount_mismatch: 1, not_found: 1, local_paid_remote_unpaid: 1 });
  assert(s.fx.alerts[0].h.includes("測試館A") && s.fx.alerts[0].h.includes("LL8Y46U8"));
});

Deno.test("重跑：同一 mer_trade_no＋類型未解決時只更新不新增；標記已處理後再出現才新增", async () => {
  const tables = { payment_transactions: [tx()] };
  const s = setup(tables, { "LL8Y46U8-P1": { TradeAmt: "5000" } });
  await s.run();
  // 次日（新 run）再出現
  s.deps.now = () => NOW + 86_400_000;
  s.db.rows("payment_transactions")[0].updated_at = "2026-11-02T02:00:00Z";
  await s.run();
  assertEquals(diffs(s.db).length, 1);
  assertEquals(s.db.rows("payuni_reconcile_runs").length, 2);
  assertEquals(diffs(s.db)[0].run_id, s.db.rows("payuni_reconcile_runs")[1].id);
  const id = diffs(s.db)[0].id;
  assertEquals((await handleReconcile(s.deps, { action: "resolve", diff_id: id, note: "" }, hq)).status, 400);
  assertEquals((await handleReconcile(s.deps, { action: "resolve", diff_id: id, note: "已與 PAYUNi 確認" }, hq)).status, 200);
  assertEquals(diffs(s.db)[0].resolved_by, "hq@x");
  s.deps.now = () => NOW + 2 * 86_400_000;
  s.db.rows("payment_transactions")[0].updated_at = "2026-11-03T02:00:00Z";
  await s.run();
  assertEquals(diffs(s.db).length, 2);
});

Deno.test("接續：單次上限停下 → run 記未查完；下一次排程沿用同一筆 run、跳過已查過的交易；查完後不再重跑", async () => {
  const s = setup({ payment_transactions: [tx(), tx({ id: "t-2", mer_trade_no: "LL8Y46U8-A1", created_at: "2026-11-01T03:00:00Z" })] },
    { "LL8Y46U8-P1": { TradeAmt: "6000" }, "LL8Y46U8-A1": { TradeAmt: "6000" } });
  const a = await s.run({ maxQueries: 1 });
  assertEquals([a.body.completed, a.body.remaining], [false, 1]);
  assert(String(runRow(s.db).note).startsWith("未查完"));
  const b = await s.run({ maxQueries: 1 });
  assertEquals([b.body.completed, b.body.queried], [true, 1]);
  assertEquals(s.calls.map((c) => c.payload.MerTradeNo), ["LL8Y46U8-P1", "LL8Y46U8-A1"]);
  assertEquals(s.db.rows("payuni_reconcile_runs").length, 1);
  assertEquals([runRow(s.db).queried, runRow(s.db).matched, runRow(s.db).invocations], [2, 2, 2]);
  const c = await s.run();
  assertEquals(c.body.skipped, "already_completed");
  // 時間預算
  const t = setup({ payment_transactions: [tx()] }, { "LL8Y46U8-P1": { TradeAmt: "6000" } });
  const r = await t.run({ budgetMs: 100_000, clock: (() => { let n = 0; return () => (n++ === 0 ? 0 : 100_001); })() });
  assertEquals([r.body.completed, t.calls.length], [false, 0]);
  assert(String(runRow(t.db).note).includes("100 秒"));
});

Deno.test("權限：run 非 service role → 403；list／resolve 非 super_admin → 403；fees 只回自己館", async () => {
  const s = setup({ payment_transactions: [tx({ provider_fee: 168 }), refund({ id: "r-1", mer_trade_no: "LL8Y46U8-P1-R1", amount: 1000 })],
    orders: [order(), order({ id: "33333333-3333-4333-8333-333333333333", accommodation_id: "other" })] }, {});
  const staff: ReconcileCaller = { isService: false, isSuperAdmin: false, label: "a", isAccommodationAdmin: (id) => Promise.resolve(id === ACC) };
  assertEquals((await handleReconcile(s.deps, { action: "run" }, staff)).status, 403);
  assertEquals((await handleReconcile(s.deps, {}, staff)).status, 403);
  assertEquals((await handleReconcile(s.deps, { action: "list" }, staff)).status, 403);
  assertEquals((await handleReconcile(s.deps, { action: "resolve", diff_id: ACC, note: "xx" }, staff)).status, 403);
  const f = await handleReconcile(s.deps, { action: "fees", order_ids: [ORD, "33333333-3333-4333-8333-333333333333"] }, staff);
  assertEquals(f.body.fees, { [ORD]: { collected: 6000, refunded: 1000, fee: 168 } });
  assertEquals(s.calls.length, 0);
});

Deno.test("退款：兩筆部分退款用 TradeAmt − RemainAmt 對已完成加總，不誤報；不一致與狀態不符（本地處理中、PAYUNi 退款取消）→ refund_mismatch", async () => {
  const two = [refund({ id: "r-1", mer_trade_no: "LL8Y46U8-P1-R1", amount: 1000, created_at: OLD, updated_at: OLD }),
    refund({ id: "r-2", mer_trade_no: "LL8Y46U8-P1-R2", amount: 500, created_at: IN_DAY })];
  // 信用卡只回最後一筆（RefundAmt=500），但 TradeAmt − RemainAmt = 1500 = 本地加總 → 一致
  let s = setup({ payment_transactions: [tx({ created_at: OLD, updated_at: OLD }), ...two] },
    { "UNI-1": { TradeAmt: "6000", RemainAmt: "4500", RefundStatus: "2", RefundAmt: "500" } });
  let r = await s.run();
  assertEquals([r.body.matched, diffs(s.db).length], [1, 0]);
  assertEquals(s.calls[0].payload.TradeNo, "UNI-1");
  assertFalse("MerTradeNo" in s.calls[0].payload);
  assertEquals(runRow(s.db).checked_tx_ids.sort(), ["r-2", "t-1"]);
  // 金額不符
  s = setup({ payment_transactions: [tx(), ...two] }, { "LL8Y46U8-P1": { TradeAmt: "6000", RemainAmt: "5000", RefundStatus: "2" } });
  await s.run();
  const d = diffs(s.db)[0];
  assertEquals([d.diff_type, d.local_value.refunded, d.payuni_value.RemainAmt], ["refund_mismatch", 1500, 5000]);
  // 本地處理中、PAYUNi 已退款取消（信用卡 3）→ 狀態不符，狀態碼記進 PAYUNi 值
  s = setup({ payment_transactions: [tx(), refund({ id: "r-3", mer_trade_no: "LL8Y46U8-P1-R1", amount: 1000, status: "pending" })] },
    { "LL8Y46U8-P1": { TradeAmt: "6000", RemainAmt: "6000", RefundStatus: "3" } });
  await s.run();
  assertEquals([diffs(s.db)[0].diff_type, diffs(s.db)[0].payuni_value.RefundStatus, diffs(s.db)[0].local_value.latest_pending_status], ["refund_mismatch", "3", "pending"]);
});

Deno.test("退款比對純規則：PAYUNi 已退但本地仍處理中（W7 sweep 尚未判定）不報；ATM 2=轉匯失敗 / 3=轉匯取消且本地處理中 → 報", () => {
  const t = tx();
  const pend = [refund({ amount: 1000, status: "pending" })];
  assertEquals(compareRefunds(t, { TradeAmt: "6000", RemainAmt: "5000", RefundStatus: "2" }, pend), null);
  assert(compareRefunds(t, { TradeAmt: "6000", RemainAmt: "4000" }, pend));
  const atm = tx({ payment_type: 2 });
  assert(compareRefunds(atm, { TradeAmt: "6000", RemainAmt: "6000", RefundStatus: "2" }, pend));
  assert(compareRefunds(atm, { TradeAmt: "6000", RemainAmt: "6000", RefundStatus: "3" }, pend));
  assertEquals(compareRefunds(atm, { TradeAmt: "6000", RemainAmt: "6000", RefundStatus: "9" }, pend), null);
  assertEquals(classifyTrade(tx({ status: "pending" }), { TradeStatus: "0" }, []).kind, "matched");
});
