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
    const paymentStatus = defaultPaymentStatusForChannel(otaChannel);
    const paidAmount = paymentStatus === "paid" ? total : 0;
    const nowIso = new Date().toISOString();

    const placeholderName = `待補資料 (OBE ${input.obe_number})`;

    const { data: inserted, error: insErr } = await admin
      .from("orders")
      .insert({
        accommodation_id: input.accommodation_id,
        room_type_id: roomTypeId,
        check_in_date: input.check_in_date,
        check_out_date: input.check_out_date,
        guest_count: guestCount,
        guest_name: placeholderName,
        guest_phone: "",
        guest_email: null,
        total_price: total,
        final_price: total,
        discount_amount: 0,
        order_source: "owlting",
        ota_channel: otaChannel,
        order_status: "confirmed",
        payment_status: paymentStatus,
        paid_amount: paidAmount,
        confirmed_at: nowIso,
        requires_owner_review: true,
        owlting_reservation_id: input.obe_number,
        deposit_required_amount: 0,
        is_pii_pending: true,
        auto_created_from_email_id: input.raw_email_id,
        notes: `[自動鎖房] 奧丁丁 OTA email 進來自動建立 pending 訂單 (OBE: ${input.obe_number}${input.channel_source ? `, 平台: ${input.channel_source}` : ""}, ${roomQuantity} 間, 付款: ${paymentStatus === "paid" ? "已付清" : "待結清"})，待業主補齊住客資料。`,
      })
      .select("id, order_number")
      .single();

    if (insErr || !inserted) {
      return { ok: false, error: insErr?.message ?? "insert_failed" };
    }

    // Auto-assign units for each room row (sequential display_order pick).
    const { data: units } = await admin
      .from("room_units")
      .select("id, display_order, unit_number")
      .eq("room_type_id", roomTypeId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("unit_number", { ascending: true });

    const busySet = new Set<string>();
    if (units && units.length > 0) {
      const { data: conflicts } = await admin
        .from("order_rooms")
        .select("room_unit_id, orders!inner(order_status, check_in_date, check_out_date)")
        .in("room_unit_id", units.map((u: any) => u.id))
        .neq("orders.order_status", "cancelled")
        .lt("orders.check_in_date", input.check_out_date)
        .gt("orders.check_out_date", input.check_in_date);
      for (const c of conflicts ?? []) {
        if ((c as any).room_unit_id) busySet.add((c as any).room_unit_id);
      }
    }

    const perRoomPrice = Math.round(total / roomQuantity);
    const pickedIds = new Set<string>();
    for (let i = 0; i < roomQuantity; i++) {
      const free = (units ?? []).find((u: any) => !busySet.has(u.id) && !pickedIds.has(u.id));
      if (free) pickedIds.add(free.id);
      await admin.from("order_rooms").insert({
        order_id: inserted.id,
        room_type_id: roomTypeId,
        quantity: 1,
        room_price: perRoomPrice,
        room_unit_id: free?.id ?? null,
      });
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
        cancellation_reason: "OwlTing OTA 取消通知（自動同步）",
      })
      .in("id", ids);
    return ids;
  } catch (e) {
    console.error("[cancelAutoPendingOrders] failed:", e);
    return [];
  }
}
