import { describe, it, expect } from "vitest";
import snapshot from "./__snapshots__/rpc-whitelists.json";
import {
  buildDepositChargeSuccessPatch,
  buildDepositChargeFailurePatch,
  buildTappayNotifySuccessPatch,
  buildTappayNotifyFailurePatch,
  buildTappayRefundSuccessPatch,
  buildTappayRefundFailurePatch,
  buildWebhookRefundSuccessPatch,
  buildWebhookRefundFailurePatch,
  buildWebhookChargeSuccessPatch,
  buildWebhookChargeFailurePatch,
  buildCancelRefundFailurePatch,
  buildCancelOrderPatch,
} from "../../../../supabase/functions/_shared/patchBuilders";

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
  {
    name: "webhook 退款成功",
    patch: buildWebhookRefundSuccessPatch({ refundedTotal: 5000, newPaid: 0, notes: "n" }),
  },
  { name: "webhook 退款失敗", patch: buildWebhookRefundFailurePatch({ notes: "n" }) },
  {
    name: "webhook 扣款成功（含入住扣款）",
    patch: buildWebhookChargeSuccessPatch({
      newPaid: 12000, newStatus: "paid", roomChargeActive: true,
      roomChargeAtIso: "x", recTradeId: "R1", notes: "n",
    }),
  },
  {
    name: "webhook 扣款失敗（含入住扣款）",
    patch: buildWebhookChargeFailurePatch({
      paymentStatus: "unpaid", roomChargeActive: true, errMsg: "E", notes: "n",
    }),
  },
  { name: "取消退刷失敗", patch: buildCancelRefundFailurePatch({ recTradeId: "R1" }) },
  {
    name: "取消訂單（自動退刷全額）",
    patch: buildCancelOrderPatch({
      nowIso: "x", notes: "n", refundAction: "auto_refund", refundSucceeded: true,
      paidAmount: 8000, refundAmount: 8000, recTradeId: "R1",
    }),
  },
  {
    name: "取消訂單（手動退款）",
    patch: buildCancelOrderPatch({
      nowIso: "x", notes: "n", refundAction: "mark_manual_refund", refundSucceeded: false,
      paidAmount: 8000, refundAmount: 8000, recTradeId: null,
    }),
  },
  {
    name: "取消訂單（不退款）",
    patch: buildCancelOrderPatch({
      nowIso: "x", notes: "n", refundAction: "no_refund", refundSucceeded: false,
      paidAmount: 0, refundAmount: 0, recTradeId: null,
    }),
  },
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

// ---- update_order_fields_v1（後台前端 8 個呼叫點）----
import {
  buildInlineEditPatch,
  buildAdminCancelPatch,
  buildCheckinActionPatch,
  buildAdminPriceEditPatch,
  buildDealDateEditPatch,
  buildImportDiscountCodePatch,
  buildManualReviewGuestCountPatch,
  buildManualReviewRepricingPatch,
  buildManualReviewNotePatch,
  buildOrderSourceDialogPatch,
  buildOrderStatusDialogPatch,
  buildPaymentStatusDialogPatch,
  buildPriceEditDialogPatch,
} from "@/lib/orderFieldPatches";

const FIELDS_V1 = new Set(snapshot.functions.update_order_fields_v1.fields);

const inlineForm = {
  guest_name: "王小明", guest_phone: "0912345678", guest_email: "a@b.c",
  guest_address: "台北市", guest_gender: "male", guest_nationality: "台灣",
  guest_count: 4, order_source: "website",
  lock_whole_building: false, order_status: "confirmed",
  deposit_payment_method: "none", balance_payment_method: "cash",
  meal_plan: "none", room_type_id: "rt-1", discount_code: "168168",
  discount_amount: 0, deposit_amount: 3000, addon_total: 0,
  pet_count: 0, pet_plan_price: 0, meal_plan_details: [], meal_plan_total: 0,
  custom_addon_details: [],
};
const inlineOrder = {
  payment_status: "unpaid", total_price: 10000, discount_amount: 0,
  discount_code: null, final_price: 10000,
};
const inlineBase = {
  order: inlineOrder, form: inlineForm, isOlivia: false, isHoldOrder: false,
  effPaymentStatus: "unpaid", effPaidAmount: 0, savedTotalPrice: 12000,
  editFinalPriceCalc: 12000, originalAddonTotal: 0, finalNotes: "備註",
  auditNoteLine: null as string | null, nowIso: "2026-09-10T05:00:00.000Z",
  originalOrderStatus: "pending",
};

const fieldsCases: Array<{ name: string; patch: Record<string, unknown> }> = [
  { name: "訂單詳情內嵌編輯（未付款）", patch: buildInlineEditPatch(inlineBase) },
  {
    name: "訂單詳情內嵌編輯（已結清＋稽核行＋取消）",
    patch: buildInlineEditPatch({
      ...inlineBase,
      order: { ...inlineOrder, payment_status: "paid" },
      form: { ...inlineForm, order_status: "cancelled" },
      auditNoteLine: "🔒[金額異動]",
      isHoldOrder: true,
    }),
  },
  { name: "取消訂單", patch: buildAdminCancelPatch({ cancelledAtIso: "x" }) },
  { name: "入住", patch: buildCheckinActionPatch({ action: "checkin", nowIso: "x", hasCheckedInAt: false }) },
  { name: "退房（補入住時間）", patch: buildCheckinActionPatch({ action: "checkout", nowIso: "x", hasCheckedInAt: false }) },
  { name: "撤銷退房", patch: buildCheckinActionPatch({ action: "undo_checkout", nowIso: "x", hasCheckedInAt: true }) },
  {
    name: "訂單詳情金額編輯",
    patch: buildAdminPriceEditPatch({ totalPrice: 1, discountAmount: 0, finalPrice: 1, depositAmount: 0, paidAmount: 0, paymentStatus: "unpaid", notes: null }),
  },
  { name: "成交日修改", patch: buildDealDateEditPatch({ orderDateIso: "x" }) },
  { name: "匯入折扣碼", patch: buildImportDiscountCodePatch({ discountCode: "A" }) },
  { name: "人工審核人數", patch: buildManualReviewGuestCountPatch({ guestCount: 3 }) },
  { name: "人工審核改價", patch: buildManualReviewRepricingPatch({ finalPrice: 100 }) },
  { name: "人工審核備註", patch: buildManualReviewNotePatch({ notes: "n" }) },
  { name: "來源變更（屋主提供）", patch: buildOrderSourceDialogPatch({ orderSource: "owner_provided", notes: "n" }) },
  {
    name: "狀態變更（確認＋保留單）",
    patch: buildOrderStatusDialogPatch({ selectedStatus: "confirmed", currentStatus: "pending", notes: "n", nowIso: "x", isHoldOrder: true }),
  },
  {
    name: "狀態變更（取消）",
    patch: buildOrderStatusDialogPatch({ selectedStatus: "cancelled", currentStatus: "confirmed", notes: "n", nowIso: "x", isHoldOrder: false }),
  },
  { name: "付款狀態變更", patch: buildPaymentStatusDialogPatch({ paymentStatus: "paid", paidAmount: 100, notes: "n" }) },
  {
    name: "金額編輯對話框",
    patch: buildPriceEditDialogPatch({ totalPrice: 1, discountAmount: 0, finalPrice: 1, depositAmount: 0, paidAmount: 0, paymentStatus: "paid", customAddonDetails: [], discountCode: " 168168 ", mealPlanDetails: [], notes: "n" }),
  },
];

describe("update_order_fields_v1 呼叫端欄位契約", () => {
  it.each(fieldsCases)("$name 送出的欄位全部在白名單內", ({ patch }) => {
    const offenders = Object.keys(patch).filter((k) => !FIELDS_V1.has(k));
    expect(offenders).toEqual([]);
  });

  it("白名單快照本身不是空的", () => {
    expect(FIELDS_V1.size).toBeGreaterThan(40);
  });
});

describe("抽取後條件邏輯未改變", () => {
  it("已結清訂單不得帶入 discount_amount／discount_code（改走專用對話框）", () => {
    const p = buildInlineEditPatch({ ...inlineBase, order: { ...inlineOrder, payment_status: "paid", discount_code: "OLD" } });
    expect("discount_amount" in p).toBe(false);
    expect("discount_code" in p).toBe(false);
  });
  it("金額完全未動時不帶 final_price", () => {
    const p = buildInlineEditPatch({ ...inlineBase, savedTotalPrice: 10000, editFinalPriceCalc: 10000 });
    expect("final_price" in p).toBe(false);
  });
  it("狀態未變更時不帶任何時間戳", () => {
    const p = buildInlineEditPatch({ ...inlineBase, originalOrderStatus: "confirmed" });
    expect(["confirmed_at", "checked_in_at", "checked_out_at", "cancelled_at", "order_date"].some((k) => k in p)).toBe(false);
  });
  it("稽核行會接在備註之後", () => {
    const p = buildInlineEditPatch({ ...inlineBase, auditNoteLine: "🔒L" });
    expect(p.notes).toBe("備註\n🔒L");
  });
});
