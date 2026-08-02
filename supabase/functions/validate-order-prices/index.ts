import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { checkOrderRateLimit, recordOrderAttempt, getClientIp } from "../_shared/orderRateLimit.ts";

interface CustomAddonInput {
  addon_type: string;
  count: number;
  price_per_unit: number;
  total: number;
}

interface ChildSelectionInput {
  infants: number;
  toddlers: number;
  children: number;
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
  childSelection?: ChildSelectionInput | null;
  childExtraTotal?: number;
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
    childExtraTotal: number;
  };
}

type ChildTierKey = "infant" | "toddler" | "child";
interface ChildTier {
  label: string;
  min_age: number;
  max_age: number;
  fee_per_night: number;
  max_count: number | null;
  allowed: boolean;
  counts_toward_capacity: boolean;
}
interface ChildAgeRules {
  tiers: Record<ChildTierKey, ChildTier>;
  note: string;
}
const TIER_ORDER: ChildTierKey[] = ["infant", "toddler", "child"];
const DEFAULT_CHILD_AGE_RULES: ChildAgeRules = {
  tiers: {
    infant: { label: "嬰兒", min_age: 0, max_age: 2, fee_per_night: 0, max_count: null, allowed: true, counts_toward_capacity: false },
    toddler: { label: "幼兒", min_age: 3, max_age: 6, fee_per_night: 500, max_count: 2, allowed: true, counts_toward_capacity: true },
    child: { label: "兒童", min_age: 7, max_age: 12, fee_per_night: 800, max_count: 2, allowed: true, counts_toward_capacity: true },
  },
  note: "",
};
function parseChildAgeRules(raw: unknown): ChildAgeRules {
  if (!raw || typeof raw !== "object") return DEFAULT_CHILD_AGE_RULES;
  const obj = raw as any;
  const tiersIn = obj.tiers && typeof obj.tiers === "object" ? obj.tiers : {};
  const tiers = {} as Record<ChildTierKey, ChildTier>;
  for (const key of TIER_ORDER) {
    const t = tiersIn[key] && typeof tiersIn[key] === "object" ? tiersIn[key] : {};
    const def = DEFAULT_CHILD_AGE_RULES.tiers[key];
    tiers[key] = {
      label: typeof t.label === "string" && t.label ? t.label : def.label,
      min_age: Number.isFinite(t.min_age) ? Number(t.min_age) : def.min_age,
      max_age: Number.isFinite(t.max_age) ? Number(t.max_age) : def.max_age,
      fee_per_night: Number.isFinite(t.fee_per_night) ? Number(t.fee_per_night) : def.fee_per_night,
      max_count: t.max_count === null || t.max_count === undefined || t.max_count === ""
        ? null
        : Number.isFinite(Number(t.max_count)) ? Number(t.max_count) : def.max_count,
      allowed: typeof t.allowed === "boolean" ? t.allowed : def.allowed,
      counts_toward_capacity: typeof t.counts_toward_capacity === "boolean" ? t.counts_toward_capacity : def.counts_toward_capacity,
    };
  }
  return { tiers, note: typeof obj.note === "string" ? obj.note : "" };
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: OrderValidationRequest & { packageId?: string | null } = await req.json();
    
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
      childSelection = null,
      childExtraTotal = 0,
      packageId = null,
      roomQuantity: rawRoomQuantity = 1,
    } = body as any;

    // 多間預訂（僅限「非包棟且房間數 > 1」的散房房型）
    const { data: roomTypeRow } = await supabase
      .from("room_types")
      .select("room_count, is_exclusive_package")
      .eq("id", roomTypeId)
      .maybeSingle();
    const roomTypeUnits = Number((roomTypeRow as any)?.room_count ?? 1) || 1;
    const multiUnitAllowed =
      (roomTypeRow as any)?.is_exclusive_package !== true && roomTypeUnits > 1;
    const requestedQty = Math.max(1, Math.floor(Number(rawRoomQuantity) || 1));
    const roomQuantity = multiUnitAllowed ? Math.min(requestedQty, roomTypeUnits) : 1;


    // --- 下單限流（僅計未付款訂單；後台/匯入來源不受限） ---
    const guestEmail: string | null = (body as any)?.guestEmail ?? null;
    const clientIp = getClientIp(req);
    const rateLimit = await checkOrderRateLimit(supabase, { email: guestEmail, ip: clientIp });
    if (rateLimit.limited) {
      console.warn("[validate-order-prices] rate limited:", rateLimit.reason, { guestEmail, clientIp });
      return new Response(
        JSON.stringify({
          isValid: false,
          rateLimited: true,
          errors: [rateLimit.message],
          calculatedPrices: null,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    await recordOrderAttempt(supabase, {
      email: guestEmail,
      ip: clientIp,
      accommodationId,
    });

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

    // 若為包區方案，一律以「訂房入住方案」設定為準：依 tier（平日／週五日／假日）取價
    let packageOverride = false;
    let discountBaseTotal = 0; // 折扣碼計算基準（包區方案原價，劃掉價）
    if (packageId) {
      const { data: pkg } = await supabase
        .from("accommodation_packages")
        .select("sale_price, original_price, tier_prices")
        .eq("id", packageId)
        .maybeSingle();
      if (pkg && (pkg as any).sale_price != null) {
        packageOverride = true;
        const salePrice = Number((pkg as any).sale_price);
        const pkgOriginal = (pkg as any).original_price != null ? Number((pkg as any).original_price) : null;
        const tierPrices = (pkg as any).tier_prices || {};

        // 國定假日（含補假）視為假日 tier
        const { data: holidayRows } = await supabase
          .from("public_holidays")
          .select("holiday_date, holiday_type")
          .eq("accommodation_id", accommodationId)
          .in("holiday_type", ["holiday", "compensatory_day_off"]);
        const holidaySet = new Set((holidayRows || []).map((h: any) => h.holiday_date));

        // 方案「單日指定價／單日適用狀態」：優先於 tier 價（與前台 src/lib/packageDatePrice.ts 同一順序）
        const { data: dateOverrideRows } = await supabase
          .from("package_date_prices")
          .select("date, sale_price, original_price, is_available")
          .eq("package_id", packageId)
          .in("date", dates);
        const dateOverrideMap = new Map<
          string,
          { sale: number | null; original: number | null; isAvailable: boolean | null }
        >();
        for (const r of (dateOverrideRows || []) as any[]) {
          dateOverrideMap.set(r.date, {
            sale: r.sale_price != null ? Number(r.sale_price) : null,
            original: r.original_price != null ? Number(r.original_price) : null,
            isAvailable: r.is_available ?? null,
          });
        }

        for (const date of dates) {
          const pricing = pricingMap.get(date);
          if (pricing) {
            if (pricing.is_available === false) errors.push(`Room is unavailable on ${date}`);
            if (typeof pricing.available_rooms === 'number' && pricing.available_rooms <= 0) {
              errors.push(`No availability on ${date}`);
            }
          }
          const day = new Date(`${date}T00:00:00Z`).getUTCDay();
          const tier = holidaySet.has(date) || day === 6
            ? "weekend"
            : (day === 5 || day === 0)
              ? "friday_sunday"
              : "weekday";
          const dateOv = dateOverrideMap.get(date);
          if (dateOv?.isAvailable === false) {
            errors.push(`Package is not available on ${date}`);
          }
          // 只有真的有填單日售價才算「單日指定價」；只設適用狀態的列不影響計價
          const ovSale = dateOv?.sale ?? null;
          const tierSale = tierPrices?.[tier]?.sale;
          const nightlySale = ovSale != null
            ? ovSale
            : tierSale != null
              ? Number(tierSale)
              : salePrice;
          calculatedRoomTotal += nightlySale;

          const tierOriginal = tierPrices?.[tier]?.original;
          const invPrice = pricing?.price != null ? Number(pricing.price) : null;
          const nightlyOriginal =
            ovSale != null && dateOv?.original != null && dateOv.original > 0
              ? dateOv.original
              : ovSale != null
                ? ovSale
                : tierOriginal != null && Number(tierOriginal) > 0
                  ? Number(tierOriginal)
                  : pkgOriginal != null && pkgOriginal > 0
                    ? pkgOriginal
                    : invPrice != null && invPrice > 0
                      ? invPrice
                      : nightlySale;

          discountBaseTotal += nightlyOriginal;

        }
      }
    }



    if (!packageOverride) {
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
    }

    // 多間預訂：房費 × 間數，並確認每晚實際可訂間數足夠（防超賣）
    if (roomQuantity > 1) {
      calculatedRoomTotal *= roomQuantity;
      discountBaseTotal *= roomQuantity;
      try {
        const { data: invRows } = await supabase.rpc("get_adjusted_room_inventory_batch", {
          p_room_type_id: roomTypeId,
          p_dates: dates,
          p_accommodation_id: accommodationId,
        });
        for (const row of (invRows as any[]) || []) {
          const avail = row?.is_blocked === true ? 0 : Number(row?.available_rooms ?? 0);
          if (avail < roomQuantity) {
            errors.push(
              `Not enough rooms on ${row?.date_value}: requested=${roomQuantity}, available=${avail}`,
            );
          }
        }
      } catch (e) {
        console.error("[validate-order-prices] inventory check failed", e);
        errors.push("Inventory check failed");
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

    // 加購計價方式（每晚 / 單次）一律以資料庫設定為準，不信任前端傳入值
    const addonPricingModes = new Map<string, string>();
    const mandatoryAddons: Array<{ addon_type: string; min: number }> = [];
    {
      const { data: addonRows } = await supabase
        .from("addon_settings")
        .select("addon_type, pricing_mode, enabled, auto_include, is_locked, min_quantity")
        .eq("accommodation_id", accommodationId);
      for (const row of addonRows ?? []) {
        addonPricingModes.set(row.addon_type, row.pricing_mode === "per_stay" ? "per_stay" : "per_night");
        if (row.enabled !== false && row.auto_include === true && row.is_locked === true) {
          mandatoryAddons.push({
            addon_type: row.addon_type,
            min: Math.max(1, Number(row.min_quantity) || 0),
          });
        }
      }
    }
    const addonMultiplier = (addonType: string) =>
      addonPricingModes.get(addonType) === "per_stay" ? 1 : nights;

    // 行程模組加購（景點／票券／餐券）：以 trip_products 定價驗證，一次性計價（不乘住宿晚數）
    const tripProductPrices = new Map<string, number>();
    {
      const tripLines = (Array.isArray(customAddonDetails) ? customAddonDetails : []).filter(
        (a: any) => a?.source === "trip_product" && a?.product_id,
      );
      if (tripLines.length > 0) {
        const { data: tripRows } = await supabase
          .from("trip_products")
          .select("id, price, is_active")
          .in("id", [...new Set(tripLines.map((a: any) => a.product_id as string))]);
        for (const row of tripRows ?? []) {
          if ((row as any).is_active === false) continue;
          tripProductPrices.set((row as any).id, Number((row as any).price) || 0);
        }
      }
    }
    const isTripLine = (addon: any) => addon?.source === "trip_product" && !!addon?.product_id;
    const tripLineExpected = (addon: any): number | null => {
      const unit = tripProductPrices.get(addon.product_id);
      if (unit === undefined) return null;
      return unit * Number(addon.count || 0);
    };

    // Calculate custom addon total
    let calculatedCustomAddonTotal = 0;
    if (customAddonDetails && Array.isArray(customAddonDetails)) {
      for (const addon of customAddonDetails) {
        if (isTripLine(addon)) {
          calculatedCustomAddonTotal += tripLineExpected(addon) ?? 0;
          continue;
        }
        if (typeof addon.count === 'number' && typeof addon.price_per_unit === 'number') {
          calculatedCustomAddonTotal += addon.count * addon.price_per_unit * addonMultiplier(addon.addon_type);
        }
      }
    }

    // ===== 兒童分齡：伺服器端重新計算加價，並阻擋不接受 / 超過上限的組合 =====
    let calculatedChildExtraTotal = 0;
    if (childSelection) {
      const { data: accInfo } = await supabase
        .from("accommodation_info")
        .select("child_age_rules")
        .eq("id", accommodationId)
        .maybeSingle();
      const rules = parseChildAgeRules((accInfo as any)?.child_age_rules);
      const sel = {
        infant: Math.max(0, Number(childSelection.infants) || 0),
        toddler: Math.max(0, Number(childSelection.toddlers) || 0),
        child: Math.max(0, Number(childSelection.children) || 0),
      };
      for (const key of TIER_ORDER) {
        const tier = rules.tiers[key];
        const count = sel[key];
        if (count <= 0) continue;
        if (!tier.allowed) {
          errors.push(`Child tier not allowed: ${tier.label} (${count})`);
          continue;
        }
        if (tier.max_count !== null && count > tier.max_count) {
          errors.push(`Child tier over limit: ${tier.label} ${count}/${tier.max_count}`);
          continue;
        }
        calculatedChildExtraTotal += (tier.fee_per_night || 0) * count * nights;
      }
      const childDiff = Math.abs((childExtraTotal || 0) - calculatedChildExtraTotal);
      if (childDiff > 2) {
        errors.push(`Child extra total mismatch: client=${childExtraTotal}, server=${calculatedChildExtraTotal}`);
      }
    }

    // 折扣碼與「人客多優惠」不疊加：套用折扣碼時房費以原價計價
    const hasOriginalBase = discountBaseTotal > 0 && discountBaseTotal > calculatedRoomTotal;
    const chargedRoomTotal = discountCode && hasOriginalBase ? discountBaseTotal : calculatedRoomTotal;

    // Calculate server-side total price
    const calculatedTotalPrice = chargedRoomTotal + calculatedPetPrice + calculatedMealPlanTotal + calculatedCustomAddonTotal + calculatedChildExtraTotal;

    // Validate discount code if provided
    // Discount applies only to room total, NOT addons
    let calculatedDiscount = 0;
    if (discountCode) {
      const { data: discountResult, error: discountError } = await supabase
        .rpc("validate_discount_code", {
          p_accommodation_id: accommodationId,
          p_code: discountCode,
          p_order_amount: chargedRoomTotal,
          p_room_type_id: roomTypeId,
          p_check_in_date: checkInDate
        });

      if (discountError) {
        console.error("Discount validation error:", discountError);
        errors.push("Failed to validate discount code");
      } else if (discountResult && discountResult[0]?.is_valid) {
        const discountInfo = discountResult[0];
        // 百分比折扣以「方案原價（劃掉價）」為基準，並以計價房費為上限
        const discountBase = discountBaseTotal > 0 ? discountBaseTotal : calculatedRoomTotal;
        if (discountInfo.discount_type === "percentage") {
          calculatedDiscount = Math.min(
            Math.round(discountBase * (discountInfo.discount_value / 100)),
            chargedRoomTotal,
          );
        } else if (discountInfo.discount_type === "fixed") {
          calculatedDiscount = Math.min(discountInfo.discount_value, chargedRoomTotal);
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
        if (isTripLine(addon)) {
          const tripExpected = tripLineExpected(addon);
          if (tripExpected === null) {
            errors.push(`Unknown or inactive trip product: ${addon.product_id}`);
          } else if (Math.abs(addon.total - tripExpected) > priceTolerance) {
            errors.push(
              `Trip product total mismatch (${addon.product_id}): client=${addon.total}, expected=${tripExpected}`,
            );
          }
          continue;
        }
        const expected = addon.count * addon.price_per_unit * addonMultiplier(addon.addon_type);
        if (Math.abs(addon.total - expected) > priceTolerance) {
          errors.push(
            `Custom addon total mismatch (${addon.addon_type}): client=${addon.total}, expected=${expected}`,
          );
        }
      }
    }

    // 必含加購（自動帶入且客人不可取消）：不得被移除或低於數量下限
    if (mandatoryAddons.length > 0) {
      const lines = Array.isArray(customAddonDetails) ? customAddonDetails : [];
      for (const required of mandatoryAddons) {
        const line = lines.find((a: any) => a?.addon_type === required.addon_type);
        const count = typeof line?.count === "number" ? line.count : 0;
        if (count < required.min) {
          errors.push(
            `Mandatory addon missing or below minimum (${required.addon_type}): client=${count}, required>=${required.min}`,
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
        customAddonTotal: calculatedCustomAddonTotal,
        childExtraTotal: calculatedChildExtraTotal,
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
