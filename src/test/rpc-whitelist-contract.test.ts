import { describe, it, expect } from "vitest";
import snapshot from "./__snapshots__/rpc-whitelists.json";
import {
  buildDepositChargeSuccessPatch,
  buildDepositChargeFailurePatch,
  buildTappayNotifySuccessPatch,
  buildTappayNotifyFailurePatch,
  buildTappayRefundSuccessPatch,
  buildTappayRefundFailurePatch,
} from "../../supabase/functions/_shared/patchBuilders";

const CONTEXT_FIELDS = new Set(snapshot.functions.update_order_with_context.fields);

/** 每個 case 直接執行呼叫端的 patch builder，取回傳物件的 key 去比對白名單。 */
const cases: Array<{ name: string; patch: Record<string, unknown> }> = [
  {
    name: "charge-deposit 扣款成功",
    patch: buildDepositChargeSuccessPatch({
      newChargedAmount: 3000,
      chargedAtIso: "2026-09-10T05:00:00.000Z",
      newStatus: "charged",
    }),
  },
  { name: "charge-deposit 扣款失敗", patch: buildDepositChargeFailurePatch() },
  {
    name: "tappay-notify 付款成功（未確認→自動確認）",
    patch: buildTappayNotifySuccessPatch({
      newPaymentStatus: "paid",
      newPaidAmount: 12000,
      isAtm: false,
      newNotes: "note",
      currentOrderStatus: "pending",
      confirmedAtIso: "2026-09-10T05:00:00.000Z",
    }),
  },
  {
    name: "tappay-notify 付款成功（已確認，不含 order_status）",
    patch: buildTappayNotifySuccessPatch({
      newPaymentStatus: "deposit_paid",
      newPaidAmount: 3000,
      isAtm: true,
      newNotes: "note",
      currentOrderStatus: "confirmed",
      confirmedAtIso: "2026-09-10T05:00:00.000Z",
    }),
  },
  { name: "tappay-notify 付款失敗", patch: buildTappayNotifyFailurePatch({ newNotes: "note" }) },
  {
    name: "tappay-refund-notify 退款成功",
    patch: buildTappayRefundSuccessPatch({
      newPaymentStatus: "refunded",
      newPaidAmount: 0,
      newNotes: "note",
    }),
  },
  { name: "tappay-refund-notify 退款失敗", patch: buildTappayRefundFailurePatch({ newNotes: "note" }) },
];

describe("update_order_with_context 呼叫端欄位契約", () => {
  it.each(cases)("$name 送出的欄位全部在白名單內", ({ patch }) => {
    const offenders = Object.keys(patch).filter((k) => !CONTEXT_FIELDS.has(k));
    expect(offenders).toEqual([]);
  });

  it("白名單快照本身不是空的（避免比對永遠通過）", () => {
    expect(CONTEXT_FIELDS.size).toBeGreaterThan(40);
  });
});

describe("條件欄位的實際行為未被抽取改變", () => {
  it("已確認訂單不應帶入 order_status / confirmed_at", () => {
    const p = buildTappayNotifySuccessPatch({
      newPaymentStatus: "paid",
      newPaidAmount: 1,
      isAtm: false,
      newNotes: "n",
      currentOrderStatus: "confirmed",
      confirmedAtIso: "x",
    });
    expect(Object.keys(p).sort()).toEqual(
      ["balance_payment_method", "notes", "paid_amount", "payment_method", "payment_status"],
    );
  });

  it("非 paid 狀態時 balance_payment_method 為 null", () => {
    const p = buildTappayNotifySuccessPatch({
      newPaymentStatus: "partial",
      newPaidAmount: 1,
      isAtm: true,
      newNotes: "n",
      currentOrderStatus: "confirmed",
      confirmedAtIso: "x",
    });
    expect(p.balance_payment_method).toBeNull();
  });
});
