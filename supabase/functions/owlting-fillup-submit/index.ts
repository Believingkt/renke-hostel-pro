// Public endpoint: owner submits PII → promote staging to a real order.
// POST { token, guest_name, guest_phone, guest_email, room_type_id?, total_amount? }
// Rate-limited: fail_count++ on bad inputs, lock 1h after 5.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { mergeLaterStaging, normalizeMerged } from "../_shared/owltingStagingMerge.ts";
import { upsertCustomerForOrder } from "../_shared/customerUpsert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
}

function validatePhone(p: string): boolean {
  const trimmed = p.replace(/[\s\-()+]/g, "");
  return /^[0-9]{8,15}$/.test(trimmed);
}

function validateEmail(e: string): boolean {
  if (!e) return true; // email optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

async function bumpFailure(admin: any, tokenId: string, currentFail: number, ip: string) {
  const newFail = currentFail + 1;
  const update: any = { fail_count: newFail, last_attempt_ip: ip };
  if (newFail >= 5) {
    update.locked_until = new Date(Date.now() + 3600 * 1000).toISOString();
  }
  await admin.from("owlting_fillup_tokens").update(update).eq("id", tokenId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    const guestName = String(body.guest_name ?? "").trim();
    const guestPhoneRaw = String(body.guest_phone ?? "").trim();
    const guestPhone = guestPhoneRaw.replace(/[\s\-()+]/g, "");
    const guestEmail = String(body.guest_email ?? "").trim();
    const roomTypeId = body.room_type_id ? String(body.room_type_id) : null;
    const rawAssignments = Array.isArray(body.room_assignments) ? body.room_assignments : null;
    type Assignment = { room_type_id: string; room_unit_id: string | null };
    const roomAssignments: Assignment[] = rawAssignments
      ? rawAssignments
          .map((r: any) => {
            if (!r || !r.room_type_id) return null;
            return {
              room_type_id: String(r.room_type_id),
              room_unit_id: r.room_unit_id ? String(r.room_unit_id) : null,
            } as Assignment;
          })
          .filter((x: Assignment | null): x is Assignment => !!x)
      : (roomTypeId ? [{ room_type_id: roomTypeId, room_unit_id: null }] : []);
    const totalAmount = body.total_amount != null ? Number(body.total_amount) : null;
    const guestCountOverride = body.guest_count != null ? Math.max(1, Math.round(Number(body.guest_count))) : null;
    const checkInOverride = body.check_in_date ? String(body.check_in_date) : null;
    const checkOutOverride = body.check_out_date ? String(body.check_out_date) : null;
    const paymentStatusRaw = String(body.payment_status ?? "").toLowerCase();
    const paymentStatusInput: "paid" | "unpaid" | null =
      paymentStatusRaw === "paid" ? "paid" : paymentStatusRaw === "unpaid" ? "unpaid" : null;
    const ip = clientIp(req);

    if (!token || token.length < 16) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tokenHash = await sha256Hex(token);

    const { data: tok } = await admin
      .from("owlting_fillup_tokens")
      .select("id, staging_id, accommodation_id, expires_at, used_at, fail_count, locked_until")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!tok) {
      return new Response(JSON.stringify({ error: "Token not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const now = new Date();
    if (tok.locked_until && new Date(tok.locked_until) > now) {
      return new Response(JSON.stringify({ error: "Token locked, try later" }), {
        status: 423, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (tok.used_at) {
      return new Response(JSON.stringify({ error: "Token already used" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(tok.expires_at) < now) {
      return new Response(JSON.stringify({ error: "Token expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Input validation
    if (guestName.length < 1 || guestName.length > 100) {
      await bumpFailure(admin, tok.id, tok.fail_count, ip);
      return new Response(JSON.stringify({ error: "姓名長度必須 1-100 字" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!validatePhone(guestPhone)) {
      await bumpFailure(admin, tok.id, tok.fail_count, ip);
      return new Response(JSON.stringify({ error: "電話格式不正確（需 8-15 碼）" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!validateEmail(guestEmail)) {
      await bumpFailure(admin, tok.id, tok.fail_count, ip);
      return new Response(JSON.stringify({ error: "Email 格式不正確" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: stagingRow } = await admin
      .from("owlting_email_parsed_staging")
      .select("*").eq("id", tok.staging_id).maybeSingle();
    // Apply later 修改 emails for the same OBE so we create the order in its
    // CURRENT state instead of the original one.
    const mergeRes = stagingRow
      ? await mergeLaterStaging(admin, stagingRow as any)
      : { merged: stagingRow as any, appliedIds: [] as string[], changes: [], cancelled: false };
    const staging: any = stagingRow
      ? normalizeMerged(mergeRes.merged, mergeRes.appliedIds.length > 0)
      : stagingRow;
    if (!staging || staging.pii_status === "promoted_to_booking") {
      return new Response(JSON.stringify({ error: "Order already submitted" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (staging.pii_status === "self_pushed") {
      return new Response(JSON.stringify({ error: "此為本站已推送的訂單，無需補單" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Defense-in-depth: block self-pushed sources (人客多 / Lakeze) from creating
    // duplicate orders even if UI or client bypasses the badge.
    const channelSourceRaw = String(staging.channel_source ?? "").trim().toLowerCase();
    const isSelfPush = channelSourceRaw.includes("人客多")
      || channelSourceRaw.includes("lakeze");
    if (isSelfPush) {
      await admin.from("owlting_email_parsed_staging").update({
        pii_status: "manual_review",
        review_notes: `[self-push] 阻擋重複建單：channel_source=${staging.channel_source}`,
      }).eq("id", staging.id);
      return new Response(JSON.stringify({
        error: "此訂單來源為「人客多 / Lakeze」，屬本站已推送的訂單。已阻擋重複建單，請至補單列表使用「連結自家訂單」。",
        is_self_push: true,
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const accId = tok.accommodation_id ?? staging.accommodation_id;
    if (!accId) {
      return new Response(JSON.stringify({ error: "Accommodation unresolved" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine final amount
    const resolvedTotal = totalAmount != null && !Number.isNaN(totalAmount)
      ? Math.max(0, Math.round(totalAmount))
      : Math.max(0, Math.round(Number(staging.total_amount ?? 0)));

    // Idempotency: OBE already promoted (non-pending) → return as duplicate.
    // If it's the auto-created pending order for this staging, fall through to UPDATE branch below.
    if (staging.obe_number) {
      const { data: existing } = await admin
        .from("orders").select("id, is_pii_pending")
        .eq("owlting_reservation_id", staging.obe_number).maybeSingle();
      if (existing && !existing.is_pii_pending && existing.id !== staging.auto_order_id) {
        await admin.from("owlting_email_parsed_staging").update({
          pii_status: "promoted_to_booking",
          promoted_order_id: existing.id,
          owner_filled_at: new Date().toISOString(),
        }).eq("id", staging.id);
        await admin.from("owlting_fillup_tokens").update({
          used_at: new Date().toISOString(),
          last_attempt_ip: ip,
        }).eq("id", tok.id);
        return new Response(JSON.stringify({ ok: true, order_id: existing.id, duplicate: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const finalGuestCount = guestCountOverride ?? staging.guest_count ?? 2;
    const finalCheckIn = checkInOverride ?? staging.check_in_date;
    const finalCheckOut = checkOutOverride ?? staging.check_out_date;
    if (!finalCheckIn || !finalCheckOut) {
      return new Response(JSON.stringify({ error: "缺少入住 / 退房日期，請於補單頁填入" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const nowIso = new Date().toISOString();

    // Normalize staging.channel_source (e.g. "Agoda", "Booking.com", "Expedia", "官網") into
    // a stable code stored on orders.ota_channel. Self-push sources (人客多/lakeze) are blocked
    // above, so we won't reach here with them.
    const rawChannel = String(staging.channel_source ?? "").trim();
    const lowerCh = rawChannel.toLowerCase();
    let otaChannel: string | null = null;
    if (lowerCh) {
      if (lowerCh.includes("agoda")) otaChannel = "agoda";
      else if (lowerCh.includes("booking")) otaChannel = "booking";
      else if (lowerCh.includes("expedia")) otaChannel = "expedia";
      else if (lowerCh.includes("trip") || lowerCh.includes("ctrip") || lowerCh.includes("攜程")) otaChannel = "trip";
      else if (lowerCh.includes("airbnb")) otaChannel = "airbnb";
      else if (lowerCh.includes("klook")) otaChannel = "klook";
      else if (lowerCh.includes("kkday")) otaChannel = "kkday";
      else if (lowerCh.includes("官網") || lowerCh.includes("direct")) otaChannel = "owlting_direct";
      else otaChannel = rawChannel; // fall back to raw label
    }

    // Resolve payment status:
    //  - Client-provided value wins.
    //  - Otherwise default by channel: booking.com/airbnb → unpaid, others → paid.
    let effectivePaymentStatus: "paid" | "unpaid";
    if (paymentStatusInput) {
      effectivePaymentStatus = paymentStatusInput;
    } else if (otaChannel === "booking" || otaChannel === "airbnb") {
      effectivePaymentStatus = "unpaid";
    } else {
      effectivePaymentStatus = "paid";
    }
    const effectivePaidAmount = effectivePaymentStatus === "paid" ? resolvedTotal : 0;

    // Order-level room_type_id: keep first assignment for backward compat with legacy views.
    const primaryRoomTypeId = roomAssignments[0]?.room_type_id ?? roomTypeId ?? null;

    // If email-ingest already auto-created a PII-pending order for this staging,
    // UPDATE it in place instead of inserting a duplicate. Otherwise, INSERT a new one.
    let inserted: {
      id: string;
      order_number: string;
      accommodation_id: string;
      room_type_id: string | null;
      check_in_date: string;
      check_out_date: string;
      final_price: number;
    } | null = null;
    let updatedExisting = false;

    if (staging.auto_order_id) {
      const { data: pendingOrder } = await admin
        .from("orders")
        .select("id, order_number, is_pii_pending, order_status")
        .eq("id", staging.auto_order_id)
        .maybeSingle();
      if (pendingOrder && pendingOrder.is_pii_pending && pendingOrder.order_status !== "cancelled") {
        const { data: updated, error: updErr } = await admin
          .from("orders")
          .update({
            room_type_id: primaryRoomTypeId,
            check_in_date: finalCheckIn,
            check_out_date: finalCheckOut,
            guest_count: finalGuestCount,
            guest_name: guestName,
            guest_phone: guestPhone,
            guest_email: guestEmail || null,
            total_price: resolvedTotal,
            final_price: resolvedTotal,
            ota_channel: otaChannel,
            payment_status: effectivePaymentStatus,
            paid_amount: effectivePaidAmount,
            is_pii_pending: false,
            notes: `奧丁丁訂單由業主補單 (OBE: ${staging.obe_number ?? ""}, ${staging.room_type_name ?? ""}${roomAssignments.length > 1 ? `, ${roomAssignments.length} 間` : ""}${rawChannel ? `, 平台: ${rawChannel}` : ""}, 付款: ${effectivePaymentStatus === "paid" ? "已付清" : "待結清"}) — 補齊自動鎖房訂單`,
          })
          .eq("id", pendingOrder.id)
          .select("id, order_number, accommodation_id, room_type_id, check_in_date, check_out_date, final_price")
          .single();
        if (updErr || !updated) {
          console.error("[owlting-fillup-submit] auto-order update failed:", updErr);
          return new Response(JSON.stringify({ error: "訂單更新失敗", detail: updErr?.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        inserted = updated as any;
        updatedExisting = true;
        // Clear existing order_rooms so we can re-insert per assignment.
        await admin.from("order_rooms").delete().eq("order_id", pendingOrder.id);
      }
    }

    if (!inserted) {
      const { data: insertedRow, error: insErr } = await admin.from("orders").insert({
        accommodation_id: accId,
        room_type_id: primaryRoomTypeId,
        check_in_date: finalCheckIn,
        check_out_date: finalCheckOut,
        guest_count: finalGuestCount,
        guest_name: guestName,
        guest_phone: guestPhone,
        guest_email: guestEmail || null,
        total_price: resolvedTotal,
        final_price: resolvedTotal,
        discount_amount: 0,
        order_source: "owlting",
        ota_channel: otaChannel,
        order_status: "confirmed",
        payment_status: effectivePaymentStatus,
        paid_amount: effectivePaidAmount,
        confirmed_at: nowIso,
        requires_owner_review: true,
        owlting_reservation_id: staging.obe_number,
        deposit_required_amount: 0,
        notes: `奧丁丁訂單由業主補單 (OBE: ${staging.obe_number ?? ""}, ${staging.room_type_name ?? ""}${roomAssignments.length > 1 ? `, ${roomAssignments.length} 間` : ""}${rawChannel ? `, 平台: ${rawChannel}` : ""}, 付款: ${effectivePaymentStatus === "paid" ? "已付清" : "待結清"})`,
      }).select("id, order_number, accommodation_id, room_type_id, check_in_date, check_out_date, final_price").single();

      if (insErr || !insertedRow) {
        console.error("[owlting-fillup-submit] order insert error:", insErr);
        return new Response(JSON.stringify({ error: "訂單建立失敗", detail: insErr?.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      inserted = insertedRow as any;
    }


    // Create one order_rooms row per assignment.
    // Honor manual room_unit_id when provided (validating it belongs to the room_type and is
    // not busy / already picked in this batch); otherwise auto-pick in display_order.
    const unitCache = new Map<string, { id: string; unit_number: string }[]>();
    const busyCache = new Map<string, Set<string>>();
    const pickedByType = new Map<string, Set<string>>();
    const perRoomPrice = roomAssignments.length > 0
      ? Math.round(resolvedTotal / roomAssignments.length)
      : resolvedTotal;

    // Pre-load caches for all room types involved
    const uniqueTypes = Array.from(new Set(roomAssignments.map((a) => a.room_type_id)));
    for (const rtId of uniqueTypes) {
      const { data: units } = await admin
        .from("room_units")
        .select("id, display_order, unit_number")
        .eq("room_type_id", rtId)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("unit_number", { ascending: true });
      unitCache.set(rtId, (units ?? []) as any);
      if (units && units.length > 0) {
        let q = admin
          .from("order_rooms")
          .select("room_unit_id, orders!inner(id, order_status, check_in_date, check_out_date)")
          .in("room_unit_id", units.map((u) => u.id))
          .neq("orders.order_status", "cancelled")
          .lt("orders.check_in_date", finalCheckOut)
          .gt("orders.check_out_date", finalCheckIn);
        // 排除本次補單所綁定的自動 pending 訂單，與前端邏輯保持一致
        if (staging.auto_order_id) {
          q = q.neq("orders.id", staging.auto_order_id);
        }
        const { data: conflicts } = await q;
        busyCache.set(
          rtId,
          new Set((conflicts ?? []).map((c: any) => c.room_unit_id).filter(Boolean)),
        );
      } else {
        busyCache.set(rtId, new Set());
      }
    }

    // Pass 1: reserve manual overrides (validate + mark as picked)
    for (const a of roomAssignments) {
      if (!a.room_unit_id) continue;
      const units = unitCache.get(a.room_type_id) ?? [];
      const busy = busyCache.get(a.room_type_id) ?? new Set<string>();
      const picked = pickedByType.get(a.room_type_id) ?? new Set<string>();
      const belongs = units.some((u) => u.id === a.room_unit_id);
      if (!belongs || busy.has(a.room_unit_id) || picked.has(a.room_unit_id)) {
        // Invalid override → drop it, will fall through to auto in pass 2
        a.room_unit_id = null;
        continue;
      }
      picked.add(a.room_unit_id);
      pickedByType.set(a.room_type_id, picked);
    }

    // Pass 2: insert rows, auto-picking any remaining
    for (const a of roomAssignments) {
      let assignedUnitId: string | null = a.room_unit_id;
      try {
        if (!assignedUnitId) {
          const units = unitCache.get(a.room_type_id) ?? [];
          const busy = busyCache.get(a.room_type_id) ?? new Set<string>();
          const picked = pickedByType.get(a.room_type_id) ?? new Set<string>();
          const free = units.find((u) => !busy.has(u.id) && !picked.has(u.id));
          if (free) {
            assignedUnitId = free.id;
            picked.add(free.id);
            pickedByType.set(a.room_type_id, picked);
          }
        }

        const { error: orErr } = await admin.from("order_rooms").insert({
          order_id: inserted!.id,
          room_type_id: a.room_type_id,
          quantity: 1,
          room_price: perRoomPrice,
          room_unit_id: assignedUnitId,
        });
        if (orErr) {
          console.error("[owlting-fillup-submit] order_rooms insert error:", orErr);
          if (assignedUnitId) {
            await admin.from("order_rooms").insert({
              order_id: inserted!.id,
              room_type_id: a.room_type_id,
              quantity: 1,
              room_price: perRoomPrice,
              room_unit_id: null,
            });
          }
        }
      } catch (e) {
        console.error("[owlting-fillup-submit] assign room unit failed:", e);
      }
    }


    // 補單完成 → 寫入/更新顧客資料（以 phone、其次 email 比對），並回填 orders.customer_id
    await upsertCustomerForOrder(admin, {
      accommodationId: accId,
      name: guestName,
      phone: guestPhone,
      email: guestEmail || null,
      firstOrderDate: finalCheckIn,
      orderId: inserted!.id,
      incrementVisit: !updatedExisting,
    });

    // Mark staging promoted + token used
    await admin.from("owlting_email_parsed_staging").update({
      pii_status: "promoted_to_booking",
      promoted_order_id: inserted!.id,
      owner_filled_at: nowIso,
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail || null,
      pii_masked: false,
    }).eq("id", staging.id);

    if (mergeRes.appliedIds.length > 0) {
      await admin.from("owlting_email_parsed_staging").update({
        pii_status: "promoted_to_booking",
        promoted_order_id: inserted!.id,
        owner_filled_at: nowIso,
      }).in("id", mergeRes.appliedIds);
    }

    await admin.from("owlting_fillup_tokens").update({
      used_at: nowIso,
      last_attempt_ip: ip,
    }).eq("id", tok.id);

    // Fire-and-forget: send guest confirmation email (抵達指引) via existing function
    let emailSent = false;
    if (guestEmail) {
      try {
        // Look up room name for the email
        let roomName = staging.room_type_name ?? "—";
        if (primaryRoomTypeId) {
          const { data: rt } = await admin
            .from("room_types").select("name").eq("id", primaryRoomTypeId).maybeSingle();
          if (rt?.name) roomName = rt.name;
        }
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            guestName,
            guestEmail,
            orderNumber: inserted!.order_number,
            roomName,
            checkInDate: staging.check_in_date,
            checkOutDate: staging.check_out_date,
            guestCount: finalGuestCount,
            mealPlan: "none",
            mealPlanDisplayName: "—",
            finalPrice: resolvedTotal,
            depositAmount: resolvedTotal,
            paymentMethod: "奧丁丁 OTA",
          }),
        });
        emailSent = emailResp.ok;
        if (emailResp.ok) {
          await admin.from("orders").update({
            internal_email_sent: true,
            internal_email_sent_at: nowIso,
          }).eq("id", inserted!.id);
        } else {
          console.error("[owlting-fillup-submit] confirmation email non-ok:", await emailResp.text());
        }
      } catch (emailErr) {
        console.error("[owlting-fillup-submit] confirmation email failed:", emailErr);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      order_id: inserted!.id,
      order_number: inserted!.order_number,
      email_sent: emailSent,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[owlting-fillup-submit] fatal:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
