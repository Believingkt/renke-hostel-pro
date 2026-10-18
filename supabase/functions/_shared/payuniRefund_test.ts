// PAYUNi W7 退款測試：PAYUNi 回應全部 mock、記憶體 DB，不連網、不含真實金鑰。
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { PayuniCall, PayuniResult } from "./payuni.ts";
import { FakeDb } from "./payuniTestFakes.ts";
import {
  allocateRefund, decideRefundAction, executePayuniRefund, handleRefundAgentNotify, maskAccountNo, maskHolderName,
  nextRefundMerTradeNo, validateBankAccount,
} from "./payuniRefund.ts";
import { handleTradeNotify, handleTradeQuery, type PayuniTradeDeps } from "./payuniTradeHandlers.ts";
import { handlePayuniAdminCancel, handlePayuniMemberCancel, handlePayuniRefundApi, isPayuniOrder, type CancelDeps } from "./payuniRefundHandlers.ts";
import { quoteOrderRefund, resolveRefundAmount } from "./refundQuote.ts";
import { quoteCancellation } from "./cancellationPolicy.ts";

const NOW = Date.parse("2026-11-01T10:00:00Z");
const DAY = 86_400_000;
const ACC = "11111111-1111-4111-8111-111111111111";
const ORD = "o-1";
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const ACCT = { bank_code: "812", bank_sub_code: "0016", account_no: "1234567890128901", holder_name: "王小明", uid: "A123456789" };

const order = (o: Record<string, unknown> = {}) => ({
  id: ORD, order_number: "LL8Y46U8", accommodation_id: ACC, member_id: "m-1", guest_email: "g@example.com", order_status: "confirmed",
  payment_status: "paid", paid_amount: 8000, refunded_amount: 0, final_price: 8000, deposit_amount: 0, check_in_date: "2027-12-31",
  order_source: "booking", payment_provider: null, payment_method: "credit_card_payuni", deposit_payment_method: null,
  balance_payment_method: null, room_charge_status: null, notes: "原備註", refund_status: null, ...o,
});
const charge = (o: Record<string, unknown> = {}) => ({
  id: "t-1", order_id: ORD, accommodation_id: ACC, provider: "payuni", mer_id: "TEST0001", mer_trade_no: "LL8Y46U8-P1",
  provider_trade_no: "UNI-1", kind: "full", payment_type: 1, amount: 6000, status: "paid", raw_response: {},
  notified_at: ago(10), created_at: ago(10), ...o,
});
const priv = (back: string | null) => ({ accommodation_id: ACC, payuni_settings: back ? { backSetting: { BackSetUnCreditRefund: back } } : {} });

type QueryMap = Record<string, Record<string, string> | null>;
function setup(tables: Record<string, any[]>, query: QueryMap, reply: (c: PayuniCall) => PayuniResult = () => ({ ok: true, status: "SUCCESS", data: {}, raw: {} })) {
  const db = new FakeDb(tables);
  const calls: PayuniCall[] = [];
  const fx = { alerts: [] as string[], emails: [] as any[], pushes: 0 };
  const callPayuni = (c: PayuniCall) => {
    calls.push(c);
    if (c.path === "/api/trade/query") {
      const q = query[String(c.payload.MerTradeNo)];
      return Promise.resolve(q ? { ok: true, status: "SUCCESS", data: { TradeStatus: "1", ...q }, raw: {} } : { ok: false, status: "TIMEOUT", raw: null });
    }
    return Promise.resolve(reply(c));
  };
  const deps: CancelDeps & PayuniTradeDeps = {
    admin: db.client(), now: () => NOW, callPayuni, env: "sandbox", notifyBase: "https://x/functions/v1",
    sendAlert: (s) => { fx.alerts.push(s); return Promise.resolve(true); },
    sendCancelEmail: (b) => { fx.emails.push(b); return Promise.resolve(); },
    push: () => { fx.pushes++; return Promise.resolve(); },
    effects: {} as any,
  };
  return { db, deps, calls, fx };
}
const refunds = (db: FakeDb) => db.rows("payment_transactions").filter((r) => r.kind === "refund");
const rpcPatches = (db: FakeDb) => db.rpcCalls.filter((c) => c.name === "update_order_with_context");

// ---------------- 純規則 ----------------

Deno.test("試算：PAYUNi 信用卡／ATM 訂單與同條件 TapPay 訂單算出同一個退款額", () => {
  for (const [payuni, tappay] of [["credit_card_payuni", "credit_card"], ["atm_payuni", "atm"]]) {
    for (const checkIn of ["2026-11-03", "2026-11-10", "2026-12-31"]) {
      const o = order({ payment_method: payuni, check_in_date: checkIn });
      const p = quoteOrderRefund({ order: o, collected: 8000, refunded: 0, today: "2026-11-01" });
      const t = quoteCancellation({ order: { ...o, payment_method: tappay, paid_amount: 8000 }, checkInDate: checkIn, cancellationDate: "2026-11-01", alreadyRefunded: 0, guaranteeBase: 8000 });
      assertEquals(p.suggested, t.refundAmount);
      assertFalse(p.quote.requiresManualReview);
    }
  }
});

Deno.test("金額：後台上限＝已收−已退、與建議不同須填原因；會員一律等於政策金額（忽略前端金額）；超過上限 400", () => {
  const q = quoteOrderRefund({ order: order(), collected: 8000, refunded: 3000, today: "2026-11-01" });
  assertEquals(q.limit, 5000);
  const noReason = resolveRefundAmount({ role: "admin", requested: 4000, q });
  assert(!noReason.ok && noReason.requiresReason);
  const withReason = resolveRefundAmount({ role: "admin", requested: 4000, overrideReason: "客人協商", q });
  assert(withReason.ok && withReason.amount === 4000 && withReason.override);
  const over = resolveRefundAmount({ role: "admin", requested: 5001, overrideReason: "x".repeat(5), q });
  assert(!over.ok && over.status === 400);
  const member = resolveRefundAmount({ role: "member", requested: 1, q });
  assert(member.ok && member.amount === q.suggested && !member.override);
});

Deno.test("判斷：未請款全退→取消授權；部分→暫緩；已請款→退款；請款處理中→暫緩；ATM 依 BackSet；超過 180 天→人工；另有退款處理中→暫緩", () => {
  const c = charge();
  assertEquals(decideRefundAction(c, { CloseStatus: "9" }, 6000, 6000, null, NOW).type, "cancel");
  assertEquals(decideRefundAction(c, { CloseStatus: "9" }, 1000, 6000, null, NOW).type, "pending");
  assertEquals(decideRefundAction(c, { CloseStatus: "2" }, 1000, 6000, null, NOW).type, "close_refund");
  assertEquals(decideRefundAction(c, { CloseStatus: "7" }, 6000, 6000, null, NOW).type, "pending");
  assertEquals(decideRefundAction(c, { CloseStatus: "2", RefundStatus: "1" }, 10, 6000, null, NOW).type, "pending");
  assertEquals(decideRefundAction(c, { CloseStatus: "2", RefundStatus: "8" }, 10, 6000, null, NOW).type, "pending");
  assertEquals(decideRefundAction(c, { CloseStatus: "2", RefundStatus: "2", RefundType: "3" }, 10, 6000, null, NOW).type, "pending");
  assertEquals(decideRefundAction(c, { CloseStatus: "1" }, 6000, 6000, null, NOW).type, "pending");
  const blocked = decideRefundAction(c, { CloseStatus: "3" }, 6000, 6000, null, NOW);
  assertEquals([blocked.type, (blocked as any).reason], ["blocked", "交易已取消請款，請人工確認"]);
  const atm = charge({ payment_type: 2 });
  assertEquals(decideRefundAction(atm, { RefundStatus: "9" }, 10, 6000, "1", NOW).type, "pending");
  assertEquals(decideRefundAction(atm, {}, 10, 6000, "1", NOW).type, "offline_refund");
  assertEquals(decideRefundAction(atm, {}, 10, 6000, "2", NOW).type, "manual");
  assertEquals(decideRefundAction(atm, {}, 10, 6000, null, NOW).type, "manual");
  assertEquals(decideRefundAction(charge({ notified_at: ago(181) }), { CloseStatus: "2" }, 10, 6000, null, NOW).type, "manual");
  assertEquals(decideRefundAction(charge({ notified_at: ago(179) }), { CloseStatus: "2" }, 10, 6000, null, NOW).type, "close_refund");
});

Deno.test("分配：最後付款先退、每筆不超過可退餘額；不足回 unallocated", () => {
  const a = { tx: charge({ id: "a", notified_at: ago(10) }), remain: 6000 };
  const b = { tx: charge({ id: "b", notified_at: ago(2) }), remain: 1500 };
  const r = allocateRefund([a, b], 3000);
  assertEquals(r.parts.map((p) => [p.tx.id, p.amount]), [["b", 1500], ["a", 1500]]);
  assertEquals(allocateRefund([a, b], 8000).unallocated, 500);
  assertEquals(nextRefundMerTradeNo("X-P1", ["X-P1-R1", "X-P1-R3", "X-A1-R9"]), "X-P1-R4");
  assertEquals(maskAccountNo("1234567890128901"), "************8901");
  assertEquals(maskHolderName("王小明"), "王**");
  assert(validateBankAccount(ACCT).ok);
  assertFalse(validateBankAccount({ ...ACCT, bank_code: "81" }).ok);
  assertFalse(validateBankAccount({ ...ACCT, uid: "" }).ok);
  assert(isPayuniOrder({ payment_method: "atm_payuni" }));
  assertFalse(isPayuniOrder({ payment_method: "credit_card" }));
});

// ---------------- 執行退款 ----------------

Deno.test("退款：兩筆交易（新的未請款、舊的已請款）→ 新的先取消授權（直接完成）、舊的退款 CloseType=2（處理中）；訂單只依完成的退款列更新", async () => {
  const { db, deps, calls } = setup(
    { orders: [order()], payment_transactions: [charge(), charge({ id: "t-2", mer_trade_no: "LL8Y46U8-A1", provider_trade_no: "UNI-2", kind: "addon", amount: 2000, notified_at: ago(1) })] },
    { "LL8Y46U8-P1": { CloseStatus: "2", RemainAmt: "6000" }, "LL8Y46U8-A1": { CloseStatus: "9", RemainAmt: "2000" } },
  );
  const r = await executePayuniRefund(deps, { order: order(), amount: 3000, source: "admin", actorLabel: "測試" });
  assert(r.ok);
  assertEquals([r.refundedNow, r.pendingAmount], [2000, 1000]);
  const sent = calls.filter((c) => c.path !== "/api/trade/query");
  assertEquals(sent.map((c) => [c.path, c.payload.TradeNo, c.payload.CloseType ?? null, c.payload.TradeAmt ?? null]),
    [["/api/trade/cancel", "UNI-2", null, null], ["/api/trade/close", "UNI-1", 2, 1000]]);
  assertEquals(refunds(db).map((x) => [x.mer_trade_no, x.amount, x.status, x.parent_tx_id, x.refund_source]),
    [["LL8Y46U8-A1-R1", 2000, "paid", "t-2", "admin"], ["LL8Y46U8-P1-R1", 1000, "pending", "t-1", "admin"]]);
  // 信用卡退款（close）送出成功先維持處理中，記下送出前的 RemainAmt 供 sweep 判定
  assertEquals([refunds(db)[1].raw_response.awaiting_refund, refunds(db)[1].raw_response.remain_before], [true, 6000]);
  const o = db.rows("orders")[0];
  assertEquals([o.refunded_amount, o.paid_amount, o.payment_status, o.refund_status], [2000, 6000, "partial_refunded", "pending"]);
  assertEquals(rpcPatches(db).map((c) => c.args.p_source), ["payuni_refund"]);
  assertFalse("order_status" in rpcPatches(db)[0].args.p_patch);
});

Deno.test("冪等：有處理中退款 → 409；24 小時內同額已完成 → 409；超過可退 → 400；查詢失敗 → 502 且不建退款列", async () => {
  const pend = charge({ id: "r-1", kind: "refund", status: "pending", mer_trade_no: "LL8Y46U8-P1-R1", parent_tx_id: "t-1", amount: 100, created_at: ago(0) });
  let s = setup({ orders: [order()], payment_transactions: [charge(), pend] }, {});
  assertEquals((await executePayuniRefund(s.deps, { order: order(), amount: 100, source: "admin", actorLabel: "x" }) as any).status, 409);
  s = setup({ orders: [order()], payment_transactions: [charge(), { ...pend, status: "paid", raw_response: { batch_id: "b1" } }] }, { "LL8Y46U8-P1": { CloseStatus: "2" } });
  assertEquals((await executePayuniRefund(s.deps, { order: order(), amount: 100, source: "admin", actorLabel: "x" }) as any).status, 409);
  assertEquals((await executePayuniRefund(s.deps, { order: order(), amount: 5901, source: "admin", actorLabel: "x" }) as any).status, 400);
  s = setup({ orders: [order()], payment_transactions: [charge()] }, {});
  assertEquals((await executePayuniRefund(s.deps, { order: order(), amount: 100, source: "admin", actorLabel: "x" }) as any).status, 502);
  assertEquals(refunds(s.db).length, 0);
});

Deno.test("RemainAmt：PAYUNi 剩餘可退比本地少 → 以 RemainAmt 為上限，不足回 400", async () => {
  const { deps, db } = setup({ orders: [order()], payment_transactions: [charge()] }, { "LL8Y46U8-P1": { CloseStatus: "2", RemainAmt: "500" } });
  const r = await executePayuniRefund(deps, { order: order(), amount: 600, source: "admin", actorLabel: "x" }) as any;
  assertEquals([r.ok, r.status], [false, 400]);
  assertEquals(refunds(db).length, 0);
});

Deno.test("信用卡退款失敗 → 退款列 failed、通知＋告警、訂單 refund_status=failed；refunded_amount 不變", async () => {
  const { deps, db, fx } = setup({ orders: [order()], payment_transactions: [charge()] }, { "LL8Y46U8-P1": { CloseStatus: "2" } },
    () => ({ ok: false, status: "ERROR", message: "退款失敗", raw: {} }));
  const r = await executePayuniRefund(deps, { order: order(), amount: 1000, source: "admin", actorLabel: "x" }) as any;
  assertEquals([r.ok, r.failedAmount], [true, 1000]);
  assertEquals(refunds(db)[0].status, "failed");
  assertEquals(db.rows("orders")[0].refund_status, "failed");
  assertEquals(db.rows("orders")[0].refunded_amount, 0);
  assertEquals(db.rows("notifications")[0].type, "refund_failed");
  assertEquals(fx.alerts.length, 1);
});

// ---------------- ATM ----------------

const atmTables = (back: string | null) => ({
  orders: [order({ payment_method: "atm_payuni" })],
  payment_transactions: [charge({ payment_type: 2, mer_trade_no: "LL8Y46U8-P1" })],
  accommodation_payuni_private: [priv(back)],
});

Deno.test("ATM：BackSetUnCreditRefund=1 無帳戶 → 400 needsBankAccount；有帳戶 → offline/refund EncryptInfo 只含 9 個欄位（無戶名、無 NotifyURL）、帳戶落表不含 UID、退款列 pending", async () => {
  const { deps, db, calls } = setup(atmTables("1"), { "LL8Y46U8-P1": { TradeStatus: "1" } });
  const no = await executePayuniRefund(deps, { order: order(), amount: 6000, source: "member", actorLabel: "g" }) as any;
  assertEquals([no.status, no.needsBankAccount], [400, true]);
  assertEquals(refunds(db).length, 0);
  const r = await executePayuniRefund(deps, { order: order(), amount: 6000, source: "member", actorLabel: "g", bankAccount: ACCT }) as any;
  assertEquals([r.ok, r.pendingAmount], [true, 6000]);
  const call = calls.find((c) => c.path === "/api/trade/offline/refund")!;
  assertEquals([call.version, Object.keys(call.payload).sort()],
    ["1.0", ["BankAccountNo", "BankCode", "BankSubCode", "MerID", "PaymentType", "RefundAmt", "Timestamp", "TradeNo", "UID"].sort()]);
  assertEquals([call.payload.RefundAmt, call.payload.PaymentType, call.payload.BankSubCode, call.payload.BankAccountNo, call.payload.UID], [6000, 2, "0016", "1234567890128901", "A123456789"]);
  assertFalse(JSON.stringify(call.payload).includes("王小明"));
  assertFalse("NotifyURL" in call.payload);
  const acct = db.rows("refund_bank_accounts")[0];
  assertEquals([acct.account_no, acct.holder_name, acct.refund_tx_id, acct.purge_after ?? null], ["1234567890128901", "王小明", refunds(db)[0].id, null]);
  assertFalse(JSON.stringify(db.rows("refund_bank_accounts")).includes("A123456789"));
  assertFalse(JSON.stringify(db.rows("payment_transactions")).includes("A123456789"));
  assertEquals(db.rows("orders")[0].refund_status, "pending");
  assertEquals(db.rows("orders")[0].refunded_amount, 0);
});

Deno.test("ATM：BackSetUnCreditRefund=2 → 不呼叫 PAYUNi 退款、人工退款列＋通知、訂單 pending_manual", async () => {
  const { deps, db, calls } = setup(atmTables("2"), { "LL8Y46U8-P1": { TradeStatus: "1" } });
  const r = await executePayuniRefund(deps, { order: order(), amount: 6000, source: "admin", actorLabel: "x" }) as any;
  assertEquals([r.ok, r.manualAmount], [true, 6000]);
  assertEquals(calls.filter((c) => c.path !== "/api/trade/query").length, 0);
  assertEquals(refunds(db)[0].raw_response.action, "manual");
  assertEquals(db.rows("orders")[0].refund_status, "pending_manual");
  assertEquals(db.rows("notifications")[0].title, "PAYUNi 退款需人工處理");
});

const atmNotify = (deps: PayuniTradeDeps, d: Record<string, string>) =>
  handleTradeNotify(deps, { ok: true, outer: { MerID: "TEST0001" }, data: { MerID: "TEST0001", MerTradeNo: "LL8Y46U8-P1", TradeNo: "UNI-1", ...d } });

Deno.test("trade-notify：ATM 轉匯成功 → 退款列 paid、帳戶 30 天後遮罩、訂單 refunded；轉匯失敗 → failed、帳戶保留；補填後舊帳戶立即遮罩並重送 R2", async () => {
  let s = setup(atmTables("1"), { "LL8Y46U8-P1": { TradeStatus: "1" } });
  await executePayuniRefund(s.deps, { order: order(), amount: 6000, source: "member", actorLabel: "g", bankAccount: ACCT });
  await atmNotify(s.deps, { Status: "SUCCESS", RefundStatus: "1", BankDate: "20261102" });
  assertEquals(refunds(s.db)[0].status, "paid");
  assertEquals(s.db.rows("refund_bank_accounts")[0].purge_after, new Date(NOW + 30 * DAY).toISOString());
  const o = s.db.rows("orders")[0];
  assertEquals([o.refunded_amount, o.paid_amount, o.payment_status], [6000, 0, "refunded"]);
  assertEquals(s.db.rows("payuni_notify_events")[0].notify_type, "refund");
  // 原付款交易不被改動
  assertEquals(s.db.rows("payment_transactions")[0].status, "paid");

  s = setup(atmTables("1"), { "LL8Y46U8-P1": { TradeStatus: "1" } });
  await executePayuniRefund(s.deps, { order: order(), amount: 6000, source: "member", actorLabel: "g", bankAccount: ACCT });
  await atmNotify(s.deps, { Status: "FAIL", RefundStatus: "2", BankDate: "-", Message: "帳號錯誤" });
  assertEquals(refunds(s.db)[0].status, "failed");
  assertEquals(s.db.rows("refund_bank_accounts")[0].account_no, "1234567890128901");
  assertEquals(s.db.rows("orders")[0].refund_status, "failed");
  const api = await handlePayuniRefundApi(s.deps, { action: "status", order_number: "LL8Y46U8" }, { role: "member", label: "g", canAccess: () => Promise.resolve(true) });
  const row = (api.body.rows as any[])[0];
  assertEquals([row.can_resubmit, row.bank.account_masked, row.bank.holder_masked], [true, "************8901", "王**"]);
  const re = await handlePayuniRefundApi(s.deps, { action: "resubmit_bank_account", order_number: "LL8Y46U8", refund_mer_trade_no: "LL8Y46U8-P1-R1", bank_account: { ...ACCT, account_no: "99998888777" } },
    { role: "member", label: "g", canAccess: () => Promise.resolve(true) });
  assertEquals(re.status, 200);
  const accts = s.db.rows("refund_bank_accounts");
  assertEquals([accts[0].account_no, accts[0].holder_name, !!accts[0].purged_at], ["************8901", "王**", true]);
  assertEquals(accts[1].account_no, "99998888777");
  assertEquals(refunds(s.db).map((r) => [r.mer_trade_no, r.status]), [["LL8Y46U8-P1-R1", "failed"], ["LL8Y46U8-P1-R2", "pending"]]);
  assertEquals(s.db.rows("orders")[0].refund_status, "pending");
  const again = await handlePayuniRefundApi(s.deps, { action: "resubmit_bank_account", order_number: "LL8Y46U8", refund_mer_trade_no: "LL8Y46U8-P1-R1", bank_account: ACCT },
    { role: "member", label: "g", canAccess: () => Promise.resolve(true) });
  assertEquals(again.status, 409);
});

Deno.test("trade-notify：一般付款 Notify（無退款欄位）照舊走付款流程", async () => {
  const s = setup({ orders: [order({ payment_status: "pending_payment", paid_amount: 0 })], payment_transactions: [charge({ status: "pending" })] }, {});
  await atmNotify(s.deps, { Status: "SUCCESS", TradeStatus: "2" });
  assertEquals(s.db.rows("payment_transactions")[0].status, "failed");
  assertEquals(refunds(s.db).length, 0);
});

// ---------------- agent-notify ----------------

Deno.test("agent-notify：PAYUNi 後台退款（無對應處理中退款列）→ 補登 payuni_backstage 退款列、備註、通知、告警，訂單不取消；重送不重複", async () => {
  const s = setup({ orders: [order()], payment_transactions: [charge()] }, {});
  const r = await handleRefundAgentNotify(s.deps, "Refund", { TradeNo: "UNI-1", TradeAmt: "6000", ExecuteAmt: "1500", ExecuteTime: "e1" }, "測試館A");
  assertEquals(r, { processed: true, error: null });
  const rows = refunds(s.db);
  assertEquals(rows.map((x) => [x.mer_trade_no, x.amount, x.status, x.refund_source]), [["LL8Y46U8-P1-R1", 1500, "paid", "payuni_backstage"]]);
  const o = s.db.rows("orders")[0];
  assertEquals([o.order_status, o.refunded_amount, o.paid_amount], ["confirmed", 1500, 4500]);
  assert(String(o.notes).includes("PAYUNi 後台退款補登"));
  assertEquals(s.db.rows("notifications")[0].title, "PAYUNi 後台退款");
  assertEquals(s.fx.alerts.length, 1);
  await handleRefundAgentNotify(s.deps, "Refund", { TradeNo: "UNI-1", TradeAmt: "6000", ExecuteAmt: "1500", ExecuteTime: "e1" }, "測試館A");
  assertEquals(refunds(s.db).length, 1);
});

Deno.test("agent-notify：以 ExecuteAmt（非 TradeAmt）配對處理中退款列 → 完成；CancelRefund → cancelled；缺 ExecuteAmt（RefundAmt／CloseAmt 不採用）→ UNMATCHED＋告警", async () => {
  const pend = charge({ id: "r-1", kind: "refund", status: "pending", mer_trade_no: "LL8Y46U8-P1-R1", parent_tx_id: "t-1", amount: 1000, raw_response: { action: "pending" } });
  const s = setup({ orders: [order()], payment_transactions: [charge(), pend] }, {});
  // 部分退款：TradeAmt 是原交易總額（6000），必須用 ExecuteAmt（1000）配對
  await handleRefundAgentNotify(s.deps, "Refund", { TradeNo: "UNI-1", TradeAmt: "6000", ExecuteAmt: "1000" }, "測試館A");
  assertEquals(refunds(s.db).map((x) => [x.status, x.refund_source]), [["paid", undefined]]);
  assertEquals(s.db.rows("orders")[0].refunded_amount, 1000);
  await handleRefundAgentNotify(s.deps, "CancelRefund", { TradeNo: "UNI-1", TradeAmt: "6000", ExecuteAmt: "1000" }, "測試館A");
  assertEquals(refunds(s.db)[0].status, "cancelled");
  assertEquals(s.db.rows("orders")[0].refunded_amount, 0);
  const miss = await handleRefundAgentNotify(s.deps, "Refund", { TradeNo: "UNI-1", TradeAmt: "6000", RefundAmt: "1000", CloseAmt: "1000" }, "測試館A");
  assertEquals(miss, { processed: false, error: "UNMATCHED" });
  assert(s.fx.alerts.some((a) => a.includes("退款通知")));
  assertEquals(refunds(s.db).length, 1);
});

// ---------------- sweep ----------------

Deno.test("sweep：暫緩退款在請款完成後自動送出；處理中逾 7 天告警一次；到期帳戶遮罩；退款列不進付款 sweep", async () => {
  const pend = charge({ id: "r-1", kind: "refund", status: "pending", mer_trade_no: "LL8Y46U8-P1-R1", parent_tx_id: "t-1", amount: 1000,
    refund_pending_reason: "請款處理中", raw_response: { action: "pending" }, created_at: ago(1) });
  const stale = charge({ id: "r-2", order_id: "o-2", kind: "refund", status: "pending", payment_type: 2, mer_trade_no: "ZZ-P1-R1", parent_tx_id: "t-9", amount: 500,
    raw_response: { action: "offline_refund", awaiting_transfer: true }, created_at: ago(8) });
  const s = setup({
    orders: [order()], payment_transactions: [charge(), pend, stale],
    refund_bank_accounts: [{ id: "b-1", order_id: "o-2", account_no: "1234567890128901", holder_name: "陳大文", purge_after: ago(1), purged_at: null },
      { id: "b-2", order_id: "o-3", account_no: "00012345678", holder_name: "林小美", purge_after: null, purged_at: null }],
  }, { "LL8Y46U8-P1": { CloseStatus: "2", RemainAmt: "6000" } });
  const out = await handleTradeQuery(s.deps, { action: "sweep" }, { isService: true, isSuperAdmin: false, isAccommodationAdmin: () => Promise.resolve(false) });
  assertEquals(out.body.queried, 0);
  assertEquals(out.body.refundRetried, ["LL8Y46U8-P1-R1"]);
  assertEquals(out.body.refundStaleAlerted, ["ZZ-P1-R1"]);
  assertEquals(out.body.accountsMasked, 1);
  assertEquals(s.calls.filter((c) => c.path === "/api/trade/close").map((c) => c.payload.TradeAmt), [1000]);
  const r1 = refunds(s.db).find((r) => r.id === "r-1")!;
  assertEquals([r1.status, r1.raw_response.awaiting_refund, r1.raw_response.remain_before], ["pending", true, 6000]);
  assertEquals(s.db.rows("orders")[0].refunded_amount ?? 0, 0);
  const accts = s.db.rows("refund_bank_accounts");
  assertEquals([accts[0].account_no, accts[0].holder_name], ["************8901", "陳**"]);
  assertEquals([accts[1].account_no, accts[1].holder_name], ["00012345678", "林小美"]);
  const again = await handleTradeQuery(s.deps, { action: "sweep" }, { isService: true, isSuperAdmin: false, isAccommodationAdmin: () => Promise.resolve(false) });
  assertEquals(again.body.refundStaleAlerted, []);
});

Deno.test("ATM：缺 BankSubCode → 400，不建退款列、不呼叫 PAYUNi（表單驗證與執行前檢查都擋）", async () => {
  const { deps, db, calls } = setup(atmTables("1"), { "LL8Y46U8-P1": { TradeStatus: "1" } });
  assertFalse(validateBankAccount({ ...ACCT, bank_sub_code: "" }).ok);
  const r = await executePayuniRefund(deps, { order: order(), amount: 6000, source: "admin", actorLabel: "x", bankAccount: { ...ACCT, bank_sub_code: "" } }) as any;
  assertEquals([r.ok, r.status], [false, 400]);
  const api = await handlePayuniRefundApi(deps, { action: "refund", order_number: "LL8Y46U8", amount: 6000, bank_account: { ...ACCT, bank_sub_code: undefined } },
    { role: "admin", label: "a", canAccess: () => Promise.resolve(true) });
  assertEquals(api.status, 400);
  assertEquals(refunds(db).length, 0);
  assertEquals(calls.filter((c) => c.path === "/api/trade/offline/refund").length, 0);
});

Deno.test("信用卡 CloseStatus=3（已取消請款）→ 不發動退款、回 400「交易已取消請款，請人工確認」並告警", async () => {
  const { deps, db, calls, fx } = setup({ orders: [order()], payment_transactions: [charge()] }, { "LL8Y46U8-P1": { CloseStatus: "3", RemainAmt: "6000" } });
  const r = await executePayuniRefund(deps, { order: order(), amount: 6000, source: "admin", actorLabel: "x" }) as any;
  assertEquals([r.ok, r.status, r.error], [false, 400, "交易已取消請款，請人工確認"]);
  assertEquals(calls.filter((c) => c.path !== "/api/trade/query").length, 0);
  assertEquals(refunds(db).length, 0);
  assertEquals(fx.alerts.length, 1);
});

const sweepNow = (deps: any) => handleTradeQuery(deps, { action: "sweep" }, { isService: true, isSuperAdmin: false, isAccommodationAdmin: () => Promise.resolve(false) });
const atmPending = (o: Record<string, unknown> = {}) => charge({
  id: "r-1", kind: "refund", status: "pending", payment_type: 2, mer_trade_no: "LL8Y46U8-P1-R1", parent_tx_id: "t-1", amount: 6000,
  raw_response: { action: "offline_refund", awaiting_transfer: true }, created_at: ago(1), ...o,
});

Deno.test("sweep ATM（RefundStatus 用 ATM 那套）：9=轉匯中繼續等；3=轉匯取消 → cancelled＋告警；2=轉匯失敗 → failed 可補填；1=轉匯成功 → paid", async () => {
  const base = () => ({ orders: [order({ payment_method: "atm_payuni" })], payment_transactions: [charge({ payment_type: 2 }), atmPending()] });
  let s = setup(base(), { "LL8Y46U8-P1": { RefundStatus: "9", RemainAmt: "6000" } });
  await sweepNow(s.deps);
  assertEquals(refunds(s.db)[0].status, "pending");
  s = setup(base(), { "LL8Y46U8-P1": { RefundStatus: "3" } });
  const out = await sweepNow(s.deps);
  assertEquals([refunds(s.db)[0].status, out.body.refundResolved], ["cancelled", ["LL8Y46U8-P1-R1"]]);
  assert(s.fx.alerts.some((a) => a.includes("退款已取消")));
  s = setup(base(), { "LL8Y46U8-P1": { RefundStatus: "2" } });
  await sweepNow(s.deps);
  assertEquals(refunds(s.db)[0].status, "failed");
  const st = await handlePayuniRefundApi(s.deps, { action: "status", order_number: "LL8Y46U8" }, { role: "member", label: "g", canAccess: () => Promise.resolve(true) });
  assertEquals((st.body.rows as any[])[0].can_resubmit, true);
  s = setup(base(), { "LL8Y46U8-P1": { RefundStatus: "1", RemainAmt: "0" } });
  await sweepNow(s.deps);
  assertEquals([refunds(s.db)[0].status, s.db.rows("orders")[0].refunded_amount], ["paid", 6000]);
});

Deno.test("sweep 信用卡：同一交易兩筆 pending 部分退款，RefundStatus 只套用最新一筆；較早一筆看 RemainAmt 變化才完成", async () => {
  const cardPending = (id: string, no: string, amount: number, created: string) => charge({
    id, kind: "refund", status: "pending", mer_trade_no: no, parent_tx_id: "t-1", amount,
    raw_response: { action: "close_refund", awaiting_refund: true, remain_before: 6000 }, created_at: created,
  });
  const tables = () => ({ orders: [order()], payment_transactions: [charge(), cardPending("r-1", "LL8Y46U8-P1-R1", 1000, ago(2)), cardPending("r-2", "LL8Y46U8-P1-R2", 500, ago(1))] });
  // PAYUNi 只完成了最後一筆（500）：RemainAmt 6000 → 5500
  let s = setup(tables(), { "LL8Y46U8-P1": { CloseStatus: "2", RefundStatus: "2", RefundType: "2", RemainAmt: "5500" } });
  await sweepNow(s.deps);
  assertEquals(refunds(s.db).map((r) => [r.mer_trade_no, r.status]), [["LL8Y46U8-P1-R1", "pending"], ["LL8Y46U8-P1-R2", "paid"]]);
  assertEquals(s.db.rows("orders")[0].refunded_amount, 500);
  // 兩筆都完成：RemainAmt 4500 → 較早那筆也完成
  s.db.rows("payment_transactions").find((r) => r.id === "r-2")!.status = "paid";
  const s2 = setup({ orders: [order()], payment_transactions: s.db.rows("payment_transactions") }, { "LL8Y46U8-P1": { CloseStatus: "2", RefundStatus: "2", RemainAmt: "4500" } });
  await sweepNow(s2.deps);
  assertEquals(refunds(s2.db).map((r) => r.status), ["paid", "paid"]);
  assertEquals(s2.db.rows("orders")[0].refunded_amount, 1500);
  // RefundType=3（預計退款）或 RefundStatus=8（處理中）→ 不判定
  s = setup(tables(), { "LL8Y46U8-P1": { CloseStatus: "2", RefundStatus: "2", RefundType: "3", RemainAmt: "6000" } });
  await sweepNow(s.deps);
  assertEquals(refunds(s.db).map((r) => r.status), ["pending", "pending"]);
  s = setup(tables(), { "LL8Y46U8-P1": { CloseStatus: "2", RefundStatus: "8", RemainAmt: "6000" } });
  await sweepNow(s.deps);
  assertEquals(refunds(s.db).map((r) => r.status), ["pending", "pending"]);
});

Deno.test("sweep 信用卡：RefundStatus=3（退款取消）→ 最新一筆 cancelled（不是 failed）＋告警，已退金額不增加", async () => {
  const row = charge({ id: "r-1", kind: "refund", status: "pending", mer_trade_no: "LL8Y46U8-P1-R1", parent_tx_id: "t-1", amount: 1000,
    raw_response: { action: "close_refund", awaiting_refund: true, remain_before: 6000 }, created_at: ago(1) });
  const s = setup({ orders: [order()], payment_transactions: [charge(), row] }, { "LL8Y46U8-P1": { CloseStatus: "2", RefundStatus: "3", RemainAmt: "6000" } });
  await sweepNow(s.deps);
  assertEquals(refunds(s.db)[0].status, "cancelled");
  assertEquals(s.db.rows("orders")[0].refunded_amount, 0);
  assert(s.fx.alerts.some((a) => a.includes("退款已取消")));
});

// ---------------- 後台取消／會員取消／API 權限 ----------------

Deno.test("後台取消：quote 回 PAYUNi 上限；auto_refund 先退款（payuni_refund）再取消（admin_cancel_refund）、寄取消信；金額不同未填原因 → 400", async () => {
  const s = setup({ orders: [order()], payment_transactions: [charge({ amount: 8000 })] }, { "LL8Y46U8-P1": { CloseStatus: "2", RemainAmt: "8000" } });
  const q = await handlePayuniAdminCancel(s.deps, order(), { mode: "quote" }, "admin@x");
  assertEquals([q.body.paidAmount, q.body.remainingRefundable, (q.body.payuni as any).provider], [8000, 8000, "payuni"]);
  const bad = await handlePayuniAdminCancel(s.deps, order(), { refundAction: "auto_refund", refundAmount: 100 }, "admin@x");
  assertEquals([bad.status, bad.body.requiresReason], [400, true]);
  const ok = await handlePayuniAdminCancel(s.deps, order(), { refundAction: "auto_refund" }, "admin@x");
  assertEquals(ok.body.success, true);
  assertEquals(rpcPatches(s.db).map((c) => c.args.p_source), ["payuni_refund", "admin_cancel_refund"]);
  const o = s.db.rows("orders")[0];
  assertEquals([o.order_status, o.refunded_amount, o.refund_status], ["cancelled", 0, "pending"]);
  assertEquals(refunds(s.db)[0].amount, q.body.suggestedRefund);
  assertEquals(s.fx.emails[0].triggerSource, "admin_cancel");
});

Deno.test("後台取消：PAYUNi 全部退款失敗 → 訂單不取消", async () => {
  const s = setup({ orders: [order()], payment_transactions: [charge({ amount: 8000 })] }, { "LL8Y46U8-P1": { CloseStatus: "2" } },
    () => ({ ok: false, status: "ERROR", raw: {} }));
  const r = await handlePayuniAdminCancel(s.deps, order(), { refundAction: "auto_refund" }, "admin@x");
  assertEquals(r.body.success, false);
  assertEquals(s.db.rows("orders")[0].order_status, "confirmed");
  assertEquals(s.fx.emails.length, 0);
});

Deno.test("會員取消：金額照政策（忽略前端金額）；ATM 需帳戶未填 → 400 且不取消", async () => {
  let s = setup({ orders: [order()], payment_transactions: [charge({ amount: 8000 })] }, { "LL8Y46U8-P1": { CloseStatus: "2", RemainAmt: "8000" } });
  const ctx = { email: "g@example.com", today: "2026-11-01", freeCancelDays: 14 };
  const r = await handlePayuniMemberCancel(s.deps, order(), { action: "cancel", refundAmount: 1 }, ctx);
  const expected = quoteOrderRefund({ order: order(), collected: 8000, refunded: 0, freeCancelDays: 14 }).suggested;
  assertEquals([r.body.success, r.body.refunded], [true, expected]);
  assertEquals(s.calls.find((c) => c.path === "/api/trade/close")!.payload.TradeAmt, expected);
  assertEquals(refunds(s.db)[0].refund_source, "member");
  assertEquals(s.db.rows("orders")[0].order_status, "cancelled");

  s = setup({ ...atmTables("1"), payment_transactions: [charge({ payment_type: 2, amount: 8000 })] }, { "LL8Y46U8-P1": { TradeStatus: "1" } });
  const atmOrder = order({ payment_method: "atm_payuni" });
  const quote = await handlePayuniMemberCancel(s.deps, atmOrder, { action: "cancel_quote" }, ctx);
  assertEquals((quote.body.payuni as any).needsBankAccount, true);
  const no = await handlePayuniMemberCancel(s.deps, atmOrder, { action: "cancel" }, ctx);
  assertEquals([no.status, no.body.needsBankAccount], [400, true]);
  assertEquals(s.db.rows("orders")[0].order_status, "confirmed");
});

Deno.test("API：會員不能發動 refund／quote；看不到別人的訂單；非 PAYUNi 訂單 400", async () => {
  const s = setup({ orders: [order(), order({ id: "o-9", order_number: "TAPPAY01", payment_method: "credit_card" })], payment_transactions: [charge()] }, {});
  const member = { role: "member" as const, label: "g", canAccess: () => Promise.resolve(true) };
  assertEquals((await handlePayuniRefundApi(s.deps, { action: "refund", order_number: "LL8Y46U8", amount: 100 }, member)).status, 403);
  assertEquals((await handlePayuniRefundApi(s.deps, { action: "quote", order_number: "LL8Y46U8" }, member)).status, 403);
  assertEquals((await handlePayuniRefundApi(s.deps, { action: "status", order_number: "LL8Y46U8" }, { ...member, canAccess: () => Promise.resolve(false) })).status, 404);
  assertEquals((await handlePayuniRefundApi(s.deps, { action: "status", order_number: "TAPPAY01" }, member)).status, 400);
  assertEquals(refunds(s.db).length, 0);
});

Deno.test("trade-query：手動查詢退款列 → 400（只查原付款交易）", async () => {
  const s = setup({ payment_transactions: [charge({ id: "r-1", kind: "refund", mer_trade_no: "LL8Y46U8-P1-R1" })] }, {});
  const r = await handleTradeQuery(s.deps, { mer_trade_no: "LL8Y46U8-P1-R1" }, { isService: false, isSuperAdmin: true, isAccommodationAdmin: () => Promise.resolve(true) });
  assertEquals(r.status, 400);
  assertEquals(s.calls.length, 0);
});

