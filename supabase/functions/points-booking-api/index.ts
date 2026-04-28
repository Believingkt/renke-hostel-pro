import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-platform-key",
};

interface Partner {
  id: string;
  platform_name: string;
  platform_code: string;
  point_to_currency_rate: number;
  is_active: boolean;
  webhook_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // --- Authenticate partner via x-platform-key header ---
    const apiKey = req.headers.get("x-platform-key");
    if (!apiKey) {
      return jsonResponse({ error: "Missing x-platform-key header" }, 401);
    }

    const { data: partner, error: partnerError } = await supabase
      .from("points_platform_partners")
      .select("id, platform_name, platform_code, point_to_currency_rate, is_active, webhook_url")
      .eq("api_key", apiKey)
      .maybeSingle();

    if (partnerError || !partner) {
      return jsonResponse({ error: "Invalid API key" }, 401);
    }
    if (!partner.is_active) {
      return jsonResponse({ error: "Partner account is inactive" }, 403);
    }

    // --- Route requests ---
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const route = pathParts.slice(1);

    // GET /accommodations
    if (req.method === "GET" && route[0] === "accommodations" && !route[1]) {
      return await handleListAccommodations(supabase);
    }

    // GET /accommodations/:id
    if (req.method === "GET" && route[0] === "accommodations" && route[1] && !route[2]) {
      return await handleGetAccommodation(supabase, route[1]);
    }

    // GET /accommodations/:id/room-types
    if (req.method === "GET" && route[0] === "accommodations" && route[1] && route[2] === "room-types") {
      return await handleGetRoomTypes(supabase, route[1]);
    }

    // GET /accommodations/:id/day-type-rules
    if (req.method === "GET" && route[0] === "accommodations" && route[1] && route[2] === "day-type-rules") {
      const year = url.searchParams.get("year");
      return await handleGetDayTypeRules(supabase, route[1], year ? parseInt(year) : null);
    }

    // POST /availability
    if (req.method === "POST" && route[0] === "availability") {
      const body = await req.json();
      return await handleCheckAvailability(supabase, body);
    }

    // POST /orders
    if (req.method === "POST" && route[0] === "orders" && !route[1]) {
      const body = await req.json();
      return await handleCreateOrder(supabase, partner, body);
    }

    // GET /orders/:id
    if (req.method === "GET" && route[0] === "orders" && route[1] && !route[2]) {
      return await handleGetOrder(supabase, partner, route[1]);
    }

    // POST /orders/:id/pay  (full payment of remaining amount)
    // POST /orders/:id/pay-deposit  (legacy alias — now also charges full remaining amount)
    if (
      req.method === "POST" &&
      route[0] === "orders" &&
      route[1] &&
      (route[2] === "pay" || route[2] === "pay-deposit")
    ) {
      const body = await req.json();
      return await handlePayRemaining(supabase, partner, route[1], body);
    }

    // POST /orders/:id/cancel
    if (req.method === "POST" && route[0] === "orders" && route[1] && route[2] === "cancel") {
      return await handleCancelOrder(supabase, partner, route[1]);
    }

    // GET /tappay-config
    if (req.method === "GET" && route[0] === "tappay-config") {
      return handleTapPayConfig();
    }

    return jsonResponse({ error: "Not found", available_routes: [
      "GET /accommodations",
      "GET /accommodations/:id",
      "GET /accommodations/:id/room-types",
      "GET /accommodations/:id/day-type-rules?year=2026",
      "POST /availability",
      "POST /orders",
      "GET /orders/:id",
      "POST /orders/:id/pay",
      "POST /orders/:id/cancel",
      "GET /tappay-config",
    ]}, 404);

  } catch (err) {
    console.error("Points Booking API error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

// ========== Handlers ==========

async function handleListAccommodations(supabase: any) {
  const { data, error } = await supabase
    .from("accommodation_info")
    .select(`
      id, name, description, address, phone, email,
      region_1, region_2, country, type, star_rating,
      latitude, longitude, hero_main_title, hero_description
    `)
    .eq("is_active", true)
    .order("display_order", { ascending: true, nullsFirst: false });

  if (error) throw error;

  const ids = data.map((a: any) => a.id);
  const { data: photos } = await supabase
    .from("accommodation_photos")
    .select("accommodation_id, photo_url, display_order")
    .in("accommodation_id", ids)
    .eq("photo_type", "hero")
    .order("display_order", { ascending: true });

  const photoMap: Record<string, string[]> = {};
  for (const p of photos || []) {
    if (!photoMap[p.accommodation_id]) photoMap[p.accommodation_id] = [];
    photoMap[p.accommodation_id].push(p.photo_url);
  }

  const { data: reviews } = await supabase
    .from("reviews")
    .select("accommodation_id, rating")
    .in("accommodation_id", ids)
    .eq("is_published", true);

  const ratingMap: Record<string, { sum: number; count: number }> = {};
  for (const r of reviews || []) {
    if (!ratingMap[r.accommodation_id]) ratingMap[r.accommodation_id] = { sum: 0, count: 0 };
    ratingMap[r.accommodation_id].sum += r.rating;
    ratingMap[r.accommodation_id].count += 1;
  }

  const result = data.map((a: any) => ({
    ...a,
    photos: photoMap[a.id] || [],
    rating: ratingMap[a.id]
      ? Math.round((ratingMap[a.id].sum / ratingMap[a.id].count) * 10) / 10
      : null,
    review_count: ratingMap[a.id]?.count || 0,
  }));

  return jsonResponse({ accommodations: result });
}

async function handleGetAccommodation(supabase: any, accId: string) {
  const { data, error } = await supabase
    .from("accommodation_info")
    .select(`
      id, name, description, address, phone, email,
      region_1, region_2, country, type, star_rating,
      latitude, longitude, hero_main_title, hero_description,
      facebook_url, instagram_url, line_id, website_url
    `)
    .eq("id", accId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return jsonResponse({ error: "Accommodation not found" }, 404);

  const { data: photos } = await supabase
    .from("accommodation_photos")
    .select("photo_url, display_order, photo_type")
    .eq("accommodation_id", accId)
    .order("display_order", { ascending: true });

  const { data: facilities } = await supabase
    .from("accommodation_facilities")
    .select("facility_name, category")
    .eq("accommodation_id", accId)
    .eq("is_available", true);

  const { data: reviews } = await supabase
    .from("reviews")
    .select("reviewer_name, rating, comment, review_date")
    .eq("accommodation_id", accId)
    .eq("is_published", true)
    .order("display_order", { ascending: true });

  const avgRating = reviews && reviews.length > 0
    ? Math.round((reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length) * 10) / 10
    : null;

  return jsonResponse({
    accommodation: {
      ...data,
      photos: photos || [],
      facilities: facilities || [],
      reviews: reviews || [],
      rating: avgRating,
      review_count: reviews?.length || 0,
    },
  });
}

async function handleGetRoomTypes(supabase: any, accId: string) {
  const { data: roomTypes, error } = await supabase
    .from("room_types")
    .select("id, name, name_en, description, capacity, base_price, size_sqm, room_count, display_order, is_exclusive_package")
    .eq("accommodation_id", accId)
    .order("display_order", { ascending: true, nullsFirst: false });

  if (error) throw error;

  const ids = roomTypes.map((r: any) => r.id);

  const { data: photos } = await supabase
    .from("room_photos")
    .select("room_type_id, photo_url, display_order")
    .in("room_type_id", ids)
    .order("display_order", { ascending: true });

  const photoMap: Record<string, string[]> = {};
  for (const p of photos || []) {
    if (!photoMap[p.room_type_id]) photoMap[p.room_type_id] = [];
    photoMap[p.room_type_id].push(p.photo_url);
  }

  const { data: amenities } = await supabase
    .from("room_amenities")
    .select("room_type_id, amenity_name, category")
    .in("room_type_id", ids);

  const amenityMap: Record<string, any[]> = {};
  for (const a of amenities || []) {
    if (!amenityMap[a.room_type_id]) amenityMap[a.room_type_id] = [];
    amenityMap[a.room_type_id].push({ name: a.amenity_name, category: a.category });
  }

  // Fetch pricing templates for each room type
  const { data: templates } = await supabase
    .from("pricing_templates")
    .select("id, template_name, price, weekday_price, peak_price, weekend_price, room_type_id")
    .eq("accommodation_id", accId)
    .order("display_order", { ascending: true, nullsFirst: false });

  const templateMap: Record<string, any[]> = {};
  for (const t of templates || []) {
    const key = t.room_type_id;
    if (!key) continue;
    if (!templateMap[key]) templateMap[key] = [];
    templateMap[key].push({
      id: t.id,
      template_name: t.template_name,
      price: t.price,
      weekday_price: t.weekday_price,
      peak_price: t.peak_price,
      weekend_price: t.weekend_price,
    });
  }

  const result = roomTypes.map((r: any) => ({
    ...r,
    photos: photoMap[r.id] || [],
    amenities: amenityMap[r.id] || [],
    pricing_templates: templateMap[r.id] || [],
  }));

  return jsonResponse({ room_types: result });
}

async function handleCheckAvailability(supabase: any, body: any) {
  const { accommodation_id, check_in_date, check_out_date, room_type_id } = body;

  if (!accommodation_id || !check_in_date || !check_out_date) {
    return jsonResponse({ error: "accommodation_id, check_in_date, check_out_date are required" }, 400);
  }

  const checkIn = new Date(check_in_date);
  const checkOut = new Date(check_out_date);
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    return jsonResponse({ error: "Invalid date range" }, 400);
  }

  let roomTypeFilter = supabase
    .from("room_types")
    .select("id, name, name_en, capacity, base_price, is_exclusive_package, is_bound_to_exclusive")
    .eq("accommodation_id", accommodation_id);

  if (room_type_id) {
    roomTypeFilter = roomTypeFilter.eq("id", room_type_id);
  }

  const { data: roomTypes, error: rtError } = await roomTypeFilter;
  if (rtError) throw rtError;

  const dates: string[] = [];
  const d = new Date(check_in_date);
  const endD = new Date(check_out_date);
  while (d < endD) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }

  // Fetch public holidays for date range
  const { data: holidays } = await supabase
    .from("public_holidays")
    .select("holiday_date, holiday_name, holiday_type")
    .eq("accommodation_id", accommodation_id)
    .gte("holiday_date", dates[0])
    .lte("holiday_date", dates[dates.length - 1]);

  const holidayMap: Record<string, { name: string; type: string }> = {};
  for (const h of holidays || []) {
    holidayMap[h.holiday_date] = { name: h.holiday_name, type: h.holiday_type };
  }

  const availability = [];

  for (const rt of roomTypes) {
    const { data: inventory } = await supabase
      .from("room_inventory_pricing")
      .select("date, price, price_2_meals, price_3_meals, available_rooms, is_available, min_nights, max_nights")
      .eq("room_type_id", rt.id)
      .in("date", dates);

    const inventoryMap: Record<string, any> = {};
    for (const inv of inventory || []) {
      inventoryMap[inv.date] = inv;
    }

    let hasExclusiveConflict = false;
    if (rt.is_exclusive_package || rt.is_bound_to_exclusive) {
      for (const date of dates) {
        const { data: exclusiveCheck } = await supabase
          .rpc("check_exclusive_room_booking", {
            p_accommodation_id: accommodation_id,
            p_date: date,
          });
        if (exclusiveCheck?.[0]?.has_booking && exclusiveCheck[0].booked_room_type_id !== rt.id) {
          hasExclusiveConflict = true;
          break;
        }
      }
    }

    if (hasExclusiveConflict) {
      availability.push({
        room_type_id: rt.id,
        room_name: rt.name,
        capacity: rt.capacity,
        available: false,
        reason: "exclusive_room_conflict",
        daily_prices: [],
      });
      continue;
    }

    let isAvailable = true;
    let minAvailableRooms = Infinity;
    const dailyPrices: any[] = [];
    let totalPrice = 0;

    for (const date of dates) {
      const inv = inventoryMap[date];
      if (!inv) {
        isAvailable = false;
        break;
      }
      if (inv.is_available === false || inv.available_rooms <= 0) {
        isAvailable = false;
        break;
      }
      minAvailableRooms = Math.min(minAvailableRooms, inv.available_rooms);
      const dateObj = new Date(date + "T00:00:00");
      const dayType = getDayTypeForDate(dateObj, date, holidayMap);
      dailyPrices.push({
        date,
        price: inv.price,
        price_2_meals: inv.price_2_meals,
        price_3_meals: inv.price_3_meals,
        day_type: dayType,
      });
      totalPrice += inv.price;
    }

    const nights = dates.length;
    const firstInv = inventoryMap[dates[0]];
    if (firstInv) {
      if (firstInv.min_nights && nights < firstInv.min_nights) {
        isAvailable = false;
      }
      if (firstInv.max_nights && nights > firstInv.max_nights) {
        isAvailable = false;
      }
    }

    availability.push({
      room_type_id: rt.id,
      room_name: rt.name,
      room_name_en: rt.name_en,
      capacity: rt.capacity,
      available: isAvailable,
      available_rooms: isAvailable ? minAvailableRooms : 0,
      nights,
      total_price: isAvailable ? totalPrice : null,
      daily_prices: isAvailable ? dailyPrices : [],
    });
  }

  return jsonResponse({ availability });
}

async function handleCreateOrder(supabase: any, partner: Partner, body: any) {
  const {
    accommodation_id,
    room_type_id,
    check_in_date,
    check_out_date,
    guest_name,
    guest_phone,
    guest_email,
    guest_count = 2,
    pricing_template_id,
    points_amount,
    external_user_id,
    external_transaction_id,
    notes,
  } = body;

  // Validate required fields
  const required = { accommodation_id, room_type_id, check_in_date, check_out_date, guest_name, guest_phone, points_amount, external_user_id, pricing_template_id };
  for (const [key, val] of Object.entries(required)) {
    if (!val && val !== 0) {
      return jsonResponse({ error: `${key} is required` }, 400);
    }
  }

  if (points_amount < 0) {
    return jsonResponse({ error: "points_amount must be non-negative" }, 400);
  }

  // Fetch pricing template
  const { data: selectedTemplate, error: templateError } = await supabase
    .from("pricing_templates")
    .select("id, template_name, price, weekday_price, peak_price, weekend_price, meal_plans, room_type_id, accommodation_id")
    .eq("id", pricing_template_id)
    .maybeSingle();

  if (templateError || !selectedTemplate) {
    return jsonResponse({ error: "Invalid pricing_template_id" }, 400);
  }

  // Verify template belongs to the specified room type
  if (selectedTemplate.room_type_id && selectedTemplate.room_type_id !== room_type_id) {
    return jsonResponse({ error: "pricing_template_id does not match the specified room_type_id" }, 400);
  }

  // Calculate currency from points (1 point = 1 TWD by default)
  const pointsCurrency = Math.floor(points_amount * partner.point_to_currency_rate);

  // Generate date list
  const dates: string[] = [];
  const d = new Date(check_in_date);
  const endD = new Date(check_out_date);
  while (d < endD) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }

  // Determine price column for inventory fallback
  let priceColumn: "price" | "price_2_meals" | "price_3_meals" = "price";
  const templateName = selectedTemplate.template_name || "";
  if (templateName.includes("三食") || templateName.includes("3_meals")) {
    priceColumn = "price_3_meals";
  } else if (templateName.includes("二食") || templateName.includes("2_meals")) {
    priceColumn = "price_2_meals";
  }

  // Check availability + pull project-specific overrides + public holidays in parallel
  const [{ data: inventory }, { data: overrides }, { data: holidayRows }] = await Promise.all([
    supabase
      .from("room_inventory_pricing")
      .select(`date, price, price_2_meals, price_3_meals, available_rooms, is_available`)
      .eq("room_type_id", room_type_id)
      .is("pricing_template_id", null)
      .in("date", dates),
    supabase
      .from("room_inventory_pricing")
      .select("date, price")
      .eq("room_type_id", room_type_id)
      .eq("pricing_template_id", pricing_template_id)
      .in("date", dates),
    supabase
      .from("public_holidays")
      .select("holiday_date, holiday_type")
      .eq("accommodation_id", selectedTemplate.accommodation_id)
      .in("holiday_date", dates),
  ]);

  if (!inventory || inventory.length < dates.length) {
    return jsonResponse({ error: "Some dates have no inventory configured" }, 400);
  }

  for (const inv of inventory) {
    if (inv.is_available === false || inv.available_rooms <= 0) {
      return jsonResponse({ error: `No availability on ${inv.date}` }, 400);
    }
  }

  // Build holiday + override maps
  const holidaySet = new Set<string>();
  const workOnWeekendSet = new Set<string>();
  for (const h of holidayRows || []) {
    if (h.holiday_type === "work_on_weekend") workOnWeekendSet.add(h.holiday_date);
    else holidaySet.add(h.holiday_date);
  }
  const overrideMap = new Map<string, number>();
  for (const o of overrides || []) {
    if (o.price != null) overrideMap.set(o.date, o.price);
  }
  const inventoryMap = new Map<string, any>();
  for (const inv of inventory) inventoryMap.set(inv.date, inv);

  // 三段式 day classifier:
  //  weekend (假日) = 週六 + 國定假日
  //  peak    (旺日) = 週五、週日（非國定假日）
  //  weekday (平日) = 週一至週四
  const classifyDay = (dateStr: string): "weekday" | "peak" | "weekend" => {
    if (holidaySet.has(dateStr)) return "weekend";
    const dt = new Date(dateStr + "T00:00:00");
    const day = dt.getUTCDay();
    if (day === 6) return "weekend";
    if ((day === 5 || day === 0) && !workOnWeekendSet.has(dateStr)) return "peak";
    return "weekday";
  };

  // Resolve per-night price using priority:
  //  1) override (project + date) → 2) template tier price → 3) inventory base row
  const weekdayP = selectedTemplate.weekday_price ?? selectedTemplate.price ?? null;
  const weekendP = selectedTemplate.weekend_price ?? selectedTemplate.price ?? weekdayP;
  const peakP =
    selectedTemplate.peak_price ??
    selectedTemplate.weekday_price ??
    weekendP;

  let totalPrice = 0;
  for (const dateStr of dates) {
    if (overrideMap.has(dateStr)) {
      totalPrice += overrideMap.get(dateStr)!;
      continue;
    }
    const tier = classifyDay(dateStr);
    const tierPrice =
      tier === "weekend" ? weekendP : tier === "peak" ? peakP : weekdayP;
    if (tierPrice != null && tierPrice > 0) {
      totalPrice += tierPrice;
      continue;
    }
    // Fallback to inventory base row
    const inv = inventoryMap.get(dateStr);
    const mealPrice = inv ? (inv as any)[priceColumn] : null;
    totalPrice += (mealPrice != null && mealPrice > 0) ? mealPrice : (inv?.price || 0);
  }

  // --- Full payment flow: points deduct from total, remaining must be paid in full by card ---
  // Points discount cannot exceed total price
  const pointsDiscount = Math.min(pointsCurrency, totalPrice);
  const remainingAfterPoints = totalPrice - pointsDiscount;
  // Deposit removed — full remaining amount must be paid by card
  const depositAmount = 0;
  const amountDueByCard = remainingAfterPoints;
  const finalPrice = totalPrice;

  // Determine payment status
  // If fully covered by points, mark as paid; otherwise unpaid until card payment completes
  const isFullyPaidByPoints = remainingAfterPoints === 0;
  const paymentStatus = isFullyPaidByPoints ? "paid" : "unpaid";
  const orderStatus = isFullyPaidByPoints ? "confirmed" : "pending";
  const paymentMethod = isFullyPaidByPoints ? "points" : "points_and_card";

  // Generate order number
  const orderNumber = generateOrderNumber();

  // Look up platform member by email or phone
  let memberId: string | null = null;
  if (guest_email || guest_phone) {
    const conditions: string[] = [];
    if (guest_email) conditions.push(`email.eq.${guest_email}`);
    if (guest_phone) conditions.push(`phone.eq.${guest_phone}`);
    
    const { data: member } = await supabase
      .from("platform_members")
      .select("id")
      .or(conditions.join(","))
      .maybeSingle();
    
    if (member) memberId = member.id;
  }

  const orderData = {
    accommodation_id,
    room_type_id,
    check_in_date,
    check_out_date,
    guest_name,
    guest_phone,
    guest_email: guest_email || null,
    guest_count,
    member_id: memberId,
    meal_plan: selectedTemplate.template_name || null,
    total_price: totalPrice,
    final_price: finalPrice,
    payment_method: paymentMethod,
    payment_status: paymentStatus,
    paid_amount: isFullyPaidByPoints ? totalPrice : pointsDiscount,
    deposit_amount: depositAmount,
    order_status: orderStatus,
    order_source: `points_${partner.platform_code}`,
    order_number: orderNumber,
    discount_amount: 0,
    notes: notes
      ? `[${partner.platform_name}] ${notes}`
      : `[${partner.platform_name}] 點數訂房 - 用戶ID: ${external_user_id}`,
  };

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert(orderData)
    .select("id, order_number, total_price, final_price, payment_status, order_status, deposit_amount, check_in_date, check_out_date")
    .single();

  if (orderError) {
    console.error("Order creation error:", orderError);
    return jsonResponse({ error: "Failed to create order", details: orderError.message }, 400);
  }

  // Record point transaction (deduction)
  await supabase.from("point_transactions").insert({
    partner_id: partner.id,
    order_id: order.id,
    transaction_type: "deduct",
    points_amount,
    currency_amount: pointsDiscount,
    external_user_id,
    external_transaction_id: external_transaction_id || null,
    status: "completed",
    metadata: {
      total_price: totalPrice,
      points_discount: pointsDiscount,
      remaining_after_points: remainingAfterPoints,
      amount_due_by_card: amountDueByCard,
      payment_method: paymentMethod,
      rate: partner.point_to_currency_rate,
    },
  });

  // Send booking confirmation email if guest_email is provided
  if (guest_email) {
    // Fetch room type name for the email
    const { data: roomType } = await supabase
      .from("room_types")
      .select("name")
      .eq("id", room_type_id)
      .maybeSingle();

    const supabaseUrlForFn = Deno.env.get("SUPABASE_URL")!;
    fetch(`${supabaseUrlForFn}/functions/v1/send-booking-confirmation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        guestName: guest_name,
        guestEmail: guest_email,
        orderNumber: order.order_number,
        roomName: roomType?.name || "房型",
        checkInDate: check_in_date,
        checkOutDate: check_out_date,
        guestCount: guest_count,
        mealPlan: selectedTemplate.template_name || "純住宿",
        finalPrice: totalPrice,
        depositAmount: 0,
        paymentMethod: paymentMethod,
      }),
    }).catch((e) => console.error("Booking confirmation email error:", e));
  }

  // Webhook notification
  if (partner.webhook_url) {
    fetch(partner.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "order.created",
        order_id: order.id,
        order_number: order.order_number,
        external_user_id,
        external_transaction_id,
        total_price: totalPrice,
        points_discount: pointsDiscount,
        remaining_after_points: remainingAfterPoints,
        amount_due_by_card: amountDueByCard,
        requires_card_payment: !isFullyPaidByPoints,
      }),
    }).catch((e) => console.error("Webhook error:", e));
  }

  return jsonResponse({
    order: {
      ...order,
      points_used: points_amount,
      points_discount: pointsDiscount,
      remaining_after_points: remainingAfterPoints,
      amount_due_by_card: amountDueByCard,
      requires_card_payment: !isFullyPaidByPoints,
      payment_method: paymentMethod,
    },
  }, 201);
}

// ========== Pay Remaining Amount with TapPay (full payment) ==========

async function handlePayRemaining(supabase: any, partner: Partner, orderId: string, body: any) {
  const { prime, cardholder, frontend_redirect_url, backend_notify_url } = body;

  if (!prime || typeof prime !== "string" || prime.length < 10) {
    return jsonResponse({ error: "Invalid prime token" }, 400);
  }

  // Get order and verify it belongs to this partner
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_number, order_status, payment_status, final_price, total_price, paid_amount, order_source, accommodation_id")
    .eq("id", orderId)
    .like("order_source", `points_${partner.platform_code}%`)
    .maybeSingle();

  if (error) throw error;
  if (!order) return jsonResponse({ error: "Order not found" }, 404);

  if (order.payment_status === "paid") {
    return jsonResponse({ error: "Order is already paid" }, 400);
  }
  if (order.order_status === "cancelled") {
    return jsonResponse({ error: "Order is cancelled" }, 400);
  }

  // Charge the full remaining amount = final_price - already paid (covered by points)
  const amountDue = (order.final_price || 0) - (order.paid_amount || 0);
  if (amountDue <= 0) {
    return jsonResponse({ error: "No outstanding amount for this order" }, 400);
  }

  const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
  const merchantId = Deno.env.get("TAPPAY_MERCHANT_ID");
  if (!partnerKey || !merchantId) {
    console.error("Missing TapPay credentials");
    return jsonResponse({ error: "Payment system not configured" }, 500);
  }

  const phone = cardholder?.phoneNumber || cardholder?.phone_number || "";
  const phoneE164 = normalizePhoneE164(phone);

  const envRaw = Deno.env.get("TAPPAY_ENV");
  const env = envRaw === "sandbox" ? "sandbox" : "production";
  const endpoint = env === "sandbox"
    ? "https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime"
    : "https://prod.tappaysdk.com/tpc/payment/pay-by-prime";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const defaultBackendNotify = `${supabaseUrl}/functions/v1/tappay-notify`;

  const tappayBody: Record<string, unknown> = {
    prime,
    partner_key: partnerKey,
    merchant_id: merchantId,
    amount: amountDue,
    currency: "TWD",
    details: `點數訂房尾款 - ${order.order_number}`,
    order_number: order.order_number,
    cardholder: {
      phone_number: phoneE164,
      name: cardholder?.name || "",
      email: cardholder?.email || "",
    },
    remember: false,
    three_domain_secure: true,
  };

  if (frontend_redirect_url || backend_notify_url) {
    tappayBody.result_url = {
      frontend_redirect_url: frontend_redirect_url || "",
      backend_notify_url: backend_notify_url || defaultBackendNotify,
    };
  }

  console.log("Processing full payment:", { orderId, amountDue, env });

  const tappayResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": partnerKey,
    },
    body: JSON.stringify(tappayBody),
  });

  const result = await tappayResponse.json();

  console.log("TapPay payment response:", {
    status: result.status,
    msg: result.msg,
    orderId,
    amountDue,
    hasPaymentUrl: !!result.payment_url,
  });

  if (result.status === 0) {
    if (result.payment_url) {
      return jsonResponse({
        success: true,
        requires_3d_secure: true,
        payment_url: result.payment_url,
        rec_trade_id: result.rec_trade_id,
        amount: amountDue,
        message: "需要進行 3D 驗證",
      });
    }

    // Direct success — mark order as fully paid
    await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        payment_method: "credit_card",
        paid_amount: (order.paid_amount || 0) + amountDue,
        order_status: "confirmed",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (partner.webhook_url) {
      fetch(partner.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "order.paid",
          order_id: orderId,
          order_number: order.order_number,
          amount: amountDue,
          rec_trade_id: result.rec_trade_id,
        }),
      }).catch((e) => console.error("Webhook error:", e));
    }

    return jsonResponse({
      success: true,
      requires_3d_secure: false,
      rec_trade_id: result.rec_trade_id,
      bank_transaction_id: result.bank_transaction_id,
      amount: amountDue,
      message: "付款成功",
    });
  } else {
    let userMessage = "付款失敗";
    let suggestion = "請檢查卡片資訊或聯繫發卡銀行";

    switch (result.status) {
      case 1: userMessage = "系統錯誤"; suggestion = "請稍後再試"; break;
      case 3: userMessage = "卡片資訊錯誤"; suggestion = "請檢查卡號、有效期限和安全碼"; break;
      case 10: userMessage = "授權失敗"; suggestion = "卡片餘額不足，請更換卡片"; break;
      case 924: userMessage = "3D驗證失敗"; suggestion = "請完成銀行身份驗證"; break;
    }

    return jsonResponse({
      success: false,
      message: userMessage,
      suggestion,
      error_code: result.status,
      technical_message: result.msg,
    });
  }
}

// ========== TapPay Config for external platforms ==========

function handleTapPayConfig() {
  const appId = Deno.env.get("TAPPAY_APP_ID");
  const appKey = Deno.env.get("TAPPAY_APP_KEY");
  const envRaw = Deno.env.get("TAPPAY_ENV");
  const env = envRaw === "sandbox" ? "sandbox" : "production";

  if (!appId || !appKey) {
    return jsonResponse({ error: "TapPay not configured" }, 500);
  }

  return jsonResponse({
    app_id: Number(appId),
    app_key: appKey,
    env,
    sdk_url: "https://js.tappaysdk.com/sdk/tpdirect/v5.18.0",
  });
}

async function handleGetOrder(supabase: any, partner: Partner, orderId: string) {
  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      id, order_number, accommodation_id, room_type_id,
      check_in_date, check_out_date, guest_name, guest_phone, guest_email,
      guest_count, meal_plan, total_price, final_price, deposit_amount,
      payment_status, payment_method, order_status, order_source,
      paid_amount, notes, created_at
    `)
    .eq("id", orderId)
    .like("order_source", `points_${partner.platform_code}%`)
    .maybeSingle();

  if (error) throw error;
  if (!order) return jsonResponse({ error: "Order not found" }, 404);

  const { data: transaction } = await supabase
    .from("point_transactions")
    .select("points_amount, currency_amount, external_user_id, external_transaction_id, status, metadata")
    .eq("order_id", orderId)
    .eq("partner_id", partner.id)
    .eq("transaction_type", "deduct")
    .maybeSingle();

  const { data: roomType } = await supabase
    .from("room_types")
    .select("name, name_en")
    .eq("id", order.room_type_id)
    .maybeSingle();

  const { data: acc } = await supabase
    .from("accommodation_info")
    .select("name")
    .eq("id", order.accommodation_id)
    .maybeSingle();

  const pointsDiscount = transaction?.currency_amount || 0;
  const remainingAfterPoints = order.total_price - pointsDiscount;

  return jsonResponse({
    order: {
      ...order,
      accommodation_name: acc?.name,
      room_type_name: roomType?.name,
      room_type_name_en: roomType?.name_en,
      points_discount: pointsDiscount,
      remaining_after_points: remainingAfterPoints,
      point_transaction: transaction,
    },
  });
}

async function handleCancelOrder(supabase: any, partner: Partner, orderId: string) {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_number, order_status, order_source, final_price")
    .eq("id", orderId)
    .like("order_source", `points_${partner.platform_code}%`)
    .maybeSingle();

  if (error) throw error;
  if (!order) return jsonResponse({ error: "Order not found" }, 404);

  if (order.order_status === "cancelled") {
    return jsonResponse({ error: "Order is already cancelled" }, 400);
  }
  if (order.order_status === "checked_out") {
    return jsonResponse({ error: "Cannot cancel a checked-out order" }, 400);
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      order_status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (updateError) throw updateError;

  const { data: origTransaction } = await supabase
    .from("point_transactions")
    .select("*")
    .eq("order_id", orderId)
    .eq("partner_id", partner.id)
    .eq("transaction_type", "deduct")
    .maybeSingle();

  if (origTransaction) {
    await supabase
      .from("point_transactions")
      .update({ status: "refunded" })
      .eq("id", origTransaction.id);

    await supabase.from("point_transactions").insert({
      partner_id: partner.id,
      order_id: orderId,
      transaction_type: "refund",
      points_amount: origTransaction.points_amount,
      currency_amount: origTransaction.currency_amount,
      external_user_id: origTransaction.external_user_id,
      external_transaction_id: origTransaction.external_transaction_id,
      status: "completed",
      metadata: { original_transaction_id: origTransaction.id },
    });

    if (partner.webhook_url) {
      fetch(partner.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "order.cancelled",
          order_id: orderId,
          order_number: order.order_number,
          external_user_id: origTransaction.external_user_id,
          refund_points: origTransaction.points_amount,
        }),
      }).catch((e) => console.error("Webhook error:", e));
    }
  }

  return jsonResponse({
    message: "Order cancelled successfully",
    order_id: orderId,
    order_number: order.order_number,
    refunded_points: origTransaction?.points_amount || 0,
  });
}

// ========== Day Type Rules ==========

async function handleGetDayTypeRules(supabase: any, accId: string, year: number | null) {
  const targetYear = year || new Date().getFullYear();

  // Fetch public holidays for this accommodation and year
  const startDate = `${targetYear}-01-01`;
  const endDate = `${targetYear}-12-31`;

  const { data: holidays, error } = await supabase
    .from("public_holidays")
    .select("holiday_date, holiday_name, holiday_type")
    .eq("accommodation_id", accId)
    .gte("holiday_date", startDate)
    .lte("holiday_date", endDate)
    .order("holiday_date", { ascending: true });

  if (error) throw error;

  const publicHolidays = (holidays || [])
    .filter((h: any) => h.holiday_type === "holiday")
    .map((h: any) => ({
      date: h.holiday_date,
      name: h.holiday_name,
    }));

  const compensatoryWorkdays = (holidays || [])
    .filter((h: any) => h.holiday_type === "workday")
    .map((h: any) => ({
      date: h.holiday_date,
      name: h.holiday_name,
    }));

  return jsonResponse({
    year: targetYear,
    rules: {
      description: "平日為週日至週五（不含國定假日），假日為週六與國定假日。補班日視為平日。",
      description_en: "Weekday = Sunday to Friday (excluding public holidays). Weekend = Saturday + public holidays. Compensatory workdays are treated as weekdays.",
      weekend_days: ["Saturday"],
      weekend_days_number: [6],
    },
    public_holidays: publicHolidays,
    compensatory_workdays: compensatoryWorkdays,
  });
}

/**
 * Determine day type for a given date considering holidays
 */
function getDayTypeForDate(
  dateObj: Date,
  dateStr: string,
  holidayMap: Record<string, { name: string; type: string }>
): "weekday" | "weekend" | "holiday" {
  const holiday = holidayMap[dateStr];
  if (holiday) {
    if (holiday.type === "workday") return "weekday"; // 補班日
    return "holiday"; // 國定假日
  }
  if (dateObj.getDay() === 6) return "weekend"; // Saturday
  return "weekday";
}

// ========== Helpers ==========

function generateOrderNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function normalizePhoneE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("09") && cleaned.length === 10) return "+886" + cleaned.substring(1);
  if (cleaned.startsWith("886")) return "+" + cleaned;
  return "+886" + cleaned;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
