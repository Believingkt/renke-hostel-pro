// PAYUNi W9 平台費測試：PAYUNi 回應全部 mock、記憶體 DB，不連網、不含真實金鑰。
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeGuestCountRows, computeGuestCountTotals, computeOwnerSettlementRows, pricingRuleFromRow,
} from "../../../packages/shared/src/lib/ownerSettlement.ts";
import { filterByGroupBuyMode } from "../../../packages/shared/src/lib/groupBuyCaliber.ts";
import type { PayuniCall, PayuniResult } from "./payuni.ts";
import { FakeDb } from "./payuniTestFakes.ts";
import { computeMonthlyPlatformFee, configFromSetting, monthOf } from "./payuniPlatformFeeCalc.ts";
import { type FeeCaller, handlePlatformFee, NO_AGENT_MER_ID, type PlatformFeeDeps, tradeNoFor } from "./payuniPlatformFee.ts";

// 台北 2026-12-05 10:00
const NOW = Date.parse("2026-12-05T02:00:00Z");
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const Bk = "aaaaaaaa-0000-4000-8000-000000000002";
const C = "aaaaaaaa-0000-4000-8000-000000000003";
const hq: FeeCaller = { isService: false, isSuperAdmin: true, userId: "u-hq", label: "hq@x", canReadAcc: () => Promise.resolve(true) };
const owner = (acc: string): FeeCaller => ({ isService: false, isSuperAdmin: false, userId: "u-o", label: "o@x", canReadAcc: (id) => Promise.resolve(id === acc) });
const service: FeeCaller = { isService: true, isSuperAdmin: false, userId: null, label: "system", canReadAcc: () => Promise.resolve(false) };

const ord = (id: string, acc: string, ci: string, co: string, final: number, o: Record<string, unknown> = {}) => ({
  id, accommodation_id: acc, order_number: id.toUpperCase(), check_in_date: ci, check_out_date: co, total_price: final, discount_amount: 0,
  final_price: final, order_status: "confirmed", order_source: "direct", owner_direct: false, room_type_id: null, guest_count: 2,
  custom_addon_details: [], exchange_rate_snapshot: null, currency_at_booking: null, order_date: "2026-10-01", paid_amount: final, ...o,
});
const ORDERS = [
  ord("a1", A, "2026-11-10", "2026-11-12", 10000, { custom_addon_details: [{ addon_id: "ad-clean", total: 1000 }] }),
  ord("a2", A, "2026-10-30", "2026-11-02", 9000),
  ord("a3", A, "2026-11-20", "2026-11-21", 5000, { order_source: "owner" }),
  ord("a4", A, "2026-11-15", "2026-11-16", 4000),
  ord("a5", A, "2026-11-25", "2026-11-26", 6000, { order_source: "group_buy" }),
  ord("a6", A, "2026-11-05", "2026-11-06", 3000, { paid_amount: 4000 }),
  ord("a7", A, "2026-11-08", "2026-11-09", 7000, { order_status: "cancelled" }),
  ord("b0", Bk, "2026-10-10", "2026-10-11", 5000, { room_type_id: "rt-b" }),
  ord("b1", Bk, "2026-11-03", "2026-11-04", 8000, { room_type_id: "rt-b" }),
  ord("c1", C, "2026-11-03", "2026-11-04", 8000),
];
const tx = (order_id: string, provider: string, amount: number, kind = "full", status = "paid", created_at = "2026-11-01T00:00:00Z") =>
  ({ order_id, accommodation_id: ORDERS.find((o) => o.id === order_id)!.accommodation_id, provider, kind, status, amount, created_at, mer_trade_no: `${order_id}-${kind}` });
const RULE_A = { accommodation_id: A, commission_rate: 0.15, commission_threshold: 0, effective_from: "2026-01-01", created_at: "2026-01-01", exempt_order_sources: ["owner"], commission_excluded_addon_ids: ["ad-clean"], revenue_breakdown_type: "standard", marketing_fee_threshold: 0 };
const RULE_B = { accommodation_id: Bk, commission_rate: 0.1, commission_threshold: 0, effective_from: "2026-01-01", created_at: "2026-01-01", exempt_order_sources: [], revenue_breakdown_type: "guestcount", marketing_fee_threshold: 0 };

function setup(feeResp: Record<string, PayuniResult> = {}, queryResp: Record<string, PayuniResult> = {}, agentMerId: string | null = "LKZ_AGENT") {
  const db = new FakeDb({
    accommodation_info: [
      { id: A, name: "A館", payuni_mer_id: "M_A" }, { id: Bk, name: "B館", payuni_mer_id: "M_B" },
      { id: C, name: "C館", payuni_mer_id: "M_C" }, { id: "x", name: "未綁", payuni_mer_id: null },
    ],
    orders: ORDERS,
    payment_transactions: [
      tx("a1", "payuni", 10000), tx("a2", "payuni", 9000), tx("a3", "payuni", 5000), tx("a4", "tappay", 4000), tx("a5", "payuni", 6000),
      tx("a6", "payuni", 3000), tx("b0", "payuni", 5000), tx("b1", "payuni", 8000), tx("c1", "tappay", 8000),
      tx("a1", "payuni", 2000, "refund", "paid", "2026-11-20T05:00:00Z"), tx("a2", "payuni", 500, "refund", "paid", "2026-12-01T05:00:00Z"),
    ],
    room_types: [{ id: "rt-b", accommodation_id: Bk, capacity: 4 }],
    order_meta: [],
    system_settings: [],
    owner_settlement_pricing_rules: [RULE_A, RULE_B],
    payuni_platform_fee_batches: [], payuni_platform_fee_items: [],
  });
  const calls: PayuniCall[] = [];
  const alerts: string[] = [];
  const deps: PlatformFeeDeps = {
    admin: db.client(), env: "sandbox", notifyBase: "https://x/functions/v1", now: () => NOW, agentMerId, effects: {} as any,
    callPayuni: (c) => {
      calls.push(c);
      const map = c.path.endsWith("agent_fee_query") ? queryResp : feeResp;
      return Promise.resolve(map[String(c.payload.MerID)] ?? { ok: true, status: "SUCCESS", data: {}, raw: {} });
    },
    sendAlert: (s) => { alerts.push(s); return Promise.resolve(true); },
  };
  const run = (body: any, caller = hq) => handlePlatformFee(deps, body, caller);
  return { db, deps, calls, alerts, run };
}
const items = (db: FakeDb) => db.rows("payuni_platform_fee_items");
const itemOf = (db: FakeDb, acc: string, bal = 1) => items(db).find((i) => i.accommodation_id === acc && i.bal_type === bal)!;

/** 月結頁（OwnerSettlement.tsx 第 323–384 行）的平台費：standard 取 totals.totalCommission；guestcount 取 gcTotals.totalPlatformFee */
function pageFee(orders: any[], rule: any, capMap: Record<string, number> = {}) {
  const month = monthOf("2026-11");
  const config = configFromSetting(null);
  const scoped = filterByGroupBuyMode(orders.filter((o) => o.order_status !== "cancelled"), "exclude");
  if (rule.revenue_breakdown_type === "guestcount") {
    return computeGuestCountTotals(computeGuestCountRows(scoped, config, month, null, rule, capMap, "nightly")).totalPlatformFee;
  }
  return computeOwnerSettlementRows(scoped, config, month, null, rule, "nightly").reduce((s, r) => s + r.commission, 0);
}

Deno.test("1. 同一組訂單：W9 計算＝月結頁平台費（standard 與 guestcount）；手算核對", () => {
  const ruleA = pricingRuleFromRow(RULE_A, configFromSetting(null));
  const ruleB = pricingRuleFromRow(RULE_B, configFromSetting(null));
  const aOrders = ORDERS.filter((o) => o.accommodation_id === A && o.order_status !== "cancelled");
  const w9A = computeMonthlyPlatformFee(aOrders, configFromSetting(null), ruleA, monthOf("2026-11"), {});
  assertEquals(w9A.total, pageFee(aOrders, ruleA));
  // a1 (10000−1000)×15%=1350；a2 3 晚中 11 月 1 晚 3000×15%=450；a3 免抽成 0；a4 600；a6 450；a5 團購不併入
  assertEquals(Math.round(w9A.total), 2850);
  const bOrders = ORDERS.filter((o) => o.accommodation_id === Bk);
  const w9B = computeMonthlyPlatformFee(bOrders, configFromSetting(null), ruleB, monthOf("2026-11"), { "rt-b": 4 });
  assertEquals(w9B.total, pageFee(bOrders, ruleB, { "rt-b": 4 }));
  assertEquals(Math.round(w9B.total), 1400, "旅行日型：抽成 800＋溢價分潤 4×300÷2＝600");
});

Deno.test("1b. 草稿：只計 PAYUNi 收款訂單（TapPay 不計）＝月結頁對 PAYUNi 訂單算出的平台費；混合付款、退款、Ragic 參考", async () => {
  const { db, run } = setup();
  const r = await run({ action: "draft", period: "2026-11" });
  assertEquals(r.status, 200);
  assertEquals((r.body as any).zero_amount, ["C館"]);
  const a = itemOf(db, A);
  const ruleA = pricingRuleFromRow(RULE_A, configFromSetting(null));
  const payuniA = ORDERS.filter((o) => ["a1", "a2", "a3", "a6"].includes(o.id));
  assertEquals(a.amount, Math.round(pageFee(payuniA, ruleA)));
  assertEquals(a.amount, 2250);
  assertEquals(a.detail.orders.map((o: any) => o.order_id).sort(), ["a1", "a2", "a3", "a6"]);
  assertEquals(a.detail.orders.find((o: any) => o.order_id === "a6").mixed_payment, true);
  assertEquals(a.detail.orders.find((o: any) => o.order_id === "a1").mixed_payment, false);
  assertEquals(a.detail.non_payuni_orders, 1);
  assertEquals(a.detail.month_fee_all_orders, 2850);
  assertEquals(a.detail.refunds.map((x: any) => [x.order_number, x.amount]), [["A1", 2000]], "只列當月 PAYUNi 退款，不回扣");
  // Ragic：不扣加購、團購照計：a1 1500＋a2 450＋a5 900＋a6 450＝3300
  assertEquals(a.detail.ragic.amount, 3300);
  assertEquals(a.detail.ragic.diff, 2250 - 3300);
  assertEquals([a.fee_type, a.bal_type, a.status, a.mer_id, a.trade_no], [2, 1, "pending", "M_A", tradeNoFor("2026-11", 1)]);
  assertEquals(a.trade_no, "LKZ2026110001");
  assertEquals(itemOf(db, Bk).amount, 1400);
  assertEquals(itemOf(db, Bk).trade_no, "LKZ2026110002");
  assertEquals(items(db).length, 2, "金額 0 的館不建明細");
});

Deno.test("2. 同月不可重複產生；未結束月份不可產生；confirmed 後不可改金額；草稿調整需原因", async () => {
  const { db, run } = setup();
  assertEquals((await run({ action: "draft", period: "2026-12" })).status, 400);
  const d = await run({ action: "draft", period: "2026-11" });
  assertEquals((await run({ action: "draft", period: "2026-11" })).status, 409);
  const a = itemOf(db, A);
  assertEquals((await run({ action: "adjust", item_id: a.id, amount: 2000 })).status, 400);
  assertEquals((await run({ action: "adjust", item_id: a.id, amount: 2000, reason: "混合付款扣除 a6" })).status, 200);
  assertEquals(itemOf(db, A).amount, 2000);
  assertEquals(itemOf(db, A).detail.adjustments[0], { from: 2250, to: 2000, reason: "混合付款扣除 a6", by: "hq@x", at: new Date(NOW).toISOString() });
  assertEquals((await run({ action: "confirm", batch_id: (d.body as any).batch_id })).status, 200);
  assertEquals((await run({ action: "adjust", item_id: a.id, amount: 1, reason: "x" })).status, 409);
  assertEquals((await run({ action: "confirm", batch_id: (d.body as any).batch_id })).status, 409);
  assertEquals((await run({ action: "cancel", batch_id: (d.body as any).batch_id })).status, 200);
  assertEquals((await run({ action: "draft", period: "2026-11" })).status, 200, "取消後可重新產生");
});

Deno.test("3. 送出：未設 PAYUNI_AGENT_MER_ID → 400；每館一次、參數正確；重送被擋；部分失敗 → partial_failed", async () => {
  const noMer = setup({}, {}, null);
  const d0 = await noMer.run({ action: "draft", period: "2026-11" });
  await noMer.run({ action: "confirm", batch_id: (d0.body as any).batch_id });
  const r0 = await noMer.run({ action: "submit", batch_id: (d0.body as any).batch_id });
  assertEquals([r0.status, (r0.body as any).error], [400, NO_AGENT_MER_ID]);
  assertEquals(noMer.calls.length, 0);

  const { db, run, calls, alerts } = setup({ M_B: { ok: false, status: "AGENT_FEE_ERR", message: "餘額不足", raw: {} } });
  const d = await run({ action: "draft", period: "2026-11" });
  const id = (d.body as any).batch_id;
  assertEquals((await run({ action: "submit", batch_id: id })).status, 409, "未確認不可送出");
  await run({ action: "confirm", batch_id: id });
  const r = await run({ action: "submit", batch_id: id });
  assertEquals((r.body as any).status, "partial_failed");
  assertEquals(calls.map((c) => [c.kind, c.path, c.version]), [["agent", "/api/agent/agent_fee", "1.0"], ["agent", "/api/agent/agent_fee", "1.0"]]);
  assertEquals(calls[0].payload, { MerID: "M_A", TradeNo: "LKZ2026110001", Amt: 2250, FeeType: 2, BalType: 1, AgentMerID: "LKZ_AGENT" });
  assertEquals([itemOf(db, A).status, itemOf(db, Bk).status, itemOf(db, Bk).api_message], ["sent", "failed", "餘額不足"]);
  assertEquals(db.rows("payuni_platform_fee_batches")[0].status, "partial_failed");
  assertEquals(alerts.length, 1);
  assert(alerts[0].includes("1 館") && alerts[0].includes("失敗 1"));
  assertEquals((await run({ action: "submit", batch_id: id })).body, { ok: true, status: "partial_failed", sent: 0, failed: 0, unknown: 0, total: 0 }, "重送不會再呼叫");
  assertEquals(calls.length, 2);
});

Deno.test("3b. 送出逾時（結果不明）→ 不重送、poll 查到已受理改回 sent", async () => {
  const { db, run, calls } = setup({ M_A: { ok: false, status: "TIMEOUT", raw: null } }, { M_A: { ok: true, status: "SUCCESS", data: { TradeDate: "2026-12-05", FundDate: "0000-00-00", Fee: "0" }, raw: {} } });
  const d = await run({ action: "draft", period: "2026-11" });
  await run({ action: "confirm", batch_id: (d.body as any).batch_id });
  await run({ action: "submit", batch_id: (d.body as any).batch_id });
  assertEquals([itemOf(db, A).status, itemOf(db, A).api_status], ["failed", "TIMEOUT"]);
  assertEquals((await run({ action: "receivable", item_id: itemOf(db, A).id })).status, 409, "結果不明不可轉應收");
  await run({ action: "poll" }, service);
  assertEquals(itemOf(db, A).status, "sent");
  assertEquals(calls.filter((c) => c.path.endsWith("agent_fee")).length, 2);
});

Deno.test("4. poll：FundDate 有值 → funded＋Fee；全部 funded → settled＋告警", async () => {
  const funded = (fee: string) => ({ ok: true, status: "SUCCESS", data: { "Result[0][TradeDate]": "2026-12-05", "Result[0][FundDate]": "2026-12-06", "Result[0][Fee]": fee }, raw: {} });
  const q: Record<string, PayuniResult> = { M_A: funded("27"), M_B: { ok: true, status: "SUCCESS", data: { TradeDate: "2026-12-05", FundDate: "0000-00-00" }, raw: {} } };
  const { db, run, calls, alerts } = setup({}, q);
  const d = await run({ action: "draft", period: "2026-11" });
  await run({ action: "confirm", batch_id: (d.body as any).batch_id });
  await run({ action: "submit", batch_id: (d.body as any).batch_id });
  const p1 = await run({ action: "poll" }, service);
  assertEquals((p1.body as any).funded, 1);
  assertEquals(calls.find((c) => c.path.endsWith("agent_fee_query"))!.payload, { MerID: "M_A", TradeNo: "LKZ2026110001", Amt: 2250 });
  assertEquals([itemOf(db, A).status, itemOf(db, A).fund_date, itemOf(db, A).payuni_fee], ["funded", "2026-12-06", 27]);
  assertEquals([itemOf(db, Bk).status, db.rows("payuni_platform_fee_batches")[0].status], ["sent", "submitted"]);
  q.M_B = funded("14");
  const p2 = await run({ action: "poll" }, service);
  assertEquals((p2.body as any).settled, ["2026-11"]);
  assertEquals(db.rows("payuni_platform_fee_batches")[0].status, "settled");
  assert(alerts.some((s) => s.includes("已全部撥款")));
});

Deno.test("5. 餘額不足 → receivable＋告警；負向修正 BalType=2、FeeType=3，需確認後才送", async () => {
  const fundedAll = { ok: true, status: "SUCCESS", data: { FundDate: "2026-12-06", Fee: "10" }, raw: {} } as PayuniResult;
  const s1 = setup({ M_B: { ok: false, status: "BALANCE", message: "餘額不足", raw: {} } });
  const d1 = await s1.run({ action: "draft", period: "2026-11" });
  await s1.run({ action: "confirm", batch_id: (d1.body as any).batch_id });
  await s1.run({ action: "submit", batch_id: (d1.body as any).batch_id });
  assertEquals((await s1.run({ action: "receivable", item_id: itemOf(s1.db, Bk).id, note: "電話催收" })).status, 200);
  assertEquals(itemOf(s1.db, Bk).status, "receivable");
  assert(s1.alerts.some((s) => s.includes("轉應收") && s.includes("B館")));
  const d2 = await s1.run({ action: "draft", period: "2026-10" });
  assertEquals(d2.status, 200);

  const { db, run, calls } = setup({}, { M_A: fundedAll, M_B: fundedAll });
  const d = await run({ action: "draft", period: "2026-11" });
  const id = (d.body as any).batch_id;
  assertEquals((await run({ action: "correction", batch_id: id, accommodation_id: A, amount: 300, reason: "a6 誤扣" })).status, 409, "未 settled 不可修正");
  await run({ action: "confirm", batch_id: id });
  await run({ action: "submit", batch_id: id });
  await run({ action: "poll" }, service);
  assertEquals(db.rows("payuni_platform_fee_batches")[0].status, "settled");
  assertEquals((await run({ action: "correction", batch_id: id, accommodation_id: A, amount: 300 })).status, 400);
  assertEquals((await run({ action: "correction", batch_id: id, accommodation_id: A, amount: 300, reason: "a6 誤扣" })).status, 200);
  assertEquals((await run({ action: "correction", batch_id: id, accommodation_id: A, amount: 100, reason: "再一次" })).status, 409);
  const n = calls.length;
  await run({ action: "submit", batch_id: id });
  assertEquals(calls.length, n, "修正未確認不送");
  assertEquals((await run({ action: "confirm_correction", item_id: itemOf(db, A, 2).id })).status, 200);
  await run({ action: "submit", batch_id: id });
  assertEquals(calls.at(-1)!.payload, { MerID: "M_A", TradeNo: "LKZ2026110001N", Amt: 300, FeeType: 3, BalType: 2, AgentMerID: "LKZ_AGENT" });
  assertEquals([itemOf(db, A, 2).status, db.rows("payuni_platform_fee_batches")[0].status], ["sent", "submitted"]);
  await run({ action: "poll" }, service);
  assertEquals(db.rows("payuni_platform_fee_batches")[0].status, "settled");
});

Deno.test("5b. 下月草稿列出前期未收（不自動加總）", async () => {
  const s = setup({ M_B: { ok: false, status: "BALANCE", message: "餘額不足", raw: {} } });
  const d = await s.run({ action: "draft", period: "2026-10" });
  await s.run({ action: "confirm", batch_id: (d.body as any).batch_id });
  await s.run({ action: "submit", batch_id: (d.body as any).batch_id });
  await s.run({ action: "draft", period: "2026-11" });
  const nov = items(s.db).find((i) => i.accommodation_id === Bk && i.trade_no.startsWith("LKZ202611"))!;
  assertEquals(nov.amount, 1400);
  assertEquals(nov.detail.prior_unpaid.map((p: any) => [p.period, p.status]), [["2026-10", "failed"]]);
});

Deno.test("6. 權限：非 super_admin 不能 draft／confirm／submit／poll；hotel_admin 只看得到自己館且看不到草稿", async () => {
  const { db, run } = setup();
  for (const action of ["draft", "confirm", "submit", "adjust", "cancel", "receivable", "correction"]) {
    assertEquals((await run({ action, period: "2026-11" }, owner(A))).status, 403, action);
  }
  assertEquals((await run({ action: "poll" }, owner(A))).status, 403);
  const d = await run({ action: "draft", period: "2026-11" });
  assertEquals(((await run({ action: "my_items", accommodation_id: A }, owner(A))).body as any).items, [], "草稿不顯示");
  await run({ action: "confirm", batch_id: (d.body as any).batch_id });
  const mine = (await run({ action: "my_items", accommodation_id: A }, owner(A))).body as any;
  assertEquals(mine.items.map((i: any) => [i.period, i.amount, i.status]), [["2026-11", 2250, "pending"]]);
  assertEquals(mine.items[0].orders.length, 4);
  assertEquals((await run({ action: "my_items", accommodation_id: Bk }, owner(A))).status, 403);
  assertEquals((await run({ action: "my_items", accommodation_id: "bad" }, owner(A))).status, 400);
  assertEquals(items(db).length, 2);
});
