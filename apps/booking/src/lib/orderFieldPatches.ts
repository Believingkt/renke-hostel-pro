// 純函式：決定各個後台呼叫端要送哪些欄位給 update_order_fields_v1。
//
// 規則（做法 B）：
// - 不得存取 supabase / 現在時間；所有算好的值由呼叫端傳入。
// - 內容逐字沿用原本呼叫端的物件字面值與條件，不改任何判斷。
// - 測試直接呼叫這些函式，把 key 與 RPC 白名單快照自動比對。

export type OrderFieldsPatch = Record<string, unknown>;

export interface InlineEditOrderSnapshot {
  payment_status: string;
  total_price: number | null;
  discount_amount: number | null;
  discount_code: string | null;
  final_price: number | null;
}

export interface InlineEditFormValues {
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  guest_address: string;
  guest_gender: string;
  guest_nationality: string;
  guest_count: number;
  order_source: string;
  lock_whole_building: boolean;
  order_status: string;
  deposit_payment_method: string;
  balance_payment_method: string;
  meal_plan: string;
  room_type_id: string;
  discount_code: string;
  discount_amount: number;
  deposit_amount: number;
  addon_total: number;
  pet_count: number;
  pet_plan_price: number;
  meal_plan_details: unknown[];
  meal_plan_total: number;
  custom_addon_details: unknown[];
}

export interface InlineEditPatchInput {
  order: InlineEditOrderSnapshot;
  form: InlineEditFormValues;
  isOlivia: boolean;
  isHoldOrder: boolean;
  effPaymentStatus: string;
  effPaidAmount: number;
  savedTotalPrice: number;
  editFinalPriceCalc: number;
  originalAddonTotal: number;
  /** 已完成加購／包棟區塊處理後的備註本文 */
  finalNotes: string;
  /** 已結清訂單的 🔒 金額異動稽核行；沒有異動時傳 null */
  auditNoteLine: string | null;
  /** 狀態時間戳要寫入的時間（ISO 字串） */
  nowIso: string;
  /** 訂單原本的狀態，用來判斷狀態是否變更 */
  originalOrderStatus: string;
}

export function buildInlineEditPatch(input: InlineEditPatchInput): OrderFieldsPatch {
  const { order, form } = input;

  const updateData: OrderFieldsPatch = {
    guest_name: form.guest_name.trim(),
    guest_phone: form.guest_phone.trim(),
    guest_email: form.guest_email.trim() || null,
    guest_address: form.guest_address.trim() || null,
    guest_gender: form.guest_gender || null,
    guest_nationality: form.guest_nationality.trim() || null,
    guest_count: form.guest_count,
    order_source: form.order_source,
    lock_whole_building: input.isOlivia ? form.lock_whole_building : false,
    order_status: form.order_status,
    payment_status: input.effPaymentStatus,
    deposit_payment_method: form.deposit_payment_method === "none" ? null : form.deposit_payment_method,
    balance_payment_method: form.balance_payment_method === "none" ? null : form.balance_payment_method,
    meal_plan: form.meal_plan === "none" ? null : form.meal_plan,
    notes: input.finalNotes || null,
    room_type_id: form.room_type_id || null,
    discount_code: form.discount_code.trim() || null,
    paid_amount: input.effPaidAmount,
    pet_count: form.pet_count,
    pet_plan_price: form.pet_plan_price,
    meal_plan_details: form.meal_plan_details.length > 0 ? form.meal_plan_details : null,
    meal_plan_total: form.meal_plan_total,
    custom_addon_details: form.custom_addon_details.length > 0 ? form.custom_addon_details : null,
  };

  const isPaidOrDeposit = ["paid", "fully_paid"].includes(order.payment_status);
  const addIfChanged = (key: string, newVal: number, oldVal: number | null | undefined) => {
    if (!isPaidOrDeposit || Number(newVal) !== Number(oldVal ?? 0)) {
      updateData[key] = newVal;
    }
  };
  addIfChanged("total_price", input.savedTotalPrice, order.total_price);
  if (!isPaidOrDeposit) {
    addIfChanged("discount_amount", form.discount_amount, order.discount_amount);
    updateData.discount_code = form.discount_code.trim() || null;
  } else {
    updateData.discount_code = order.discount_code;
  }
  updateData.deposit_amount = form.deposit_amount;

  const pricingUnchanged =
    Number(input.savedTotalPrice) === Number(order.total_price ?? 0) &&
    Number(form.discount_amount) === Number(order.discount_amount ?? 0) &&
    Number(form.addon_total) === Number(input.originalAddonTotal);
  if (!pricingUnchanged) {
    addIfChanged("final_price", input.editFinalPriceCalc, order.final_price);
  }

  if (input.auditNoteLine) {
    const merged = input.finalNotes
      ? `${input.finalNotes}\n${input.auditNoteLine}`
      : input.auditNoteLine;
    updateData.notes = merged;
  }

  if (form.order_status !== input.originalOrderStatus) {
    if (form.order_status === "confirmed") {
      updateData.confirmed_at = input.nowIso;
      if (input.isHoldOrder) {
        updateData.order_date = input.nowIso;
      }
    }
    if (form.order_status === "checked_in") {
      updateData.checked_in_at = input.nowIso;
    }
    if (form.order_status === "checked_out") {
      updateData.checked_out_at = input.nowIso;
    }
    if (form.order_status === "cancelled") {
      updateData.cancelled_at = input.nowIso;
    }
  }

  return updateData;
}

export function buildAdminCancelPatch(input: { cancelledAtIso: string }): OrderFieldsPatch {
  return { order_status: "cancelled", cancelled_at: input.cancelledAtIso };
}

export function buildCheckinActionPatch(input: {
  action: "checkin" | "undo_checkin" | "checkout" | "undo_checkout";
  nowIso: string;
  hasCheckedInAt: boolean;
}): OrderFieldsPatch {
  const patch: OrderFieldsPatch = {};
  if (input.action === "checkin") patch.checked_in_at = input.nowIso;
  if (input.action === "undo_checkin") patch.checked_in_at = null;
  if (input.action === "checkout") {
    patch.checked_out_at = input.nowIso;
    if (!input.hasCheckedInAt) patch.checked_in_at = input.nowIso;
  }
  if (input.action === "undo_checkout") patch.checked_out_at = null;
  return patch;
}

export function buildAdminPriceEditPatch(input: {
  totalPrice: number;
  discountAmount: number;
  finalPrice: number;
  depositAmount: number;
  paidAmount: number;
  paymentStatus: string;
  notes: string | null;
}): OrderFieldsPatch {
  return {
    total_price: input.totalPrice,
    discount_amount: input.discountAmount,
    final_price: input.finalPrice,
    deposit_amount: input.depositAmount,
    paid_amount: input.paidAmount,
    payment_status: input.paymentStatus,
    notes: input.notes,
  };
}

export function buildDealDateEditPatch(input: { orderDateIso: string }): OrderFieldsPatch {
  return { order_date: input.orderDateIso };
}

export function buildImportDiscountCodePatch(input: { discountCode: string }): OrderFieldsPatch {
  return { discount_code: input.discountCode };
}

export function buildManualReviewGuestCountPatch(input: { guestCount: number }): OrderFieldsPatch {
  return { guest_count: input.guestCount };
}

export function buildManualReviewRepricingPatch(input: { finalPrice: number }): OrderFieldsPatch {
  return { final_price: input.finalPrice };
}

export function buildManualReviewNotePatch(input: { notes: string }): OrderFieldsPatch {
  return { notes: input.notes };
}

export function buildOrderSourceDialogPatch(input: {
  orderSource: string;
  notes: string;
}): OrderFieldsPatch {
  const payload: OrderFieldsPatch = {
    order_source: input.orderSource,
    notes: input.notes,
  };
  return payload;
}

export function buildOrderStatusDialogPatch(input: {
  selectedStatus: string;
  currentStatus: string;
  notes: string;
  nowIso: string;
  isHoldOrder: boolean;
}): OrderFieldsPatch {
  const updateData: OrderFieldsPatch = {
    order_status: input.selectedStatus,
    notes: input.notes,
  };
  if (input.selectedStatus === "confirmed" && input.currentStatus !== "confirmed") {
    updateData.confirmed_at = input.nowIso;
    if (input.isHoldOrder) updateData.order_date = input.nowIso;
  } else if (input.selectedStatus === "checked_in") {
    updateData.checked_in_at = input.nowIso;
  } else if (input.selectedStatus === "checked_out") {
    updateData.checked_out_at = input.nowIso;
  } else if (input.selectedStatus === "cancelled") {
    updateData.cancelled_at = input.nowIso;
  }
  return updateData;
}

export function buildPaymentStatusDialogPatch(input: {
  paymentStatus: string;
  paidAmount: number | null;
  notes: string;
}): OrderFieldsPatch {
  return {
    payment_status: input.paymentStatus,
    paid_amount: input.paidAmount,
    notes: input.notes,
  };
}

export function buildPriceEditDialogPatch(input: {
  totalPrice: number;
  discountAmount: number;
  finalPrice: number;
  depositAmount: number;
  paidAmount: number;
  paymentStatus: string;
  customAddonDetails: unknown[];
  discountCode: string;
  mealPlanDetails: unknown[];
  notes: string | null;
}): OrderFieldsPatch {
  return {
    total_price: input.totalPrice,
    discount_amount: input.discountAmount,
    final_price: input.finalPrice,
    deposit_amount: input.depositAmount,
    paid_amount: input.paidAmount,
    payment_status: input.paymentStatus,
    custom_addon_details: input.customAddonDetails,
    discount_code: input.discountCode.trim() || null,
    meal_plan_details: input.mealPlanDetails.length > 0 ? input.mealPlanDetails : null,
    notes: input.notes,
  };
}
