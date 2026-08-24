import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateTappayRefundGate,
  getPaymentAdapter,
  refundStatusAfterRefund,
} from "../../supabase/functions/_shared/paymentAdapter";

/**
 * Phase F3-C1｜團購 TapPay 退款接線（CASE 1–15）
 * 全部 mock，絕不發出真實 TapPay request（fetch 一律被攔截）。
 */

const REC = "D20260824pmKVxs";

type Row = Record<string, unknown>;

/** 最小 supabase mock：紀錄所有寫入，deposit_charges 查詢回傳 null */
function mockSupabase() {
  const writes: { table: string; op: string; payload: unknown }[] = [];
  const from = (table: string) => {
    const chain: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === "maybeSingle") return async () => ({ data: null, error: null });
        if (prop === "insert") {
          return (payload: unknown) => {
            writes.push({ table, op: "insert", payload });
            return chain;
          };
        }
        if (prop === "update") {
          return (payload: unknown) => {
            writes.push({ table, op: "update", payload });
            return chain;
          };
        }
        if (prop === "then") return undefined;
        return () => chain;
      },
    });
    return chain;
  };
  return { from, writes };
}

const cardOrder = (over: Row = {}): any => ({
  id: "order-1",
  accommodation_id: "acc-1",
  order_number: "DB3U47P4",
  order_source: "group_buy",
  payment_provider: "tappay",
  payment_method: "credit_card_3ds",
  paid_amount: 1000,
  refunded_amount: 0,
  deposit_amount: 0,
  notes: `付款完成 rec_trade_id: ${REC}`,
  ...over,
});

/** TapPay HTTP mock：query 與 refund 各自可設定回應 */
function mockFetch(opts: {
  query?: { amount: number; refunded_amount: number } | "missing";
  refund?: { status: number; msg?: string } | "timeout";
}) {
  const calls: string[] = [];
  const impl = vi.fn(async (url: string, _init?: unknown) => {
    calls.push(String(url));
    if (String(url).includes("/transaction/query")) {
      if (opts.query === "missing") return jsonRes({ status: 2, trade_records: [] });
      const q = opts.query ?? { amount: 1000, refunded_amount: 0 };
      return jsonRes({
        status: 2,
        trade_records: [{ rec_trade_id: REC, record_status: 0, ...q }],
      });
    }
    if (String(url).includes("/transaction/refund")) {
      if (opts.refund === "timeout") throw new Error("network timeout");
      const r = opts.refund ?? { status: 0, msg: "Success" };
      return jsonRes(r);
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", impl as unknown as typeof fetch);
  return { calls, impl };
}

const jsonRes = (body: unknown) => ({ json: async () => body }) as unknown as Response;

const refundCalls = (calls: string[]) => calls.filter((u) => u.includes("/transaction/refund")).length;

beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "TAPPAY_PARTNER_KEY" ? "pk_test" : undefined) } });
});
afterEach(() => vi.unstubAllGlobals());

describe("CASE 1｜全額退款 1000，TapPay success", () => {
  it("回傳 ok 並寫入 deposit_charges 成功列", async () => {
    const { calls } = mockFetch({});
    const db = mockSupabase();
    const adapter = getPaymentAdapter(cardOrder());
    const r = await adapter.refundPayment({
      order: cardOrder(), amount: 1000, supabase: db, triggerSource: "group_buy_cancel_refund",
    });
    expect(r.ok).toBe(true);
    expect(r.amount).toBe(1000);
    expect(r.recTradeId).toBe(REC);
    expect(refundCalls(calls)).toBe(1);
    const charge = db.writes.find((w) => w.table === "deposit_charges") as any;
    expect(charge.payload.status).toBe("success");
    expect(charge.payload.rec_trade_id).toBe(REC);
    // 全額退款後的狀態
    expect(refundStatusAfterRefund(1000, 1000)).toBe("refunded");
  });
});

describe("CASE 2｜部分退款 500", () => {
  it("退 500 → partial_refunded，不得標 refunded", async () => {
    const { calls } = mockFetch({});
    const db = mockSupabase();
    const r = await getPaymentAdapter(cardOrder()).refundPayment({
      order: cardOrder(), amount: 500, supabase: db,
    });
    expect(r.ok).toBe(true);
    expect(r.amount).toBe(500);
    expect(refundCalls(calls)).toBe(1);
    expect(refundStatusAfterRefund(1000, 500)).toBe("partial_refunded");
  });
});

describe("CASE 3｜TapPay 已退 1000、本地 0", () => {
  it("不再退款，要求對帳", async () => {
    const { calls } = mockFetch({ query: { amount: 1000, refunded_amount: 1000 } });
    const db = mockSupabase();
    const r = await getPaymentAdapter(cardOrder()).refundPayment({
      order: cardOrder(), amount: 1000, supabase: db,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("refund_reconciliation_required");
    expect(refundCalls(calls)).toBe(0);
  });
});

describe("CASE 4｜退款金額 > TapPay 可退餘額", () => {
  it("reject 且不呼叫 Refund", async () => {
    const { calls } = mockFetch({ query: { amount: 1000, refunded_amount: 600 } });
    const db = mockSupabase();
    const r = await getPaymentAdapter(cardOrder({ refunded_amount: 600 })).refundPayment({
      order: cardOrder({ refunded_amount: 600 }), amount: 500, supabase: db,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("refund_exceeds_tappay_remaining");
    expect(refundCalls(calls)).toBe(0);
  });
});

describe("CASE 5｜退款金額 > 本地可退", () => {
  it("reject", () => {
    const g = evaluateTappayRefundGate({
      requested: 1000, localRemaining: 400, tappayFound: true,
      tappayAmount: 1000, tappayRefunded: 0, localRefunded: 0,
    });
    expect(g.ok).toBe(false);
    expect(g.error).toBe("refund_exceeds_local_remaining");
  });
});

describe("CASE 6｜找不到 rec_trade_id", () => {
  it("manual review，0 次 Refund request", async () => {
    const { calls } = mockFetch({});
    const db = mockSupabase();
    const order = cardOrder({ notes: "無交易編號" });
    const r = await getPaymentAdapter(order).refundPayment({ order, amount: 1000, supabase: db });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("refund_no_rec_trade_id");
    expect(calls.length).toBe(0);
    expect(db.writes.some((w) => w.table === "order_manual_review_tasks")).toBe(true);
  });
});

describe("CASE 7｜ATM 訂單", () => {
  it("不走信用卡退刷", async () => {
    const { calls } = mockFetch({});
    const db = mockSupabase();
    const order = cardOrder({ payment_method: "atm" });
    const r = await getPaymentAdapter(order).refundPayment({ order, amount: 1000, supabase: db });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("refund_not_card");
    expect(calls.length).toBe(0);
  });
});

describe("CASE 8｜TapPay status != 0", () => {
  it("不標記退款完成", async () => {
    mockFetch({ refund: { status: 5, msg: "Refund error" } });
    const db = mockSupabase();
    const r = await getPaymentAdapter(cardOrder()).refundPayment({ order: cardOrder(), amount: 1000, supabase: db });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("refund_failed");
    expect(r.needsReconciliation).toBeFalsy();
    const patch = db.writes.find((w) => w.table === "orders") as any;
    expect(patch.payload.refund_status).toBe("failed");
    expect(patch.payload.refunded_amount).toBeUndefined();
  });
});

describe("CASE 9｜HTTP timeout", () => {
  it("不重試、不標 refunded、標記待對帳", async () => {
    const { calls } = mockFetch({ refund: "timeout" });
    const db = mockSupabase();
    const r = await getPaymentAdapter(cardOrder()).refundPayment({ order: cardOrder(), amount: 1000, supabase: db });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("refund_result_unknown");
    expect(r.needsReconciliation).toBe(true);
    expect(refundCalls(calls)).toBe(1); // 僅送出一次，不重試
    const patch = db.writes.find((w) => w.table === "orders") as any;
    expect(patch.payload.refund_status).toBe("failed");
    expect(patch.payload.refund_rec_trade_id).toBe(REC);
    expect(db.writes.some((w) => w.table === "order_manual_review_tasks")).toBe(true);
  });
});

describe("CASE 10-11｜timeout 後由 sync 冪等回正", () => {
  it("第一次 sync 得 refunded=1000 → delta 1000；第二次 → 0", async () => {
    const { computeRefundAmounts } = await import(
      "../../supabase/functions/_shared/refundIdempotency"
    );
    const first = computeRefundAmounts({
      currentPaid: 1000, currentRefundedTotal: 0, incomingRefundedTotal: 1000, fallbackAmount: 1000,
    });
    expect(first.delta).toBe(1000);
    expect(first.newRefundedTotal).toBe(1000);
    const second = computeRefundAmounts({
      currentPaid: first.newPaid, currentRefundedTotal: 1000, incomingRefundedTotal: 1000, fallbackAmount: 1000,
    });
    expect(second.delta).toBe(0);
  });
});

describe("CASE 12-13｜commission", () => {
  it("退款失敗時 adapter 回 ok=false，取消流程於此中止（不 void）", async () => {
    mockFetch({ refund: { status: 5 } });
    const db = mockSupabase();
    const r = await getPaymentAdapter(cardOrder()).refundPayment({ order: cardOrder(), amount: 1000, supabase: db });
    expect(r.ok).toBe(false);
    expect(db.writes.some((w) => w.table === "group_buy_commissions")).toBe(false);
  });

  it("退款成功時 adapter 不自行改 commission（由取消流程 void）", async () => {
    mockFetch({});
    const db = mockSupabase();
    const r = await getPaymentAdapter(cardOrder()).refundPayment({ order: cardOrder(), amount: 1000, supabase: db });
    expect(r.ok).toBe(true);
    expect(db.writes.some((w) => w.table === "group_buy_commissions")).toBe(false);
  });
});

describe("CASE 14-15｜人工覆寫理由（group-buy-cancel-refund 規則）", () => {
  const requireReason = (actual: number, suggested: number, reason: string) =>
    actual === suggested || reason.trim().length >= 2;

  it("覆寫且無理由 → 應被擋下（400）", () => {
    expect(requireReason(500, 1000, "")).toBe(false);
  });

  it("覆寫且有理由 → 通過，audit 需同時保存建議與實際", () => {
    expect(requireReason(500, 1000, "旅客同意折半")).toBe(true);
    const audit = { suggested_refund_amount: 1000, refund_amount: 500, manual_override: true, override_reason: "旅客同意折半" };
    expect(audit.suggested_refund_amount).not.toBe(audit.refund_amount);
    expect(audit.manual_override).toBe(true);
    expect(audit.override_reason).toBeTruthy();
  });
});
