// PAYUNi W8 撥款同步測試：PAYUNi 回應全部 mock、記憶體 DB，不連網、不含真實金鑰。
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { PayuniCall, PayuniResult } from "./payuni.ts";
import { FakeDb } from "./payuniTestFakes.ts";
import type { PayuniTradeDeps } from "./payuniTradeHandlers.ts";
import { extractPageInfo, extractQueryResults } from "./payuniTrade.ts";
import { type GrantCaller, handleGrantSync, normalizeDate, validGrantDate } from "./payuniGrant.ts";

// 台北 2026-11-02 10:00
const NOW = Date.parse("2026-11-02T02:00:00Z");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const service: GrantCaller = { isService: true, isSuperAdmin: false, label: "system" };
const hq: GrantCaller = { isService: false, isSuperAdmin: true, label: "hq@x" };
const hotel: GrantCaller = { isService: false, isSuperAdmin: false, label: "owner@x" };

const flat = (rows: Record<string, string>[], current: number, total: number) => {
  const d: Record<string, string> = { "PageInfo[Current]": String(current), "PageInfo[Total]": String(total) };
  rows.forEach((r, i) => Object.entries(r).forEach(([k, v]) => (d[`Result[${i}][${k}]`] = v)));
  return d;
};
const grant = (o: Record<string, string> = {}) => ({
  TradeDate: "2026-11-01", MerTradeNo: "ORD1-full1", TradeNo: "UNI-1", MerID: "M_A", PaymentType: "1", BankChannel: "",
  PaymentDate: "2026-10-25 12:00:00", PaymentInfo: "", ExecuteAmt: "1000", Fee: "28", Action: "付款", FundsAmt: "972", Type: "入帳", ...o,
});

type Pages = Record<string, Array<Record<string, string> | "fail">>;
function setup(pages: Pages, tables: Record<string, any[]> = {}) {
  const db = new FakeDb({
    accommodation_info: [
      { id: A, name: "A館", payuni_mer_id: "M_A" }, { id: B, name: "B館", payuni_mer_id: "M_B" },
      { id: C, name: "C館", payuni_mer_id: null },
    ],
    payment_transactions: [
      { id: "tx-1", provider: "payuni", mer_trade_no: "ORD1-full1", order_id: "o-1" },
      { id: "tx-2", provider: "payuni", mer_trade_no: "ORD2-full1", order_id: "o-2" },
    ],
    payuni_grant_records: [],
    ...tables,
  });
  const calls: PayuniCall[] = [];
  const alerts: Array<{ s: string; h: string }> = [];
  const deps: PayuniTradeDeps = {
    admin: db.client(), env: "sandbox", notifyBase: "https://x/functions/v1", now: () => NOW,
    callPayuni: (c) => {
      calls.push(c);
      const p = pages[String(c.merId)]?.[Number(c.payload.Page) - 1];
      return Promise.resolve<PayuniResult>(!p || p === "fail" ? { ok: false, status: "TIMEOUT", raw: null } : { ok: true, status: "SUCCESS", data: p, raw: {} });
    },
    sendAlert: (s, h) => { alerts.push({ s, h }); return Promise.resolve(true); },
    effects: {} as any,
  };
  return { db, deps, calls, alerts };
}

Deno.test("extractQueryResults：Result[n] 平鋪依序取全部、JSON 陣列、單筆平鋪、無資料", () => {
  const d = { "Result[1][TradeNo]": "B", "Result[0][TradeNo]": "A", "Result[10][TradeNo]": "K", "Result[0][Fee]": "3" };
  assertEquals(extractQueryResults(d).map((r) => r.TradeNo), ["A", "B", "K"]);
  assertEquals(extractQueryResults(d)[0].Fee, "3");
  assertEquals(extractQueryResults({ Result: JSON.stringify([{ TradeNo: "X", Fee: 5 }]) }), [{ TradeNo: "X", Fee: "5" }]);
  assertEquals(extractQueryResults({ TradeNo: "S", Fee: "1" }), [{ TradeNo: "S", Fee: "1" }]);
  assertEquals(extractQueryResults({ Status: "SUCCESS" }), []);
  assertEquals(extractPageInfo({ "PageInfo[Current]": "2", "PageInfo[Total]": "3" }), { current: 2, total: 3 });
  assertEquals(extractPageInfo({ PageInfo: JSON.stringify({ Current: 1, Total: 4 }) }), { current: 1, total: 4 });
});

Deno.test("日期：30 天內才可查；TradeDate 格式正規化", () => {
  assert(validGrantDate("2026-11-01", NOW));
  assert(validGrantDate("2026-10-03", NOW));
  assert(!validGrantDate("2026-10-02", NOW));
  assert(!validGrantDate("2026-11-03", NOW));
  assert(!validGrantDate("2026/11/01", NOW));
  assertEquals(normalizeDate("20261101"), "2026-11-01");
  assertEquals(normalizeDate("2026/11/01 10:00"), "2026-11-01");
  assertEquals(normalizeDate("11/01"), null);
});

Deno.test("1. 分頁：Total=3 → 依序取 3 頁全部寫入，row_seq=(Page-1)*500+索引", async () => {
  const p = (n: number) => flat([grant({ TradeNo: `UNI-${n}a`, MerTradeNo: "ORD1-full1" }), grant({ TradeNo: `UNI-${n}b`, MerTradeNo: "ORD2-full1" })], n, 3);
  const { db, deps, calls } = setup({ M_A: [p(1), p(2), p(3)], M_B: [flat([], 1, 1)] });
  const r = await handleGrantSync(deps, { action: "run" }, service);
  assertEquals(r.status, 200);
  const a = calls.filter((c) => c.merId === "M_A");
  assertEquals(a.map((c) => c.payload.Page), [1, 2, 3]);
  assertEquals(a[0].path, "/api/trade/grant_query");
  assertEquals(a[0].version, "1.0");
  assertEquals(a[0].kind, "merchant");
  assertEquals(a[0].payload, { MerID: "M_A", QueryDate: "2026-11-01", Page: 1 });
  const rows = db.rows("payuni_grant_records");
  assertEquals(rows.length, 6);
  assertEquals(rows.map((x) => x.row_seq), [0, 1, 500, 501, 1000, 1001]);
  assertEquals(rows[0].execute_amt, 1000);
  assertEquals(rows[0].fee, 28);
  assertEquals(rows[0].funds_amt, 972);
  assertEquals(rows[0].trade_date, "2026-11-01");
  assertEquals(rows[0].payment_date, "2026-10-25 12:00:00");
  assertEquals(rows.every((x) => x.match_status === "matched" && x.accommodation_id === A && x.query_date === "2026-11-01"), true);
  assertEquals((r.body as any).fetched, 6);
});

Deno.test("2. 重跑同一天 → 同鍵覆蓋、不重複；同額提領費兩筆都保留", async () => {
  const fee = grant({ MerTradeNo: "", TradeNo: "", Type: "出帳", Action: "提領手續費", ExecuteAmt: "15", Fee: "0", FundsAmt: "-15" });
  const page = flat([grant(), fee, fee], 1, 1);
  const { db, deps, alerts } = setup({ M_A: [page], M_B: [flat([], 1, 1)] });
  await handleGrantSync(deps, { action: "run" }, service);
  await handleGrantSync(deps, { action: "run" }, service);
  const rows = db.rows("payuni_grant_records");
  assertEquals(rows.length, 3);
  assertEquals(rows.filter((x) => x.match_status === "no_order").length, 2);
  assertEquals(alerts.length, 0, "no_order 不告警");
});

Deno.test("2b. 重跑時 PAYUNi 筆數比資料庫少 → 不刪資料，記在回應與告警", async () => {
  const { db, deps, alerts } = setup({ M_A: [flat([grant()], 1, 1)], M_B: [flat([], 1, 1)] }, {
    payuni_grant_records: [0, 1, 2].map((s) => ({ mer_id: "M_A", query_date: "2026-11-01", row_seq: s, accommodation_id: A, match_status: "matched" })),
  });
  const r = await handleGrantSync(deps, { action: "run" }, service);
  assertEquals(db.rows("payuni_grant_records").length, 3);
  assertEquals((r.body as any).shrink, [{ accommodation_id: A, previous_rows: 3, fetched: 1 }]);
  assertEquals(alerts.length, 1);
  assert(alerts[0].s.includes("筆數變少 1 館"));
});

Deno.test("3. 對不到 payment_transactions → unmatched；退款編號退回原付款交易；出帳無編號 → no_order", async () => {
  const page = flat([
    grant({ MerTradeNo: "NOPE-full1" }),
    grant({ MerTradeNo: "ORD2-full1-R1", Type: "出帳", Action: "退款", FundsAmt: "-500" }),
    grant({ MerTradeNo: "", TradeNo: "", Type: "出帳", Action: "退款轉匯手續費", FundsAmt: "-10" }),
    grant({ MerTradeNo: "", TradeNo: "X9", Type: "入帳" }),
  ], 1, 1);
  const { db, deps, alerts } = setup({ M_A: [page], M_B: [flat([], 1, 1)] });
  const r = await handleGrantSync(deps, { action: "run" }, service);
  const rows = db.rows("payuni_grant_records");
  assertEquals(rows.map((x) => x.match_status), ["unmatched", "matched", "no_order", "unmatched"]);
  assertEquals(rows[1].payment_tx_id, "tx-2");
  assertEquals(rows[1].order_id, "o-2");
  assertEquals(rows[0].payment_tx_id, null);
  assertEquals(rows[2].action, "退款轉匯手續費");
  assertEquals((r.body as any).unmatched, 2);
  assertEquals(alerts.length, 1);
  assert(alerts[0].s.includes("對不到 2 筆"));
});

Deno.test("4. 單館失敗（第 2 頁逾時）不影響其他館、不寫半套；整體只寄一封告警", async () => {
  const { db, deps, alerts, calls } = setup({ M_A: [flat([grant()], 1, 2), "fail"], M_B: [flat([grant({ MerID: "M_B", MerTradeNo: "ORD2-full1" })], 1, 1)] });
  const r = await handleGrantSync(deps, { action: "run" }, service);
  const body = r.body as any;
  assertEquals(body.failed, 1);
  assertEquals(body.results.find((x: any) => x.accommodation_id === A).ok, false);
  assert(body.results.find((x: any) => x.accommodation_id === A).error.includes("第 2 頁查詢失敗：TIMEOUT"));
  assertEquals(db.rows("payuni_grant_records").map((x) => x.mer_id), ["M_B"]);
  assertEquals(calls.some((c) => c.merId === undefined || c.merId === null), false, "未綁商店的館不查");
  assertEquals(alerts.length, 1);
  assert(alerts[0].s.includes("失敗 1 館"));
  assert(alerts[0].h.includes("A館"));
});

Deno.test("權限與參數：hotel_admin 403；HQ 需指定日期、30 天內；指定館只查該館", async () => {
  const { deps, calls } = setup({ M_A: [flat([grant()], 1, 1)], M_B: [flat([], 1, 1)] });
  assertEquals((await handleGrantSync(deps, { action: "run", date: "2026-11-01" }, hotel)).status, 403);
  assertEquals((await handleGrantSync(deps, { action: "run" }, hq)).status, 400);
  assertEquals((await handleGrantSync(deps, { action: "run", date: "2026-09-01" }, hq)).status, 400);
  assertEquals((await handleGrantSync(deps, { action: "list" }, hq)).status, 400);
  assertEquals((await handleGrantSync(deps, { action: "run", date: "2026-11-01", accommodation_id: "bad" }, hq)).status, 400);
  assertEquals((await handleGrantSync(deps, { action: "run", date: "2026-11-01", accommodation_id: C }, hq)).status, 404);
  const r = await handleGrantSync(deps, { action: "run", date: "2026-10-30", accommodation_id: A }, hq);
  assertEquals(r.status, 200);
  assertEquals(calls.map((c) => c.merId), ["M_A"]);
  assertEquals(calls[0].payload.QueryDate, "2026-10-30");
});
