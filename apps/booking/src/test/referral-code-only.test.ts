import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildReferralCodeRpcArgs,
  callUpdateOrderReferralCode,
  canShowReferralCodeEntry,
  paidDialogBlockReason,
  isEditFormDirty,
  UNSAVED_EDIT_MESSAGE,
  REFERRAL_SETTLEMENT,
} from "@/lib/paidDiscountEdit";
import { checkReferralCode, validatePaidDiscountCode, CODE_NOT_APPLICABLE_MESSAGE } from "@/lib/paidDiscountCodeValidation";
import { buildInlineEditPatch, SETTLED_LOCKED_FIELDS } from "@/lib/orderFieldPatches";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const MONEY_KEYS = ["total_price", "discount_amount", "final_price", "paid_amount", "deposit_amount", "pet_plan_price", "meal_plan_total", "meal_plan_details", "custom_addon_details", "pet_count", "discount_code"];
const evalRow = (status: string, extra: Record<string, unknown> = {}) => ({
  data: [{ status, discount_type: null, discount_value: null, message: null, applicable_names: null, scope_empty: false, ...extra }],
  error: null,
});
const vin = { code: "ra98", accommodationId: "acc", roomFee: 10000, roomTypeId: null, checkInDate: "2026-11-01", pricingTemplateId: "tpl" };

describe("只補記推薦碼：RPC 參數不含任何金額", () => {
  const base = { orderId: "o1", expectedUpdatedAt: "2026-10-01T00:00:00Z", reason: "補記網紅業績", discountCode: " ra98 ", confirmed: true };
  it("只送碼、原因、版本、確認；碼轉大寫", () => {
    const args = buildReferralCodeRpcArgs(base);
    expect(Object.keys(args).sort()).toEqual(["p_confirmed", "p_discount_code", "p_expected_updated_at", "p_order_id", "p_reason", "p_risk_acknowledged"]);
    expect(args.p_discount_code).toBe("RA98");
    expect(Object.keys(args).filter((a) => /amount|price|addon|deposit|paid|settlement|meal|pet/.test(a))).toEqual([]);
  });
  it("移除推薦碼 → p_discount_code = null", () => {
    expect(buildReferralCodeRpcArgs({ ...base, discountCode: null }).p_discount_code).toBeNull();
    expect(buildReferralCodeRpcArgs({ ...base, discountCode: "  " }).p_discount_code).toBeNull();
  });
  it("原因必填、需二次確認，否則不呼叫 RPC", async () => {
    const rpc = vi.fn();
    await expect(callUpdateOrderReferralCode({ rpc } as any, { ...base, reason: " " })).rejects.toThrow("請填寫修改原因");
    await expect(callUpdateOrderReferralCode({ rpc } as any, { ...base, confirmed: false })).rejects.toThrow("二次確認");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("呼叫 update_order_referral_code_v1；差額處理固定純資料校正", async () => {
    const rpc = vi.fn(async () => ({ data: { changed: true, order_id: "o1", final_price: 10000 }, error: null }));
    await callUpdateOrderReferralCode({ rpc } as any, base);
    expect((rpc.mock.calls[0] as unknown[])[0]).toBe("update_order_referral_code_v1");
    expect(REFERRAL_SETTLEMENT).toBe("data_only");
  });
});

describe("只補記推薦碼：applied／not_applicable／invalid", () => {
  it.each([
    ["applied", { status: "ok", code: "RA98", evaluation: "applied" }],
    ["not_applicable", { status: "ok", code: "RA98", evaluation: "not_applicable" }],
    ["invalid", { status: "invalid", code: "RA98", message: "折扣碼無效" }],
  ])("%s", async (st, exp) => {
    const rpc = vi.fn(async () => evalRow(st, st === "invalid" ? { message: "折扣碼無效" } : {}));
    expect(await checkReferralCode({ rpc } as any, vin)).toEqual(exp);
    expect((rpc.mock.calls[0] as unknown[])[0]).toBe("evaluate_discount_code");
  });
  it("空碼不呼叫 RPC", async () => {
    const rpc = vi.fn();
    expect((await checkReferralCode({ rpc } as any, { ...vin, code: " " })).status).toBe("invalid");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("「使用折扣碼」遇到 not_applicable 改顯示引導訊息", () => {
  it("not_applicable → 引導改用只補記推薦碼", async () => {
    const rpc = vi.fn(async (fn: string) =>
      fn === "validate_discount_code" ? { data: [{ is_valid: false, message: "此折扣碼不適用於所選房價方案" }], error: null } : evalRow("not_applicable"));
    const res = await validatePaidDiscountCode({ rpc } as any, vin);
    expect(res).toEqual({ status: "invalid", code: "RA98", message: CODE_NOT_APPLICABLE_MESSAGE });
    expect(CODE_NOT_APPLICABLE_MESSAGE).toBe("此碼不適用此方案的折扣，如需記錄網紅業績請改用『只補記推薦碼』");
  });
  it("真的無效 → 維持原本訊息", async () => {
    const rpc = vi.fn(async (fn: string) =>
      fn === "validate_discount_code" ? { data: [{ is_valid: false, message: "折扣碼已過期" }], error: null } : evalRow("invalid", { message: "折扣碼無效" }));
    expect(await validatePaidDiscountCode({ rpc } as any, vin)).toEqual({ status: "invalid", code: "RA98", message: "折扣碼已過期" });
  });
  it("適用 → 照舊只呼叫一次 validate_discount_code", async () => {
    const rpc = vi.fn(async () => ({ data: [{ is_valid: true, discount_type: "percentage", discount_value: 10 }], error: null }));
    expect((await validatePaidDiscountCode({ rpc } as any, vin)).status).toBe("valid");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("入口顯示：已付訂金也可補記推薦碼", () => {
  const ok = { ordersLevel: "editable" as const, currentAccommodationId: "acc" };
  it.each([["deposit_paid", true], ["paid", true], ["fully_paid", true], ["unpaid", false], ["pending_payment", false]])("%s → %s", (ps, exp) => {
    expect(canShowReferralCodeEntry({ ...ok, order: { accommodation_id: "acc", payment_status: ps } })).toBe(exp);
  });
  it("沒有編輯權限或不同館 → 不顯示", () => {
    expect(canShowReferralCodeEntry({ ordersLevel: "readonly", currentAccommodationId: "acc", order: { accommodation_id: "acc", payment_status: "paid" } })).toBe(false);
    expect(canShowReferralCodeEntry({ ...ok, order: { accommodation_id: "other", payment_status: "paid" } })).toBe(false);
  });
});

describe("編輯模式：未儲存修改時不可開啟金額對話框", () => {
  it("守門規則", () => {
    expect(paidDialogBlockReason({ isEditing: true, hasUnsavedEdits: true })).toBe(UNSAVED_EDIT_MESSAGE);
    expect(UNSAVED_EDIT_MESSAGE).toBe("請先儲存或取消編輯");
    expect(paidDialogBlockReason({ isEditing: true, hasUnsavedEdits: false })).toBeNull();
    expect(paidDialogBlockReason({ isEditing: false, hasUnsavedEdits: false })).toBeNull();
  });
  it("表單與快照比對", () => {
    const f = { a: 1, b: "x" };
    expect(isEditFormDirty(null, f)).toBe(false);
    expect(isEditFormDirty(JSON.stringify(f), { ...f })).toBe(false);
    expect(isEditFormDirty(JSON.stringify(f), { ...f, b: "y" })).toBe(true);
  });
});

describe("編輯模式：已結清訂單存檔 payload 不含金額欄位", () => {
  const form = {
    guest_name: "王小明", guest_phone: "0912345678", guest_email: "a@b.c", guest_address: "台北市", guest_gender: "male",
    guest_nationality: "台灣", guest_count: 4, order_source: "website", lock_whole_building: false, order_status: "confirmed",
    deposit_payment_method: "none", balance_payment_method: "cash", meal_plan: "none", room_type_id: "rt-1",
    discount_code: "TAMPER", discount_amount: 999, deposit_amount: 1, addon_total: 0, pet_count: 2, pet_plan_price: 800,
    meal_plan_details: [{ x: 1 }], meal_plan_total: 500, custom_addon_details: [{ total: 300 }],
  };
  const input = (ps: string) => ({
    order: { payment_status: ps, total_price: 10000, discount_amount: 0, discount_code: "RA98", final_price: 10000 },
    form, isOlivia: false, isHoldOrder: false, effPaymentStatus: ps, effPaidAmount: 1,
    savedTotalPrice: 1, editFinalPriceCalc: 1, originalAddonTotal: 0, finalNotes: "備註",
    auditNoteLine: null, nowIso: "2026-10-01T00:00:00Z", originalOrderStatus: "confirmed",
  });
  it.each(["paid", "fully_paid"])("%s：金額、折扣、加購、訂金、已付一律不送", (ps) => {
    const patch = buildInlineEditPatch(input(ps));
    SETTLED_LOCKED_FIELDS.forEach((k) => expect(patch).not.toHaveProperty(k));
    MONEY_KEYS.forEach((k) => expect(patch).not.toHaveProperty(k));
    expect(patch.guest_name).toBe("王小明");
  });
  it("deposit_paid 維持現狀（仍送金額欄位）", () => {
    const patch = buildInlineEditPatch(input("deposit_paid"));
    expect(patch).toHaveProperty("total_price");
    expect(patch).toHaveProperty("paid_amount");
    expect(patch).toHaveProperty("deposit_amount");
  });
});

describe("原始碼契約", () => {
  const dialog = read("apps/booking/src/components/orders/PaidAmountEditDialog.tsx");
  const od = read("apps/booking/src/pages/OrderDetail.tsx");
  const mig = read("supabase/migrations/20261029090000_referral_code_only.sql");
  it("對話框第 4 個選項、差額處理鎖定、成功後通知 kol-webhook（帶舊碼）", () => {
    expect(dialog).toContain('{ v: "referral", l: "只補記推薦碼（不改金額）" }');
    expect(dialog).toMatch(/disabled=\{isReferral\}/);
    expect(dialog).toMatch(/setSettlement\(isReferral \? REFERRAL_SETTLEMENT : ""\)/);
    expect(dialog).toMatch(/invoke\("kol-webhook", \{\s*body: \{ order_id: snap\.id, trigger_type: "update", previous_discount_code: oldCode \},/);
    expect(dialog).toContain("移除推薦碼");
    expect(dialog).not.toMatch(/from\("orders"\)[\s\S]{0,80}\.update\(/);
  });
  it("訂單詳情：編輯模式仍顯示按鈕、未存提示、已付訂金補記入口", () => {
    expect(od).toContain("{(showPaidDiscountEntry || showPaidAddonEntry || showReferralOnlyEntry) && (");
    expect(od).not.toContain("{(showPaidDiscountEntry || showPaidAddonEntry) && !isEditing && (");
    expect(od.match(/onClick=\{\(\) => openPaidAmountDialog\("(discount|addon)"\)\}/g)?.length).toBe(3);
    expect(od).toMatch(/const blocked = paidDialogBlockReason\(\{ isEditing, hasUnsavedEdits \}\);\s*if \(blocked\) \{\s*toast\(\{ title: blocked/);
    expect(od).toContain("onSuccess={() => { if (isEditing) setIsEditing(false); fetchOrder(); }}");
  });
  it("訂單詳情：已結清時金額欄位唯讀", () => {
    expect(od).toContain("const settledAmountLocked = isSettledPaymentStatus(order.payment_status);");
    expect(od).toContain("disabled={settledAmountLocked} value={editForm.total_price}");
    expect(od).toContain("disabled={settledAmountLocked} value={editForm.discount_amount}");
    expect(od).toContain('placeholder="選填" disabled={settledAmountLocked} value={editForm.discount_code}');
    expect(od).toContain("disabled={settledAmountLocked} value={editForm.paid_amount}");
    expect(od).toContain("const canEditSplit = isEditing && !settledAmountLocked;");
    expect(od).toContain('<fieldset disabled={settledAmountLocked} className="contents" data-testid="order-edit-addon-fieldset">');
  });
  it("migration：只 UPDATE discount_code，且金額前後比對", () => {
    const upd = mig.match(/UPDATE public\.orders\s+SET([\s\S]*?)WHERE/)![1];
    expect(upd.replace(/\s+/g, " ").trim()).toBe("discount_code = v_new_code, updated_at = now()");
    expect(mig).toContain("IF v_after_money IS DISTINCT FROM v_before_money THEN");
    expect(mig).toMatch(/NOT IN \('deposit_paid', 'paid', 'fully_paid'\)/);
  });
});
