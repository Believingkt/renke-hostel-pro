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
    await rebuildOrderRooms(admin, {
      orderId: inserted.id,
      roomTypeId,
      roomQuantity,
      total,
      checkIn: input.check_in_date,
      checkOut: input.check_out_date,
    });

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
export async function cancelAutoPendingOrders(
  admin: any,
  obeNumber: string,
): Promise<string[]> {
  try {
    if (!obeNumber) return [];
    const { data: orders } = await admin
      .from("orders")
      .select("id, order_status")
      .eq("owlting_reservation_id", obeNumber)
      .neq("order_status", "cancelled");
    if (!orders || orders.length === 0) return [];
    const ids = orders.map((o: any) => o.id);
    const nowIso = new Date().toISOString();
    await admin
      .from("orders")
      .update({
        order_status: "cancelled",
        cancelled_at: nowIso,
      })
      .in("id", ids);
    return ids;
  } catch (e) {
    console.error("[cancelAutoPendingOrders] failed:", e);
    return [];
  }
}

/**
 * (Re)build order_rooms for an order, auto-assigning free room units.
 * Existing rows for the order are replaced.
 */
export async function rebuildOrderRooms(
  admin: any,
  opts: {
    orderId: string;
    roomTypeId: string;
    roomQuantity: number;
    total: number;
    checkIn: string;
    checkOut: string;
  },
): Promise<void> {
  await admin.from("order_rooms").delete().eq("order_id", opts.orderId);

  const { data: units } = await admin
    .from("room_units")
    .select("id, display_order, unit_number")
    .eq("room_type_id", opts.roomTypeId)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("unit_number", { ascending: true });

  const busySet = new Set<string>();
  if (units && units.length > 0) {
    const { data: conflicts } = await admin
      .from("order_rooms")
      .select("room_unit_id, order_id, orders!inner(order_status, check_in_date, check_out_date)")
      .in("room_unit_id", units.map((u: any) => u.id))
      .neq("order_id", opts.orderId)
      .neq("orders.order_status", "cancelled")
      .lt("orders.check_in_date", opts.checkOut)
      .gt("orders.check_out_date", opts.checkIn);
    for (const c of conflicts ?? []) {
      if ((c as any).room_unit_id) busySet.add((c as any).room_unit_id);
    }
  }

  const qty = Math.max(1, opts.roomQuantity);
  const perRoomPrice = Math.round(opts.total / qty);
  const pickedIds = new Set<string>();
  for (let i = 0; i < qty; i++) {
    const free = (units ?? []).find((u: any) => !busySet.has(u.id) && !pickedIds.has(u.id));
    if (free) pickedIds.add(free.id);
    await admin.from("order_rooms").insert({
      order_id: opts.orderId,
      room_type_id: opts.roomTypeId,
      quantity: 1,
      room_price: perRoomPrice,
      room_unit_id: free?.id ?? null,
    });
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
  try {
    if (!input.obe_number) return { ok: false, skipped_reason: "no_obe_number" };

    const { data: order } = await admin
      .from("orders")
      .select("id, order_number, accommodation_id, room_type_id, check_in_date, check_out_date, guest_count, total_price, final_price, paid_amount, payment_status, order_status, notes")
      .eq("owlting_reservation_id", input.obe_number)
      .neq("order_status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!order) return { ok: false, skipped_reason: "order_not_found" };

    const accId = input.accommodation_id ?? order.accommodation_id;
    const patch: Record<string, unknown> = {};
    const diff: OrderFieldDiff[] = [];
    const push = (field: string, label: string, before: any, after: any) =>
      diff.push({ field, label, before: before ?? null, after: after ?? null });

    if (input.check_in_date && input.check_in_date !== order.check_in_date) {
      patch.check_in_date = input.check_in_date;
      push("check_in_date", "入住日期", order.check_in_date, input.check_in_date);
    }
    if (input.check_out_date && input.check_out_date !== order.check_out_date) {
      patch.check_out_date = input.check_out_date;
      push("check_out_date", "退房日期", order.check_out_date, input.check_out_date);
    }
    const guestCount = Number(input.guest_count ?? 0);
    if (guestCount > 0 && guestCount !== Number(order.guest_count)) {
      patch.guest_count = guestCount;
      push("guest_count", "人數", order.guest_count, guestCount);
    }

    let roomTypeId: string | null = order.room_type_id;
    if (input.room_type_name && accId) {
      const matched = await matchRoomTypeByName(admin, accId, input.room_type_name);
      if (matched && matched !== order.room_type_id) {
        roomTypeId = matched;
        patch.room_type_id = matched;
        push("room_type_id", "房型", order.room_type_id, `${input.room_type_name}(${matched})`);
      }
    }

    const total = input.total_amount != null ? Math.max(0, Math.round(Number(input.total_amount))) : null;
    if (total != null && total !== Number(order.final_price)) {
      patch.total_price = total;
      patch.final_price = total;
      if (order.payment_status === "paid") patch.paid_amount = total;
      push("final_price", "金額", Number(order.final_price ?? 0), total);
    }

    const changed = diff.map((d) => d.label);

    if (changed.length === 0) {
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
      return {
        ok: true,
        order_id: order.id,
        order_number: order.order_number,
        updated_fields: [],
        diff: [],
        skipped_reason: "no_material_change",
      };
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const summary = formatOrderDiff(diff);
    patch.notes = `${order.notes ? `${order.notes}\n` : ""}[${stamp} 奧丁丁修改通知] 已依 OBE ${input.obe_number} 自動更新既有訂單：${summary}${input.change_summary ? `\n（信件差異：${input.change_summary}）` : ""}`;

    const { error: updErr } = await admin.from("orders").update(patch).eq("id", order.id);
    if (updErr) return { ok: false, error: updErr.message, diff };

    // Rebuild room rows when dates / room type / quantity / price changed.
    const finalCheckIn = (patch.check_in_date as string) ?? order.check_in_date;
    const finalCheckOut = (patch.check_out_date as string) ?? order.check_out_date;
    const finalTotal = total ?? Number(order.final_price ?? 0);
    if (roomTypeId) {
      const { count } = await admin
        .from("order_rooms")
        .select("id", { count: "exact", head: true })
        .eq("order_id", order.id);
      const qty = Math.max(1, Math.min(20, Number(input.room_quantity ?? count ?? 1) || 1));
      await rebuildOrderRooms(admin, {
        orderId: order.id,
        roomTypeId,
        roomQuantity: qty,
        total: finalTotal,
        checkIn: finalCheckIn,
        checkOut: finalCheckOut,
      });
    }

    await admin
      .from("owlting_email_parsed_staging")
      .update({
        auto_order_id: order.id,
        auto_create_error: null,
        modification_diff: diff,
        modification_diff_status: input.parser_diff_status ?? "db_compared",
        review_notes: `[auto-update] 修改通知已自動更新既有訂單 ${order.order_number}：${summary}`,
      })
      .eq("id", input.staging_id);

    return { ok: true, order_id: order.id, order_number: order.order_number, updated_fields: changed, diff };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
