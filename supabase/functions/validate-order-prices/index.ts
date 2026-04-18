import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CustomAddonInput {
  addon_type: string;
  count: number;
  price_per_unit: number;
  total: number;
}

interface OrderValidationRequest {
  accommodationId: string;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  totalPrice: number;
  discountCode?: string | null;
  discountAmount: number;
  finalPrice: number;
  mealPlan?: string | null;
  mealPlanDetails?: Array<{ date: string; count: number; price: number }>;
  mealPlanTotal?: number;
  petCount?: number;
  petPlanPrice?: number;
  customAddonDetails?: CustomAddonInput[] | null;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  calculatedPrices: {
    totalPrice: number;
    discountAmount: number;
    finalPrice: number;
    mealPlanTotal: number;
    petPlanPrice: number;
    customAddonTotal: number;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: OrderValidationRequest = await req.json();
    
    const {
      accommodationId,
      roomTypeId,
      checkInDate,
      checkOutDate,
      totalPrice,
      discountCode,
      discountAmount,
      finalPrice,
      mealPlan,
      mealPlanDetails,
      mealPlanTotal = 0,
      petCount = 0,
      petPlanPrice = 0,
      customAddonDetails = null,
    } = body;

    const errors: string[] = [];
    
    // Validate required fields
    if (!accommodationId || !roomTypeId || !checkInDate || !checkOutDate) {
      return new Response(
        JSON.stringify({ 
          isValid: false, 
          errors: ["Missing required fields: accommodationId, roomTypeId, checkInDate, checkOutDate"],
          calculatedPrices: null
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse dates
    const startDate = new Date(checkInDate);
    const endDate = new Date(checkOutDate);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return new Response(
        JSON.stringify({ 
          isValid: false, 
          errors: ["Invalid date format"],
          calculatedPrices: null
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate nights
    const nights = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (nights <= 0) {
      return new Response(
        JSON.stringify({ 
          isValid: false, 
          errors: ["Check-out date must be after check-in date"],
          calculatedPrices: null
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get room inventory pricing for the date range
    const dates: string[] = [];
    const currentDate = new Date(startDate);
    while (currentDate < endDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const { data: pricingData, error: pricingError } = await supabase
      .from("room_inventory_pricing")
      .select("date, price, price_2_meals, price_3_meals, is_available, available_rooms")
      .eq("room_type_id", roomTypeId)
      .in("date", dates);

    if (pricingError) {
      console.error("Error fetching pricing data:", pricingError);
      return new Response(
        JSON.stringify({ 
          isValid: false, 
          errors: ["Failed to fetch room pricing"],
          calculatedPrices: null
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate server-side room price
    let calculatedRoomTotal = 0;
    const pricingMap = new Map<
      string,
      {
        price: number;
        price_2_meals: number | null;
        price_3_meals: number | null;
        is_available: boolean | null;
        available_rooms: number | null;
      }
    >();

    if (pricingData) {
      for (const p of pricingData) {
        pricingMap.set(p.date, p);
      }
    }

    // Get room type base price as fallback
    const { data: roomType } = await supabase
      .from("room_types")
      .select("base_price")
      .eq("id", roomTypeId)
      .single();

    const basePrice = roomType?.base_price || 0;

    for (const date of dates) {
      const pricing = pricingMap.get(date);
      if (pricing) {
        // 關閉販售/無庫存：不可預訂
        if (pricing.is_available === false) {
          errors.push(`Room is unavailable on ${date}`);
        }
        if (typeof pricing.available_rooms === 'number' && pricing.available_rooms <= 0) {
          errors.push(`No availability on ${date}`);
        }

        // Use meal plan price if applicable
        if (mealPlan === "2_meals" && pricing.price_2_meals) {
          calculatedRoomTotal += pricing.price_2_meals;
        } else if (mealPlan === "3_meals" && pricing.price_3_meals) {
          calculatedRoomTotal += pricing.price_3_meals;
        } else {
          calculatedRoomTotal += pricing.price;
        }
      } else {
        // Fallback to base price
        calculatedRoomTotal += basePrice;
      }
    }

    // Calculate pet plan price
    let calculatedPetPrice = 0;
    if (petCount && petCount > 0) {
      const { data: petAddon } = await supabase
        .from("addon_settings")
        .select("price_per_unit")
        .eq("accommodation_id", accommodationId)
        .eq("addon_type", "pet")
        .eq("enabled", true)
        .maybeSingle();

      if (petAddon) {
        calculatedPetPrice = petAddon.price_per_unit * petCount * nights;
      }
    }

    // Calculate meal plan total
    let calculatedMealPlanTotal = 0;
    if (mealPlanDetails && Array.isArray(mealPlanDetails)) {
      for (const detail of mealPlanDetails) {
        if (typeof detail.count === 'number' && typeof detail.price === 'number') {
          calculatedMealPlanTotal += detail.count * detail.price;
        }
      }
    }

    // Calculate custom addon total
    let calculatedCustomAddonTotal = 0;
    if (customAddonDetails && Array.isArray(customAddonDetails)) {
      for (const addon of customAddonDetails) {
        if (typeof addon.count === 'number' && typeof addon.price_per_unit === 'number') {
          calculatedCustomAddonTotal += addon.count * addon.price_per_unit * nights;
        }
      }
    }

    // Calculate server-side total price
    const calculatedTotalPrice = calculatedRoomTotal + calculatedPetPrice + calculatedMealPlanTotal + calculatedCustomAddonTotal;

    // Validate discount code if provided
    // Discount applies only to room total, NOT addons
    let calculatedDiscount = 0;
    if (discountCode) {
      const { data: discountResult, error: discountError } = await supabase
        .rpc("validate_discount_code", {
          p_accommodation_id: accommodationId,
          p_code: discountCode,
          p_order_amount: calculatedRoomTotal,
          p_room_type_id: roomTypeId,
          p_check_in_date: checkInDate
        });

      if (discountError) {
        console.error("Discount validation error:", discountError);
        errors.push("Failed to validate discount code");
      } else if (discountResult && discountResult[0]?.is_valid) {
        const discountInfo = discountResult[0];
        if (discountInfo.discount_type === "percentage") {
          calculatedDiscount = Math.round(calculatedRoomTotal * (discountInfo.discount_value / 100));
        } else if (discountInfo.discount_type === "fixed") {
          calculatedDiscount = Math.min(discountInfo.discount_value, calculatedRoomTotal);
        }
      } else if (discountResult && discountResult[0] && !discountResult[0].is_valid) {
        errors.push(`Discount code invalid: ${discountResult[0].message || "Unknown error"}`);
      }
    }

    // Calculate final price
    const calculatedFinalPrice = calculatedTotalPrice - calculatedDiscount;

    // Validation tolerances (tightened from 10 → 2 currency units for rounding only)
    const priceTolerance = 2;

    // Compare client prices with server-calculated prices
    const totalPriceDiff = Math.abs(totalPrice - calculatedTotalPrice);
    const discountDiff = Math.abs(discountAmount - calculatedDiscount);
    const finalPriceDiff = Math.abs(finalPrice - calculatedFinalPrice);
    const mealPlanDiff = Math.abs((mealPlanTotal || 0) - calculatedMealPlanTotal);
    const petPriceDiff = Math.abs((petPlanPrice || 0) - calculatedPetPrice);

    if (totalPriceDiff > priceTolerance) {
      errors.push(`Total price mismatch: client=${totalPrice}, server=${calculatedTotalPrice}`);
    }

    if (discountDiff > priceTolerance) {
      errors.push(`Discount amount mismatch: client=${discountAmount}, server=${calculatedDiscount}`);
    }

    if (finalPriceDiff > priceTolerance) {
      errors.push(`Final price mismatch: client=${finalPrice}, server=${calculatedFinalPrice}`);
    }

    if (mealPlanDiff > priceTolerance) {
      errors.push(`Meal plan total mismatch: client=${mealPlanTotal}, server=${calculatedMealPlanTotal}`);
    }

    if (petPriceDiff > priceTolerance) {
      errors.push(`Pet plan price mismatch: client=${petPlanPrice}, server=${calculatedPetPrice}`);
    }

    // Strict per-line validation for custom addons (each line must match line.count * line.price_per_unit * nights)
    if (customAddonDetails && Array.isArray(customAddonDetails)) {
      for (const addon of customAddonDetails) {
        if (
          typeof addon.count !== "number" ||
          typeof addon.price_per_unit !== "number" ||
          typeof addon.total !== "number"
        ) {
          errors.push(`Invalid custom addon line: ${JSON.stringify(addon)}`);
          continue;
        }
        const expected = addon.count * addon.price_per_unit * nights;
        if (Math.abs(addon.total - expected) > priceTolerance) {
          errors.push(
            `Custom addon total mismatch (${addon.addon_type}): client=${addon.total}, expected=${expected}`,
          );
        }
      }
    }

    // Log validation for auditing
    console.log("Order price validation:", {
      accommodationId,
      roomTypeId,
      nights,
      clientPrices: { totalPrice, discountAmount, finalPrice, mealPlanTotal, petPlanPrice, customAddonTotal: customAddonDetails?.reduce((s, a) => s + a.total, 0) || 0 },
      serverPrices: { 
        totalPrice: calculatedTotalPrice, 
        discountAmount: calculatedDiscount, 
        finalPrice: calculatedFinalPrice,
        mealPlanTotal: calculatedMealPlanTotal,
        petPlanPrice: calculatedPetPrice,
        customAddonTotal: calculatedCustomAddonTotal
      },
      isValid: errors.length === 0,
      errors
    });

    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
      calculatedPrices: {
        totalPrice: calculatedTotalPrice,
        discountAmount: calculatedDiscount,
        finalPrice: calculatedFinalPrice,
        mealPlanTotal: calculatedMealPlanTotal,
        petPlanPrice: calculatedPetPrice,
        customAddonTotal: calculatedCustomAddonTotal
      }
    };

    return new Response(
      JSON.stringify(result),
      {
        // 一律回傳 200，讓前台能讀到 isValid/errors 並顯示正確訊息
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error in validate-order-prices:", error);
    return new Response(
      JSON.stringify({ 
        isValid: false, 
        errors: ["Internal server error"],
        calculatedPrices: null
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
