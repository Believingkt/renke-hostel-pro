import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  extractRecTradeIdFromNotes,
  isCardPaidOrder,
  resolveSyncRecTradeId,
  type RefundableOrder,
} from "../../../../supabase/functions/_shared/orderRefund";

/**
 * Phase F2-F 三、tappay-sync-refund CASE 1–6（純 mock，絕不呼叫 TapPay）
 *
 * resolveSyncRecTradeId 只做「查詢用」的原始交易編號解析：
 *   refund_rec_trade_id → room_charge_rec_trade_id → deposit_charges(成功 charge) → notes(legacy)
 * refund_rec_trade_id 由 buildRefundPatch 寫入 outcome.recTradeId，
 * 而 outcome.recTradeId 來自 resolveCardRecTradeId()＝「原付款交易編號」（退款所指向的原交易），
 * 並非 TapPay 另發的退款交易識別，因此可安全用於 Query。
 */

// ---- 最小 supabase mock：只支援 deposit_charges 的鏈式查詢 ----
function mockSupabase(charge: { rec_trade_id: string } | null) {
  const calls: string[] = [];
  const builder: Record<string, unknown> = {};
  const chain = new Proxy(builder, {
    get(_t, prop: string) {
      if (prop === "maybeSingle") return async () => ({ data: charge, error: null });
      if (prop === "then") return undefined;
      return (..._args: unknown[]) => chain;
    },
  });
  return {
    calls,
    from: (table: string) => {
      calls.push(table);
      return chain;
    },
  };
}

const cardOrder = (over: Partial<RefundableOrder> = {}): RefundableOrder => ({
  id: "o1",
  accommodation_id: "a1",
  order_number: "AB12CD34",
  payment_method: "credit_card",
  ...over,
});

describe("CASE 1-6：tappay-sync-refund rec_trade_id 解析", () => {
  it("CASE 1：notes 有原交易編號（無其他來源）→ 解析成功，source=notes", async () => {
    const sb = mockSupabase(null);
    const r = await resolveSyncRecTradeId(
      sb,
      cardOrder({ notes: "客人備註\n[TapPay 交易: TP2026NOTES01]" }),
    );
    expect(r.recTradeId).toBe("TP2026NOTES01");
    expect(r.source).toBe("notes");
  });

  it("CASE 2：notes 無、room_charge_rec_trade_id 有 → 優先使用欄位", async () => {
    const sb = mockSupabase(null);
    const r = await resolveSyncRecTradeId(
      sb,
      cardOrder({ notes: null, room_charge_rec_trade_id: "TP_ROOMCHARGE_1" }),
    );
    expect(r.recTradeId).toBe("TP_ROOMCHARGE_1");
    expect(r.source).toBe("room_charge_rec_trade_id");
  });

  it("CASE 3：notes / room_charge 皆無，deposit_charges 有成功刷卡 → 使用該編號", async () => {
    const sb = mockSupabase({ rec_trade_id: "TP_DEPOSIT_1" });
    const r = await resolveSyncRecTradeId(sb, cardOrder({ notes: "無編號的備註" }));
    expect(r.recTradeId).toBe("TP_DEPOSIT_1");
    expect(r.source).toBe("deposit_charges");
    expect(sb.calls).toContain("deposit_charges");
  });

  it("CASE 4：所有可靠來源皆無 → 不猜測，回 no_rec_trade_id（呼叫端轉人工）", async () => {
    const sb = mockSupabase(null);
    const r = await resolveSyncRecTradeId(sb, cardOrder({ notes: "沒有任何交易編號" }));
    expect(r.recTradeId).toBeNull();
    expect(r.source).toBeNull();
    expect(r.reason).toBe("no_rec_trade_id");
  });

  it("CASE 5：ATM 訂單 → not_card，不進入信用卡對帳（且不查 deposit_charges）", async () => {
    const sb = mockSupabase({ rec_trade_id: "TP_SHOULD_NOT_BE_USED" });
    const atm: RefundableOrder = {
      id: "o2",
      accommodation_id: "a1",
      order_number: "AT12CD34",
      payment_method: "atm",
      atm_rec_trade_id: "TP_ATM_1",
      notes: "[TapPay 交易: TP_ATM_1]",
    };
    expect(isCardPaidOrder(atm)).toBe(false);
    const r = await resolveSyncRecTradeId(sb, atm);
    expect(r.recTradeId).toBeNull();
    expect(r.reason).toBe("not_card");
    expect(sb.calls).not.toContain("deposit_charges");
  });

  it("CASE 5b：notes 內若僅有 ATM 交易編號，不得被當成刷卡交易", async () => {
    const sb = mockSupabase(null);
    const r = await resolveSyncRecTradeId(
      sb,
      cardOrder({ notes: "[TapPay 交易: TP_ATM_9]", atm_rec_trade_id: "TP_ATM_9" }),
    );
    expect(r.recTradeId).toBeNull();
    expect(r.reason).toBe("no_rec_trade_id");
  });

  it("refund_rec_trade_id（＝原付款交易）優先於其他來源", async () => {
    const sb = mockSupabase({ rec_trade_id: "TP_DEPOSIT_1" });
    const r = await resolveSyncRecTradeId(
      sb,
      cardOrder({
        refund_rec_trade_id: "TP_ORIGINAL_1",
        room_charge_rec_trade_id: "TP_ROOMCHARGE_1",
        notes: "[TapPay 交易: TP_NOTES_1]",
      }),
    );
    expect(r.recTradeId).toBe("TP_ORIGINAL_1");
    expect(r.source).toBe("refund_rec_trade_id");
  });

  it("notes 多筆交易編號 → 取最後一筆（最新）", () => {
    expect(extractRecTradeIdFromNotes("rec_trade_id: OLD1\nrec_trade_id: NEW2")).toBe("NEW2");
    expect(extractRecTradeIdFromNotes(null)).toBeNull();
  });
});

// ---- CASE 6：同步冪等（規格鏡像 + 對照 index.ts 實際實作） ----
const SYNC_SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/tappay-sync-refund/index.ts"),
  "utf8",
);

const SYNC_MARKER_RE = /\[TAPPAY_SYNC_REFUNDED:(\d+)\]/g;
function extractLatestSyncedRefund(notes: string | null): number {
  if (!notes) return 0;
  let last = 0;
  for (const m of notes.matchAll(SYNC_MARKER_RE)) last = parseInt(m[1], 10) || 0;
  return last;
}
function applySync(order: { notes: string | null; paid_amount: number; final_price: number }, tappayRefundedTotal: number) {
  const prev = extractLatestSyncedRefund(order.notes);
  const delta = Math.max(0, tappayRefundedTotal - prev);
  if (delta <= 0 && tappayRefundedTotal === prev) {
    return { changed: false, paid_amount: order.paid_amount, notes: order.notes, delta: 0 };
  }
  const paid = Math.max(0, order.paid_amount - delta);
  return {
    changed: true,
    delta,
    paid_amount: paid,
    notes: `${order.notes ?? ""}\n[TapPay 同步] [TAPPAY_SYNC_REFUNDED:${tappayRefundedTotal}]`,
  };
}

describe("CASE 6：同一筆 TapPay refunded_amount 連續同步兩次為 no-op", () => {
  it("index.ts 使用同一組 marker / delta 公式", () => {
    expect(SYNC_SRC).toContain("[TAPPAY_SYNC_REFUNDED:");
    expect(SYNC_SRC).toContain("Math.max(0, refundedAmountTotal - prevSynced)");
    expect(SYNC_SRC).toContain("Math.max(0, currentPaid - delta)");
    // 只查詢、永不呼叫 Refund API
    expect(SYNC_SRC).toContain("/tpc/transaction/query");
    expect(SYNC_SRC).not.toContain("/tpc/transaction/refund");
  });

  it("第一次同步扣減，第二次相同金額為 no-op", () => {
    const order = { notes: "原始備註", paid_amount: 6000, final_price: 20000 };
    const first = applySync(order, 4200);
    expect(first.changed).toBe(true);
    expect(first.delta).toBe(4200);
    expect(first.paid_amount).toBe(1800);

    const second = applySync(
      { notes: first.notes, paid_amount: first.paid_amount, final_price: 20000 },
      4200,
    );
    expect(second.changed).toBe(false);
    expect(second.delta).toBe(0);
    expect(second.paid_amount).toBe(1800);
  });

  it("TapPay 之後又多退一筆 → 只補差額", () => {
    const s1 = applySync({ notes: null, paid_amount: 6000, final_price: 20000 }, 4200);
    const s2 = applySync({ notes: s1.notes, paid_amount: s1.paid_amount, final_price: 20000 }, 6000);
    expect(s2.delta).toBe(1800);
    expect(s2.paid_amount).toBe(0);
    const s3 = applySync({ notes: s2.notes, paid_amount: s2.paid_amount, final_price: 20000 }, 6000);
    expect(s3.changed).toBe(false);
    expect(s3.paid_amount).toBe(0);
  });
});

// ---- 四、Timeout 救援鏈（純推導，禁止真實呼叫） ----
describe("Timeout → manual review → sync 回正 → 再同步 no-op", () => {
  it("第一次 Refund timeout：不標 refunded、不取消訂單、建人工待辦、不自動重送", async () => {
    const { buildRefundPatch } = await import("../../../../supabase/functions/_shared/orderRefund");
    const timeoutOutcome = {
      attempted: true,
      success: false,
      refunded: 0,
      recTradeId: "TP_ORIGINAL_1",
      reason: "tappay_error" as const,
      msg: "request timeout",
      note: "timeout",
    };
    const patch = buildRefundPatch(timeoutOutcome, 6000) as Record<string, unknown>;
    expect(patch.refund_status).toBe("failed");
    expect(patch.refunded_amount).toBeUndefined();
    expect(patch.refunded_at).toBeUndefined();
    // 保留原交易編號供後續 Query 對帳
    expect(patch.refund_rec_trade_id).toBe("TP_ORIGINAL_1");
    // 程式碼層面確認：refundOrderCard 不含任何重試迴圈
    const src = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/orderRefund.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/retry|for\s*\(let attempt/i);
  });

  it("管理員 sync：resolver 找到原交易 → Query 回累計退款 → 回寫並轉為 refunded", async () => {
    const sb = mockSupabase(null);
    const order = cardOrder({ refund_rec_trade_id: "TP_ORIGINAL_1", notes: "退款失敗紀錄" });
    const resolution = await resolveSyncRecTradeId(sb, order);
    expect(resolution.recTradeId).toBe("TP_ORIGINAL_1");

    // mock TapPay Query 回應（不發網路請求）
    const tappayQuery = vi.fn(async () => ({ status: 0, trade_records: [{ amount: 6000, refunded_amount: 6000, record_status: 1 }] }));
    const record = (await tappayQuery()).trade_records[0];
    const synced = applySync({ notes: "退款失敗紀錄", paid_amount: 6000, final_price: 6000 }, record.refunded_amount);
    expect(synced.delta).toBe(6000);
    expect(synced.paid_amount).toBe(0);
    const paymentStatus = synced.paid_amount <= 0
      ? "refunded"
      : synced.paid_amount < 6000
      ? "partial_refunded"
      : "paid";
    expect(paymentStatus).toBe("refunded");
    expect(tappayQuery).toHaveBeenCalledTimes(1);

    const again = applySync({ notes: synced.notes, paid_amount: synced.paid_amount, final_price: 6000 }, 6000);
    expect(again.changed).toBe(false);
  });
});
