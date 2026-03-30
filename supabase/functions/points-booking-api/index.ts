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
      .select("id, platform_name, platform_code, point_to_currency_rate, is_active")
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
    // Edge function path: /points-booking-api/...
    // pathParts[0] = "points-booking-api", rest is the route
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

    // POST /orders/:id/cancel
    if (req.method === "POST" && route[0] === "orders" && route[1] && route[2] === "cancel") {
      return await handleCancelOrder(supabase, partner, route[1]);
    }

    return jsonResponse({ error: "Not found", available_routes: [
      "GET /accommodations",
      "GET /accommodations/:id",
      "GET /accommodations/:id/room-types",
      "POST /availability",
      "POST /orders",
      "GET /orders/:id",
      "POST /orders/:id/cancel",
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

  // Fetch hero photos for each accommodation
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

  // Fetch reviews avg rating
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

  // Photos
  const { data: photos } = await supabase
    .from("accommodation_photos")
    .select("photo_url, display_order, photo_type")
    .eq("accommodation_id", accId)
    .order("display_order", { ascending: true });

  // Facilities
  const { data: facilities } = await supabase
    .from("accommodation_facilities")
    .select("facility_name, category")
    .eq("accommodation_id", accId)
    .eq("is_available", true);

  // Reviews
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

  // Photos
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

  // Amenities
  const { data: amenities } = await supabase
    .from("room_amenities")
    .select("room_type_id, amenity_name, category")
    .in("room_type_id", ids);

  const amenityMap: Record<string, any[]> = {};
  for (const a of amenities || []) {
    if (!amenityMap[a.room_type_id]) amenityMap[a.room_type_id] = [];
    amenityMap[a.room_type_id].push({ name: a.amenity_name, category: a.category });
  }

  const result = roomTypes.map((r: any) => ({
    ...r,
    photos: photoMap[r.id] || [],
    amenities: amenityMap[r.id] || [],
  }));

  return jsonResponse({ room_types: result });
}

async function handleCheckAvailability(supabase: any, body: any) {
  const { accommodation_id, check_in_date, check_out_date, room_type_id } = body;

  if (!accommodation_id || !check_in_date || !check_out_date) {
    return jsonResponse({ error: "accommodation_id, check_in_date, check_out_date are required" }, 400);
  }

  // Validate dates
  const checkIn = new Date(check_in_date);
  const checkOut = new Date(check_out_date);
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    return jsonResponse({ error: "Invalid date range" }, 400);
  }

  // Get room types to check
  let roomTypeFilter = supabase
    .from("room_types")
    .select("id, name, name_en, capacity, base_price, is_exclusive_package, is_bound_to_exclusive")
    .eq("accommodation_id", accommodation_id);

  if (room_type_id) {
    roomTypeFilter = roomTypeFilter.eq("id", room_type_id);
  }

  const { data: roomTypes, error: rtError } = await roomTypeFilter;
  if (rtError) throw rtError;

  // Generate date list
  const dates: string[] = [];
  const d = new Date(check_in_date);
  const endD = new Date(check_out_date);
  while (d < endD) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }

  const availability = [];

  for (const rt of roomTypes) {
    // Get inventory for all dates
    const { data: inventory } = await supabase
      .from("room_inventory_pricing")
      .select("date, price, price_2_meals, price_3_meals, available_rooms, is_available, min_nights, max_nights")
      .eq("room_type_id", rt.id)
      .in("date", dates);

    const inventoryMap: Record<string, any> = {};
    for (const inv of inventory || []) {
      inventoryMap[inv.date] = inv;
    }

    // Check exclusive room conflicts
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

    // Check each date availability
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
      dailyPrices.push({
        date,
        price: inv.price,
        price_2_meals: inv.price_2_meals,
        price_3_meals: inv.price_3_meals,
      });
      totalPrice += inv.price;
    }

    // Check min/max nights
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
    meal_plan,
    points_amount,
    cash_amount = 0,
    external_user_id,
    external_transaction_id,
    notes,
  } = body;

  // Validate required fields
  const required = { accommodation_id, room_type_id, check_in_date, check_out_date, guest_name, guest_phone, points_amount, external_user_id };
  for (const [key, val] of Object.entries(required)) {
    if (!val && val !== 0) {
      return jsonResponse({ error: `${key} is required` }, 400);
    }
  }

  if (points_amount < 0) {
    return jsonResponse({ error: "points_amount must be non-negative" }, 400);
  }

  // Calculate currency from points
  const pointsCurrency = Math.floor(points_amount * partner.point_to_currency_rate);
  const totalPaid = pointsCurrency + (cash_amount || 0);

  // Check availability first
  const dates: string[] = [];
  const d = new Date(check_in_date);
  const endD = new Date(check_out_date);
  while (d < endD) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }

  // Get price based on meal plan
  let priceColumn = "price";
  if (meal_plan) {
    // Lookup template to determine column
    const { data: template } = await supabase
      .from("pricing_templates")
      .select("meal_plans")
      .eq("accommodation_id", accommodation_id)
      .eq("template_name", meal_plan)
      .maybeSingle();

    if (template?.meal_plans && Array.isArray(template.meal_plans)) {
      const mealCount = template.meal_plans.length;
      if (mealCount >= 3) priceColumn = "price_3_meals";
      else if (mealCount === 2) priceColumn = "price_2_meals";
    }
  }

  const { data: inventory } = await supabase
    .from("room_inventory_pricing")
    .select(`date, ${priceColumn}, available_rooms, is_available`)
    .eq("room_type_id", room_type_id)
    .in("date", dates);

  if (!inventory || inventory.length < dates.length) {
    return jsonResponse({ error: "Some dates have no inventory configured" }, 400);
  }

  let totalPrice = 0;
  for (const inv of inventory) {
    if (inv.is_available === false || inv.available_rooms <= 0) {
      return jsonResponse({ error: `No availability on ${inv.date}` }, 400);
    }
    totalPrice += inv[priceColumn] || inv.price;
  }

  // Verify payment covers total
  if (totalPaid < totalPrice) {
    return jsonResponse({
      error: "Insufficient payment",
      total_price: totalPrice,
      points_currency: pointsCurrency,
      cash_amount: cash_amount || 0,
      total_paid: totalPaid,
      shortfall: totalPrice - totalPaid,
    }, 400);
  }

  // Determine payment status and method
  const paymentMethod = cash_amount > 0 ? "points_and_cash" : "points";
  const discountAmount = pointsCurrency; // Points used as discount
  const finalPrice = totalPrice;

  // Create order via direct insert (trigger will validate)
  const orderData = {
    accommodation_id,
    room_type_id,
    check_in_date,
    check_out_date,
    guest_name,
    guest_phone,
    guest_email: guest_email || null,
    guest_count,
    meal_plan: meal_plan || null,
    total_price: totalPrice,
    final_price: finalPrice,
    payment_method: paymentMethod,
    payment_status: "paid",
    paid_amount: totalPaid,
    order_status: "confirmed",
    order_source: `points_${partner.platform_code}`,
    notes: notes
      ? `[${partner.platform_name}] ${notes}`
      : `[${partner.platform_name}] 點數訂房 - 用戶ID: ${external_user_id}`,
    discount_amount: 0, // We don't use discount_code mechanism
  };

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert(orderData)
    .select("id, order_number, total_price, final_price, payment_status, order_status, check_in_date, check_out_date")
    .single();

  if (orderError) {
    console.error("Order creation error:", orderError);
    return jsonResponse({ error: "Failed to create order", details: orderError.message }, 400);
  }

  // Record point transaction
  await supabase.from("point_transactions").insert({
    partner_id: partner.id,
    order_id: order.id,
    transaction_type: "deduct",
    points_amount,
    currency_amount: pointsCurrency,
    external_user_id,
    external_transaction_id: external_transaction_id || null,
    status: "completed",
    metadata: {
      cash_amount: cash_amount || 0,
      payment_method: paymentMethod,
      rate: partner.point_to_currency_rate,
    },
  });

  // Send webhook notification if configured
  if (partner.webhook_url) {
    // Fire and forget
    fetch(partner.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "order.created",
        order_id: order.id,
        order_number: order.order_number,
        external_user_id,
        external_transaction_id,
        points_amount,
        cash_amount: cash_amount || 0,
        total_price: totalPrice,
      }),
    }).catch((e) => console.error("Webhook error:", e));
  }

  return jsonResponse({
    order: {
      ...order,
      points_used: points_amount,
      points_currency: pointsCurrency,
      cash_amount: cash_amount || 0,
      payment_method: paymentMethod,
    },
  }, 201);
}

async function handleGetOrder(supabase: any, partner: Partner, orderId: string) {
  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      id, order_number, accommodation_id, room_type_id,
      check_in_date, check_out_date, guest_name, guest_phone, guest_email,
      guest_count, meal_plan, total_price, final_price,
      payment_status, payment_method, order_status, order_source,
      notes, created_at
    `)
    .eq("id", orderId)
    .like("order_source", `points_${partner.platform_code}%`)
    .maybeSingle();

  if (error) throw error;
  if (!order) return jsonResponse({ error: "Order not found" }, 404);

  // Get point transaction
  const { data: transaction } = await supabase
    .from("point_transactions")
    .select("points_amount, currency_amount, external_user_id, external_transaction_id, status, metadata")
    .eq("order_id", orderId)
    .eq("partner_id", partner.id)
    .maybeSingle();

  // Get room type name
  const { data: roomType } = await supabase
    .from("room_types")
    .select("name, name_en")
    .eq("id", order.room_type_id)
    .maybeSingle();

  // Get accommodation name
  const { data: acc } = await supabase
    .from("accommodation_info")
    .select("name")
    .eq("id", order.accommodation_id)
    .maybeSingle();

  return jsonResponse({
    order: {
      ...order,
      accommodation_name: acc?.name,
      room_type_name: roomType?.name,
      room_type_name_en: roomType?.name_en,
      point_transaction: transaction,
    },
  });
}

async function handleCancelOrder(supabase: any, partner: Partner, orderId: string) {
  // Get order
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

  // Cancel the order
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      order_status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (updateError) throw updateError;

  // Get original point transaction and create refund record
  const { data: origTransaction } = await supabase
    .from("point_transactions")
    .select("*")
    .eq("order_id", orderId)
    .eq("partner_id", partner.id)
    .eq("transaction_type", "deduct")
    .maybeSingle();

  if (origTransaction) {
    // Update original transaction status
    await supabase
      .from("point_transactions")
      .update({ status: "refunded" })
      .eq("id", origTransaction.id);

    // Create refund record
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

    // Webhook notification
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

// ========== Helpers ==========

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
