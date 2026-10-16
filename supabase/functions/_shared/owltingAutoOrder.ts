// Shared helper: auto-create a "PII-pending" order from an OwlTing email,
// so inventory is locked immediately while we wait for the owner to fill PII.
//
// Called from `owlting-email-ingest` when a trusted new_order email arrives
// with a resolvable accommodation. The order is created with:
//   - order_status = "confirmed" (so it counts against inventory)
//   - is_pii_pending = true (marks the row as awaiting PII backfill)
//   - guest_name = "待補資料 (OBE …)" placeholder
//   - auto_created_from_email_id = raw email id
//
// `owlting-fillup-submit` will later UPDATE this order instead of inserting
// a duplicate — see `promoteAutoPendingOrder` there.

import { sendOrderRoomsAlertEmail } from "./orderRoomsAlert.ts";
import { updateOrderWithContext } from "./orderContext.ts";
import { reportOwltingSyncFailure } from "./owltingSyncAlert.ts";
import { resolveTemplateId } from "./resolveTemplateId.ts";
import { reportBackendError } from "./errorReporter.ts";
import {
  planOtaModification, buildOtaRooms, classifyApplyError, formatNotApplied, formatRoomWarnings,
  type ExistingRoom, type OtaConflict,
} from "./syncOtaOrderRooms.ts";

export function normalizeName(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, "").toLowerCase();
}

export function classifyOtaChannel(rawChannel: string | null | undefined): string | null {
  const raw = String(rawChannel ?? "").trim();
  const lower = raw.toLowerCase();
  if (!lower) return null;
  if (lower.includes("agoda")) return "agoda";
  if (lower.includes("booking")) return "booking";
  if (lower.includes("expedia")) return "expedia";
  if (lower.includes("trip") || lower.includes("ctrip") || lower.includes("攜程")) return "trip";
  if (lower.includes("airbnb")) return "airbnb";
  if (lower.includes("klook")) return "klook";
  if (lower.includes("kkday")) return "kkday";
  if (lower.includes("官網") || lower.includes("direct")) return "owlting_direct";
  return raw;
}

export function defaultPaymentStatusForChannel(otaChannel: string | null): "paid" | "unpaid" {
  if (otaChannel === "booking" || otaChannel === "airbnb") return "unpaid";
  return "paid";
}

export async function matchRoomTypeByName(
  admin: any,
  accommodationId: string,
  roomTypeName: string | null | undefined,
): Promise<string | null> {
  if (!roomTypeName) return null;
  const { data } = await admin
    .from("room_types")
    .select("id, name")
    .eq("accommodation_id", accommodationId);
  if (!data || data.length === 0) return null;
  const target = normalizeName(roomTypeName);
  if (!target) return null;
  const exact = data.find((r: any) => normalizeName(r.name) === target);
  if (exact) return exact.id as string;
  const contains = data.find((r: any) => {
    const n = normalizeName(r.name);
    return n && (n.includes(target) || target.includes(n));
  });
  return contains?.id ?? null;
}

interface AutoCreateInput {
  raw_email_id: string;
  staging_id: string;
  accommodation_id: string;
  obe_number: string | null;
  channel_source: string | null;
  room_type_name: string | null;
  room_quantity: number | null;
  check_in_date: string | null;
  check_out_date: string | null;
  guest_count: number | null;
  total_amount: number | null;
  is_payment_pending?: boolean;
  /** 信件中未遮蔽的旅客姓名（可為 null） */
  guest_name?: string | null;
  /** 信件「特殊需求」原文，寫入備註 */
  special_requests?: string | null;
  /** 信件「剩餘尾款」；官網直訂（待結清）用來推算已收訂金 */
  remaining_amount?: number | null;
}

export interface AutoCreateResult {
  ok: boolean;
  order_id?: string;
  order_number?: string;
  skipped_reason?: string;
  error?: string;
}

/**
 * Idempotently create a PII-pending order. Returns { ok:false, skipped_reason } if
 * we can't or shouldn't create (missing dates, room type unresolvable, OBE already
 * mapped to an existing order, etc.). Never throws.
 */
export async function autoCreatePendingOrder(
  admin: any,
  input: AutoCreateInput,
): Promise<AutoCreateResult> {
  try {
    if (!input.accommodation_id) return { ok: false, skipped_reason: "no_accommodation_id" };
    if (!input.check_in_date || !input.check_out_date) return { ok: false, skipped_reason: "missing_dates" };
    if (!input.obe_number) return { ok: false, skipped_reason: "no_obe_number" };

    // Idempotency: OBE already on a real order → skip.
    const { data: existing } = await admin
      .from("orders")
      .select("id, order_number, is_pii_pending")
      .eq("owlting_reservation_id", input.obe_number)
      .maybeSingle();
    if (existing) {
      return {
        ok: false,
        skipped_reason: existing.is_pii_pending ? "already_auto_created" : "already_promoted",
        order_id: existing.id,
        order_number: existing.order_number,
      };
    }

    const roomTypeId = await matchRoomTypeByName(admin, input.accommodation_id, input.room_type_name);
    if (!roomTypeId) return { ok: false, skipped_reason: "room_type_unresolvable" };

    const roomQuantity = Math.max(1, Math.min(20, Number(input.room_quantity ?? 1) || 1));
    const guestCount = Math.max(1, Number(input.guest_count ?? 2) || 2);
    const total = Math.max(0, Math.round(Number(input.total_amount ?? 0)));
    const otaChannel = classifyOtaChannel(input.channel_source);
    // 官網直訂信會附「訂單款項 / 剩餘尾款」，以此推算已收金額，
    // 不能一律當成已付清（多數為已收訂金、待結清）。
    const remainingRaw = input.remaining_amount;
    const hasRemaining =
      remainingRaw !== null && remainingRaw !== undefined && Number.isFinite(Number(remainingRaw));
    let paymentStatus: "paid" | "unpaid" | "deposit_paid";
    let paidAmount: number;
    let depositAmount = 0;
    if (hasRemaining) {
      const remaining = Math.max(0, Math.round(Number(remainingRaw)));
      paidAmount = Math.max(0, total - remaining);
      paymentStatus = remaining <= 0 ? "paid" : paidAmount > 0 ? "deposit_paid" : "unpaid";
      if (paymentStatus === "deposit_paid") depositAmount = paidAmount;
    } else {
      paymentStatus = defaultPaymentStatusForChannel(otaChannel);
      paidAmount = paymentStatus === "paid" ? total : 0;
    }
    const nowIso = new Date().toISOString();

    // 姓名信中未遮蔽 → 直接帶入，並標記電話仍待補；抓不到才用純待補佔位。
    const parsedName = (input.guest_name ?? "").trim();
    const placeholderName = parsedName
      ? `${parsedName}（待補電話）`
      : `待補資料 (OBE ${input.obe_number})`;

    const { data: inserted, error: insErr } = await admin
      .from("orders")
      .insert({
        accommodation_id: input.accommodation_id,
        room_type_id: roomTypeId,
        check_in_date: input.check_in_date,
        check_out_date: input.check_out_date,
        guest_count: guestCount,
        guest_name: placeholderName,
        guest_phone: "0000000000",
        guest_email: null,
        total_price: total,
        final_price: total,
        discount_amount: 0,
        order_source: "owlting",
        ota_channel: otaChannel,
        order_status: "confirmed",
        payment_status: paymentStatus,
        paid_amount: paidAmount,
        deposit_amount: depositAmount,
        confirmed_at: nowIso,
        requires_owner_review: true,
        owlting_reservation_id: input.obe_number,
        deposit_required_amount: 0,
        is_pii_pending: true,
        auto_created_from_email_id: input.raw_email_id,
        notes: `${input.special_requests ? `[特殊需求] ${input.special_requests}\n` : ""}${input.is_payment_pending ? "[等待付款鎖房] " : ""}[自動鎖房] 奧丁丁 OTA email 進來自動建立 pending 訂單 (OBE: ${input.obe_number}${input.channel_source ? `, 平台: ${input.channel_source}` : ""}, ${roomQuantity} 間, 付款: ${paymentStatus === "paid" ? "已付清" : paymentStatus === "deposit_paid" ? `已收訂金 ${paidAmount}` : "待結清"}${input.is_payment_pending ? "，來源: 等待付款通知（48h 內未成立將自動釋放）" : ""})，待業主補齊${parsedName ? "電話等" : "住客"}資料。`,
      })
      .select("id, order_number")
      .single();

    if (insErr || !inserted) {
      return { ok: false, error: insErr?.message ?? "insert_failed" };
    }

    // Auto-assign units for each room row (sequential display_order pick).
    try {
      await rebuildOrderRooms(admin, {
        orderId: inserted.id,
        accommodationId: input.accommodation_id,
        roomTypeId,
        roomQuantity,
        total,
        checkIn: input.check_in_date,
        checkOut: input.check_out_date,
      });
    } catch (e) {
      const msg = (e as Error).message;
      await markRebuildFailure(admin, {
        stagingId: input.staging_id,
        orderId: inserted.id,
        orderNumber: inserted.order_number,
        obeNumber: input.obe_number ?? null,
        error: msg,
      });
      return { ok: false, error: msg };
    }

    // Link staging → order.
    await admin
      .from("owlting_email_parsed_staging")
      .update({
        auto_order_id: inserted.id,
        auto_created_at: nowIso,
        auto_create_error: null,
      })
      .eq("id", input.staging_id);

    return { ok: true, order_id: inserted.id, order_number: inserted.order_number };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * On cancelled email: mark any auto-created pending order for the same OBE as cancelled.
 * Returns list of cancelled order ids (best-effort; never throws).
 */
export interface CancelAutoResult {
  /** 實際 RPC 呼叫成功、確定已取消的 order id */
  cancelled: string[];
  /** 失敗筆（不中斷迴圈，需人工補救） */
  failed: Array<{ id: string; order_number: string | null; error: string }>;
}

export async function cancelAutoPendingOrders(
  admin: any,
  obeNumber: string,
): Promise<CancelAutoResult> {
  const empty: CancelAutoResult = { cancelled: [], failed: [] };
  try {
    if (!obeNumber) return empty;
    const { data: orders, error: selErr } = await admin
      .from("orders")
      .select("id, order_number, order_status")
      .eq("owlting_reservation_id", obeNumber)
      .neq("order_status", "cancelled");
    if (selErr) throw new Error(selErr.message);
    if (!orders || orders.length === 0) return empty;

    const nowIso = new Date().toISOString();
    const cancelled: string[] = [];
    const failed: CancelAutoResult["failed"] = [];

    for (const o of orders as any[]) {
      try {
        await updateOrderWithContext(admin, o.id, {
          order_status: "cancelled",
          cancelled_at: nowIso,
        }, {
          source: "owlting_email_cancel",
          reason: `OBE ${obeNumber} 取消通知`,
          actorLabel: "OwlTing 取消通知",
          actorType: "system",
        });
        cancelled.push(o.id);
      } catch (e) {
        failed.push({ id: o.id, order_number: o.order_number ?? null, error: (e as Error).message });
      }
    }

    if (failed.length > 0) {
      await reportOwltingSyncFailure(admin, {
        functionName: "owlting-email-ingest",
        category: "owlting_auto_cancel",
        step: "cancel_auto_pending_orders",
        summary: `OBE ${obeNumber}：${failed.length} 筆訂單自動取消失敗，需人工處理`,
        reference: obeNumber,
        failed: failed.map((f) => ({ order_id: f.id, order_number: f.order_number, reference: obeNumber, error: f.error })),
        successCount: cancelled.length,
      });
    }

    return { cancelled, failed };
  } catch (e) {
    console.error("[cancelAutoPendingOrders] failed:", e);
    await reportOwltingSyncFailure(admin, {
      functionName: "owlting-email-ingest",
      category: "owlting_auto_cancel",
      step: "cancel_auto_pending_orders",
      summary: `OBE ${obeNumber}：取消流程整體失敗（${(e as Error).message}）`,
      reference: obeNumber,
      failed: [{ reference: obeNumber, error: (e as Error).message }],
      successCount: 0,
    }).catch(() => {});
    return empty;
  }
}

/**
 * 為 OwlTing 自動重建房型明細時，保守解析應套用的 pricing_template。
 * 優先參考該訂單既有 order_rooms 中同房型的 template_id / template_name，
 * 再用 resolveTemplateId 驗證名稱與房型是否仍吻合；無法唯一確定時回傳 null。
 */
export async function resolveRoomTemplate(
  admin: any,
  opts: {
    accommodationId: string;
    orderId: string;
    roomTypeId: string;
  },
): Promise<{ template_id: string | null; template_name: string | null }> {
  const [{ data: templates }, { data: existingRooms }] = await Promise.all([
    admin
      .from("pricing_templates")
      .select("id, template_name, room_type_id, room_type_ids")
      .eq("accommodation_id", opts.accommodationId),
    admin
      .from("order_rooms")
      .select("template_id, template_name, room_type_id")
      .eq("order_id", opts.orderId),
  ]);

  const list = (templates ?? []) as Array<{
    id: string;
    template_name: string | null;
    room_type_id?: string | null;
    room_type_ids?: string[] | null;
  }>;
  if (list.length === 0) return { template_id: null, template_name: null };

  const existing = ((existingRooms ?? []) as any[]).find(
    (r: any) => r.room_type_id === opts.roomTypeId,
  );
  let currentTemplateId: string | null = null;
  let templateName: string | null = null;
  if (existing) {
    currentTemplateId = existing.template_id ?? null;
    templateName = existing.template_name ?? null;
    if (!templateName && currentTemplateId) {
      const cur = list.find((t) => t.id === currentTemplateId);
      templateName = cur?.template_name ?? null;
    }
  }

  const resolvedId = resolveTemplateId(list, opts.roomTypeId, templateName, currentTemplateId);
  if (resolvedId) {
    const resolved = list.find((t) => t.id === resolvedId);
    return {
      template_id: resolvedId,
      template_name: resolved?.template_name ?? templateName ?? null,
    };
  }
  return { template_id: null, template_name: null };
}

/**
 * (Re)build order_rooms for an order, auto-assigning free room units.
 * V5.5A.9: 改由 sync_order_rooms_v1 在單一交易內完成 diff 同步；
 * 任何錯誤都會 throw，由呼叫端標記 staging 並發出告警。
 */
export async function rebuildOrderRooms(
  admin: any,
  opts: {
    orderId: string;
    accommodationId: string;
    roomTypeId: string;
    roomQuantity: number;
    total: number;
    checkIn: string;
    checkOut: string;
  },
): Promise<void> {
  const { data: units, error: unitsErr } = await admin
    .from("room_units")
    .select("id, display_order, unit_number")
    .eq("room_type_id", opts.roomTypeId)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("unit_number", { ascending: true });
  if (unitsErr) {
    throw new Error(`room_units query failed: ${unitsErr.message}`);
  }

  const busySet = new Set<string>();
  if (units && units.length > 0) {
    const { data: conflicts, error: conflictErr } = await admin
      .from("order_rooms")
      .select("room_unit_id, order_id, orders!inner(order_status, check_in_date, check_out_date)")
      .in("room_unit_id", units.map((u: any) => u.id))
      .neq("order_id", opts.orderId)
      .neq("orders.order_status", "cancelled")
      .lt("orders.check_in_date", opts.checkOut)
      .gt("orders.check_out_date", opts.checkIn);
    if (conflictErr) {
      throw new Error(`order_rooms conflict query failed: ${conflictErr.message}`);
    }
    for (const c of conflicts ?? []) {
      if ((c as any).room_unit_id) busySet.add((c as any).room_unit_id);
    }
  }

  const { template_id, template_name } = await resolveRoomTemplate(admin, {
    accommodationId: opts.accommodationId,
    orderId: opts.orderId,
    roomTypeId: opts.roomTypeId,
  });

  const qty = Math.max(1, opts.roomQuantity);
  const perRoomPrice = Math.round(opts.total / qty);
  const pickedIds = new Set<string>();
  const rows: any[] = [];
  for (let i = 0; i < qty; i++) {
    const free = (units ?? []).find((u: any) => !busySet.has(u.id) && !pickedIds.has(u.id));
    if (free) pickedIds.add(free.id);
    rows.push({
      id: null,
      room_type_id: opts.roomTypeId,
      quantity: 1,
      room_price: perRoomPrice,
      room_unit_id: free?.id ?? null,
      template_id,
      template_name,
    });
  }

  const { error: rpcErr } = await admin.rpc("sync_order_rooms_v1", {
    p_order_id: opts.orderId,
    p_expected_updated_at: null,
    p_rooms: rows,
  });
  if (rpcErr) {
    throw new Error(`sync_order_rooms_v1 failed: ${rpcErr.message}`);
  }
}


/**
 * Mark staging + send internal alert when rebuildOrderRooms() fails.
 * Never throws — the caller re-throws the original error.
 */
async function markRebuildFailure(
  admin: any,
  ctx: {
    stagingId: string;
    orderId: string | null;
    orderNumber: string | null;
    obeNumber: string | null;
    error: string;
  },
): Promise<void> {
  try {
    await admin
      .from("owlting_email_parsed_staging")
      .update({
        auto_order_id: ctx.orderId,
        auto_create_error: ctx.error,
        review_status: "pending_review",
        review_notes: `[需人工檢查] 房型明細重建失敗：${ctx.orderNumber ?? ctx.orderId ?? "未知訂單"}／${ctx.error}`,
        modification_diff_status: "rebuild_failed",
      })
      .eq("id", ctx.stagingId);
  } catch (e) {
    console.error("[markRebuildFailure] staging update failed:", e);
  }
  try {
    await sendOrderRoomsAlertEmail(admin, {
      orderNumber: ctx.orderNumber,
      orderId: ctx.orderId,
      obeNumber: ctx.obeNumber,
      stagingId: ctx.stagingId,
      error: ctx.error,
    });
  } catch (e) {
    console.error("[markRebuildFailure] alert failed:", e);
  }
}

export interface OrderFieldDiff {
  field: string;
  label: string;
  before: string | number | null;
  after: string | number | null;
}

export interface ApplyModificationResult {
  ok: boolean;
  order_id?: string;
  order_number?: string;
  updated_fields?: string[];
  /** 結構化 diff（欄位、前值、後值），寫入審計欄位方便追查 */
  diff?: OrderFieldDiff[];
  skipped_reason?: string;
  /** skipped_reason = "modify_blocked" 時的原因代碼 */
  blocked_code?: string;
  /** 套用失敗分類：inventory_exceeded / amenity_exceeded / double_submit / order_changed / unknown */
  error_reason?: string;
  error?: string;
}

export function formatOrderDiff(diff: OrderFieldDiff[]): string {
  return diff
    .map((d) => `${d.label} ${d.before ?? "—"} → ${d.after ?? "—"}`)
    .join("；");
}

/**
 * Modified email → UPDATE the existing order tied to the same OBE number
 * instead of creating a duplicate (which would double-book inventory).
 * Returns skipped_reason = "order_not_found" when there is nothing to update.
 * Never throws.
 */
export async function applyModificationToExistingOrder(
  admin: any,
  input: {
    staging_id: string;
    obe_number: string | null;
    accommodation_id: string | null;
    room_type_name: string | null;
    room_quantity: number | null;
    check_in_date: string | null;
    check_out_date: string | null;
    guest_count: number | null;
    total_amount: number | null;
    change_summary?: string | null;
    /** 信件端的差異判定狀態（compared / partial / no_sections / unparsable） */
    parser_diff_status?: string | null;
  },
): Promise<ApplyModificationResult> {
  const alert = async (orderId: string | null, orderNumber: string | null, step: string, text: string, accId: string | null, ctx: Record<string, unknown>) => {
    await reportBackendError({ functionName: "owlting-email-ingest", category: "owlting_modify_rooms", step,
      errorMessage: text, accommodationId: accId, context: { obe: input.obe_number, staging_id: input.staging_id, order_id: orderId, ...ctx } }).catch(() => {});
    await sendOrderRoomsAlertEmail(admin, { orderNumber, orderId, obeNumber: input.obe_number, stagingId: input.staging_id, error: text }).catch(() => false);
  };
  try {
    if (!input.obe_number) return { ok: false, skipped_reason: "no_obe_number" };
    const { data: orders, error: ordErr } = await admin.from("orders")
      .select("id, order_number, accommodation_id, room_type_id, check_in_date, check_out_date, guest_count, total_price, final_price, paid_amount, payment_status, order_status, notes")
      .eq("owlting_reservation_id", input.obe_number).neq("order_status", "cancelled")
      .order("created_at", { ascending: false });
    if (ordErr) return { ok: false, error: ordErr.message };
    if (!orders || orders.length === 0) return { ok: false, skipped_reason: "order_not_found" };
    const order = orders[0];
    const accId = input.accommodation_id ?? order.accommodation_id;

    const [{ data: rows, error: rowsErr }, { data: roomTypes, error: rtErr }] = await Promise.all([
      admin.from("order_rooms").select("id, room_type_id, quantity, room_price, room_unit_id, template_id, template_name")
        .eq("order_id", order.id).order("created_at", { ascending: true }),
      admin.from("room_types").select("id, name").eq("accommodation_id", accId),
    ]);
    if (rowsErr || rtErr) return { ok: false, error: (rowsErr ?? rtErr).message };
    const existing = (rows ?? []) as ExistingRoom[];

    const plan = planOtaModification({ activeOrderCount: orders.length, order, rows: existing, roomTypes: roomTypes ?? [],
      mail: { check_in_date: input.check_in_date, check_out_date: input.check_out_date, room_type_name: input.room_type_name,
              room_quantity: input.room_quantity, guest_count: input.guest_count, total_amount: input.total_amount,
              parser_diff_status: input.parser_diff_status ?? null } });

    if (plan.kind === "blocked") {
      const text = formatNotApplied({ code: plan.code, obe: input.obe_number, orderNumber: order.order_number, mailChanges: input.change_summary ?? null, diff: [] });
      await admin.from("owlting_email_parsed_staging").update({ auto_order_id: order.id, review_status: "pending_review",
        auto_create_error: `modify_blocked:${plan.code}`, review_notes: `[需人工] ${text}` }).eq("id", input.staging_id);
      await alert(order.id, order.order_number, "modify_blocked", text, accId, { code: plan.code });
      return { ok: false, skipped_reason: "modify_blocked", blocked_code: plan.code, order_id: order.id, order_number: order.order_number };
    }
    if (plan.kind === "noop") {
      // 與 DB 既有訂單完全一致 → 記錄「已比對無差異」到 staging，方便追查
      await admin
        .from("owlting_email_parsed_staging")
        .update({
          auto_order_id: order.id,
          modification_diff: [],
          modification_diff_status: input.parser_diff_status ?? "db_compared",
          review_notes: `[auto-update] 與既有訂單 ${order.order_number} 逐欄比對後無差異，未更新。`,
        })
        .eq("id", input.staging_id);
      return { ok: true, order_id: order.id, order_number: order.order_number, updated_fields: [], diff: [], skipped_reason: "no_material_change" };
    }

    let rooms: any[] | null = null;
    let units: { id: string; unit_number: string }[] = [];
    if (plan.roomsChange !== "none") {
      const { data: u, error: uErr } = await admin.from("room_units").select("id, unit_number")
        .eq("room_type_id", plan.target.roomTypeId).eq("is_active", true)
        .order("display_order", { ascending: true }).order("unit_number", { ascending: true });
      if (uErr) return { ok: false, error: `room_units query failed: ${uErr.message}` };
      units = u ?? [];
      const needPick = plan.roomsChange === "replace" || (plan.roomsChange === "resize" && plan.target.qty > existing.length);
      const busy = new Set<string>();
      if (needPick && units.length) {
        // 與 rebuildOrderRooms 相同條件（排除本訂單、未取消、日期重疊）
        const { data: c, error: cErr } = await admin.from("order_rooms")
          .select("room_unit_id, order_id, orders!inner(order_status, check_in_date, check_out_date)")
          .in("room_unit_id", units.map((x) => x.id)).neq("order_id", order.id)
          .neq("orders.order_status", "cancelled").lt("orders.check_in_date", plan.target.checkOut).gt("orders.check_out_date", plan.target.checkIn);
        if (cErr) return { ok: false, error: `order_rooms conflict query failed: ${cErr.message}` };
        for (const x of c ?? []) if ((x as any).room_unit_id) busy.add((x as any).room_unit_id);
      }
      const newTemplate = plan.roomsChange === "replace"
        ? await resolveRoomTemplate(admin, { accommodationId: accId, orderId: order.id, roomTypeId: plan.target.roomTypeId })
        : { template_id: null, template_name: null };
      rooms = buildOtaRooms({ plan, rows: existing, units, busy, newTemplate });
    }

    const summary = formatOrderDiff(plan.diff);
    const stamp = new Date().toISOString().slice(0, 10);
    const patch = { ...plan.patch, notes: `${order.notes ? `${order.notes}\n` : ""}[${stamp} 奧丁丁修改通知] 已依 OBE ${input.obe_number} 自動更新既有訂單：${summary}${input.change_summary ? `\n（信件差異：${input.change_summary}）` : ""}` };
    const { data: rpc, error: rpcErr } = await admin.rpc("apply_ota_modification_v1", {
      p_order_id: order.id, p_patch: patch,
      p_expect: { check_in_date: order.check_in_date, check_out_date: order.check_out_date, room_type_id: order.room_type_id,
                  total_price: order.total_price, order_status: order.order_status },
      p_source: "owlting_email_modify", p_reason: `OBE ${input.obe_number} 修改通知自動更新`, p_actor_label: "OwlTing 修改通知",
      p_sync_rooms: rooms !== null, p_rooms: rooms ?? [],
    });
    if (rpcErr) {
      const reason = classifyApplyError(rpcErr.message ?? "", (rpcErr as any).code);
      const text = `修改信套用失敗（整筆回滾，訂單未變更）｜原因：${reason}｜OBE：${input.obe_number}｜訂單：${order.order_number}｜修改內容：${summary}｜${rpcErr.message}`;
      await admin.from("owlting_email_parsed_staging").update({ auto_order_id: order.id, review_status: "pending_review",
        auto_create_error: `${reason}: ${rpcErr.message}`, review_notes: `[需人工] ${text}` }).eq("id", input.staging_id);
      await alert(order.id, order.order_number, "apply_ota_modification_v1", text, accId, { reason, rooms });
      return { ok: false, error: `${reason}: ${rpcErr.message}`, error_reason: reason, diff: plan.diff, order_id: order.id, order_number: order.order_number };
    }

    const conflicts = ((rpc as any)?.conflicts ?? []) as OtaConflict[];
    const warn = formatRoomWarnings({ orderNumber: order.order_number, conflicts,
      newRowsWithoutUnit: (rooms ?? []).filter((r) => r.id === null && !r.room_unit_id),
      typeName: (id) => (roomTypes ?? []).find((t: any) => t.id === id)?.name ?? "房型",
      unitNo: (id) => units.find((x) => x.id === id)?.unit_number ?? "房號", amountNeedsReview: plan.amountNeedsReview });
    if (warn) await alert(order.id, order.order_number, "post_apply_warning", warn, accId, { conflicts });

    await admin
      .from("owlting_email_parsed_staging")
      .update({
        auto_order_id: order.id,
        auto_create_error: null,
        modification_diff: plan.diff,
        modification_diff_status: input.parser_diff_status ?? "db_compared",
        review_notes: `[auto-update] 修改通知已自動更新既有訂單 ${order.order_number}：${summary}${warn ? `\n${warn}` : ""}`,
      })
      .eq("id", input.staging_id);

    return { ok: true, order_id: order.id, order_number: order.order_number, updated_fields: plan.diff.map((d) => d.label), diff: plan.diff };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
