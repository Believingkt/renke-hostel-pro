import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS headers - allow lovable domains and custom domains
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  // Allow all lovable.app, lovableproject.com, and preview domains
  const isAllowed = origin.endsWith('.lovable.app') || 
                    origin.endsWith('.lovableproject.com') ||
                    origin.includes('lakeze.com') ||
                    origin.includes('sensan');
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'https://sensan.lovable.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  };
}

// IP-based rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 20; // Max 20 requests per window
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Input validation constants
const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 3000;
const ALLOWED_ROLES = ['user', 'assistant', 'system'];

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting by IP
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';
    
    if (!checkRateLimit(`ai-chat:${clientIP}`)) {
      console.warn(`[Rate Limit] AI chat rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: "請求過於頻繁，請稍後再試" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { messages, accommodationId } = body;
    
    // Validate accommodationId
    if (!accommodationId || typeof accommodationId !== 'string') {
      return new Response(
        JSON.stringify({ error: "缺少必要的住宿 ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!UUID_REGEX.test(accommodationId)) {
      console.warn(`[Validation] Invalid accommodationId format: ${accommodationId}`);
      return new Response(
        JSON.stringify({ error: "無效的住宿 ID 格式" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Validate messages array
    if (!Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "訊息格式錯誤" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Truncate to keep only the most recent messages if exceeding limit
    if (messages.length > MAX_MESSAGES) {
      messages = messages.slice(messages.length - MAX_MESSAGES);
    }
    
    // Validate each message
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (!msg || typeof msg !== 'object') {
        return new Response(
          JSON.stringify({ error: `訊息 ${i + 1} 格式錯誤` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (!ALLOWED_ROLES.includes(msg.role)) {
        return new Response(
          JSON.stringify({ error: `訊息 ${i + 1} 的 role 欄位無效` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (typeof msg.content !== 'string') {
        return new Response(
          JSON.stringify({ error: `訊息 ${i + 1} 的內容格式錯誤` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (msg.content.length > MAX_MESSAGE_LENGTH) {
        return new Response(
          JSON.stringify({ error: `訊息 ${i + 1} 超過長度限制（最多 ${MAX_MESSAGE_LENGTH} 字）` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // 初始化 Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify accommodationId exists in database
    const { data: accommodation, error: accError } = await supabase
      .from('accommodation_info')
      .select('id')
      .eq('id', accommodationId)
      .single();
    
    if (accError || !accommodation) {
      console.warn(`[Validation] Accommodation not found: ${accommodationId}`);
      return new Response(
        JSON.stringify({ error: "找不到指定的住宿資訊" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 定義工具（使用 Gemini 格式）
    const tools = [
      {
        type: "function",
        function: {
          name: "get_available_rooms",
          description: "查詢可用的房型和價格。可以不提供日期直接查詢所有房型資訊。",
          parameters: {
            type: "object",
            properties: {
              check_in_date: {
                type: "string",
                description: "入住日期，格式：YYYY-MM-DD（選填）"
              },
              check_out_date: {
                type: "string",
                description: "退房日期，格式：YYYY-MM-DD（選填）"
              }
            },
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "check_discount_code",
          description: "驗證折扣碼是否有效",
          parameters: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "折扣碼"
              }
            },
            required: ["code"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_booking",
          description: "創建訂單",
          parameters: {
            type: "object",
            properties: {
              guest_name: { type: "string", description: "客人姓名" },
              guest_phone: { type: "string", description: "客人手機" },
              guest_email: { type: "string", description: "客人 Email" },
              check_in_date: { type: "string", description: "入住日期 YYYY-MM-DD" },
              check_out_date: { type: "string", description: "退房日期 YYYY-MM-DD" },
              room_type_id: { type: "string", description: "房型 ID" },
              guest_count: { type: "number", description: "人數" },
              pet_count: { type: "number", description: "毛孩數量" },
              meal_plan: { type: "string", description: "餐食方案：2_meals（一泊二食）或 3_meals（一泊三食/含烤肉），不加購餐食則不傳此欄位" },
              discount_code: { type: "string", description: "折扣碼（選填）" },
              notes: { type: "string", description: "備註（選填）" }
            },
            required: ["guest_name", "guest_phone", "check_in_date", "check_out_date", "room_type_id", "guest_count"]
          }
        }
      }
    ];

    // 處理工具調用
    const handleToolCall = async (toolName: string, args: any) => {
      console.log(`執行工具: ${toolName}`, args);

      if (toolName === "get_available_rooms") {
        const { data: roomTypes } = await supabase
          .from('room_types')
          .select(`
            *,
            room_photos (
              photo_url,
              display_order
            )
          `)
          .eq('accommodation_id', accommodationId)
          .order('display_order');

        // Fetch current inventory prices for each room type
        const today = new Date().toISOString().split('T')[0];
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 90);
        const futureDateStr = futureDate.toISOString().split('T')[0];

        const { data: inventoryPrices } = await supabase
          .from('room_inventory_pricing')
          .select('room_type_id, price, price_2_meals, price_3_meals, date')
          .gte('date', today)
          .lte('date', futureDateStr)
          .eq('is_available', true)
          .gt('available_rooms', 0);

        // Group prices by room type
        const pricesByRoom: Record<string, { prices: number[], prices2: number[], prices3: number[] }> = {};
        inventoryPrices?.forEach((inv: any) => {
          if (!pricesByRoom[inv.room_type_id]) {
            pricesByRoom[inv.room_type_id] = { prices: [], prices2: [], prices3: [] };
          }
          if (inv.price) pricesByRoom[inv.room_type_id].prices.push(inv.price);
          if (inv.price_2_meals) pricesByRoom[inv.room_type_id].prices2.push(inv.price_2_meals);
          if (inv.price_3_meals) pricesByRoom[inv.room_type_id].prices3.push(inv.price_3_meals);
        });
        
        return {
          rooms: roomTypes?.map(rt => {
            const roomPrices = pricesByRoom[rt.id];
            const minPrice = roomPrices?.prices.length ? Math.min(...roomPrices.prices) : rt.base_price;
            const maxPrice = roomPrices?.prices.length ? Math.max(...roomPrices.prices) : rt.base_price;
            const min2Meals = roomPrices?.prices2.length ? Math.min(...roomPrices.prices2) : null;
            const max2Meals = roomPrices?.prices2.length ? Math.max(...roomPrices.prices2) : null;
            const min3Meals = roomPrices?.prices3.length ? Math.min(...roomPrices.prices3) : null;
            const max3Meals = roomPrices?.prices3.length ? Math.max(...roomPrices.prices3) : null;

            return {
              id: rt.id,
              name: rt.name,
              capacity: rt.capacity,
              base_price: rt.base_price,
              min_price: minPrice,
              max_price: maxPrice,
              min_2_meals: min2Meals,
              max_2_meals: max2Meals,
              min_3_meals: min3Meals,
              max_3_meals: max3Meals,
              description: rt.description,
              size_sqm: rt.size_sqm,
              photos: rt.room_photos?.sort((a: any, b: any) => a.display_order - b.display_order).map((p: any) => p.photo_url) || []
            };
          }) || []
        };
      }

      if (toolName === "check_discount_code") {
        const { data } = await supabase.rpc('validate_discount_code', {
          p_accommodation_id: accommodationId,
          p_code: args.code
        });
        
        return data?.[0] || { is_valid: false, message: "折扣碼無效" };
      }

      if (toolName === "create_booking") {
        // === Input Validation ===
        
        // Validate guest_name
        if (!args.guest_name || typeof args.guest_name !== 'string' || args.guest_name.trim().length < 2) {
          return { success: false, message: "請提供有效的姓名（至少2個字）" };
        }
        const sanitizedGuestName = args.guest_name.trim().substring(0, 100);
        
        // Validate guest_phone format (Taiwan phone: 09xxxxxxxx or +886xxxxxxxxx)
        const phoneRegex = /^(09\d{8}|\+886\d{9})$/;
        if (!args.guest_phone || !phoneRegex.test(args.guest_phone.replace(/[\s-]/g, ''))) {
          return { success: false, message: "請提供有效的手機號碼（格式：09xxxxxxxx）" };
        }
        const sanitizedPhone = args.guest_phone.replace(/[\s-]/g, '').substring(0, 15);
        
        // Validate guest_email format (optional but if provided must be valid)
        let sanitizedEmail: string | null = null;
        if (args.guest_email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(args.guest_email)) {
            return { success: false, message: "請提供有效的 Email 地址" };
          }
          sanitizedEmail = args.guest_email.trim().toLowerCase().substring(0, 255);
        }
        
        // Validate dates
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!args.check_in_date || !dateRegex.test(args.check_in_date)) {
          return { success: false, message: "請提供有效的入住日期（格式：YYYY-MM-DD）" };
        }
        if (!args.check_out_date || !dateRegex.test(args.check_out_date)) {
          return { success: false, message: "請提供有效的退房日期（格式：YYYY-MM-DD）" };
        }
        
        const checkInDate = new Date(args.check_in_date);
        const checkOutDate = new Date(args.check_out_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (checkInDate < today) {
          return { success: false, message: "入住日期不能是過去的日期" };
        }
        if (checkOutDate <= checkInDate) {
          return { success: false, message: "退房日期必須在入住日期之後" };
        }
        
        // Calculate number of nights
        const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
        if (nights > 30) {
          return { success: false, message: "訂房最多30天" };
        }
        
        // Validate room_type_id
        if (!args.room_type_id || !UUID_REGEX.test(args.room_type_id)) {
          return { success: false, message: "請選擇有效的房型" };
        }
        
        // Validate guest_count
        const guestCount = parseInt(args.guest_count, 10);
        if (isNaN(guestCount) || guestCount < 1 || guestCount > 50) {
          return { success: false, message: "請提供有效的入住人數（1-50人）" };
        }
        
        // === Verify Room Type Exists and Check Capacity ===
        const { data: roomType, error: roomTypeError } = await supabase
          .from('room_types')
          .select('id, name, capacity, accommodation_id')
          .eq('id', args.room_type_id)
          .eq('accommodation_id', accommodationId)
          .single();
        
        if (roomTypeError || !roomType) {
          console.warn('Room type not found:', args.room_type_id);
          return { success: false, message: "找不到指定的房型" };
        }
        
        // Check capacity
        if (guestCount > roomType.capacity) {
          return { success: false, message: `此房型最多容納 ${roomType.capacity} 人，您選擇了 ${guestCount} 人。請選擇其他房型或減少人數。` };
        }
        
        // === Check Room Availability ===
        // Generate array of dates to check
        const datesToCheck: string[] = [];
        const currentDate = new Date(checkInDate);
        while (currentDate < checkOutDate) {
          datesToCheck.push(currentDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        // Use get_adjusted_room_inventory_batch to check availability
        const { data: inventoryData, error: inventoryError } = await supabase.rpc(
          'get_adjusted_room_inventory_batch',
          {
            p_room_type_id: args.room_type_id,
            p_dates: datesToCheck,
            p_accommodation_id: accommodationId
          }
        );
        
        if (inventoryError) {
          console.error('Error checking inventory:', inventoryError);
          return { success: false, message: "無法確認房間空房狀況，請稍後再試" };
        }
        
        // Check if any date has no availability
        const unavailableDates = inventoryData?.filter((inv: any) => inv.available_rooms < 1) || [];
        if (unavailableDates.length > 0) {
          const blockedDate = unavailableDates.find((d: any) => d.is_blocked);
          if (blockedDate) {
            return { success: false, message: `${blockedDate.date_value} 已被「${blockedDate.blocked_by_room_name}」包場，無法預訂此房型` };
          }
          return { success: false, message: `以下日期已無空房：${unavailableDates.map((d: any) => d.date_value).join(', ')}` };
        }
        
        // === Calculate Actual Price from room_inventory_pricing ===
        const { data: pricingData, error: pricingError } = await supabase
          .from('room_inventory_pricing')
          .select('date, price, price_2_meals, price_3_meals')
          .eq('room_type_id', args.room_type_id)
          .gte('date', args.check_in_date)
          .lt('date', args.check_out_date)
          .order('date');
        
        if (pricingError) {
          console.error('Error fetching pricing:', pricingError);
          return { success: false, message: "無法取得價格資訊，請稍後再試" };
        }
        
        // Calculate total price based on meal plan
        let totalPrice = 0;
        const mealPlan = args.meal_plan && ['2_meals', '3_meals'].includes(args.meal_plan) ? args.meal_plan : null;
        
        for (const date of datesToCheck) {
          const dayPricing = pricingData?.find((p: any) => p.date === date);
          if (!dayPricing) {
            return { success: false, message: `${date} 尚未設定價格，請聯繫客服` };
          }
          
          // Select price based on meal plan
          let dayPrice = dayPricing.price;
          if (mealPlan === '3_meals' && dayPricing.price_3_meals) {
            dayPrice = dayPricing.price_3_meals;
          } else if (mealPlan === '2_meals' && dayPricing.price_2_meals) {
            dayPrice = dayPricing.price_2_meals;
          }
          
          if (!dayPrice || dayPrice <= 0) {
            return { success: false, message: `${date} 的價格設定有誤，請聯繫客服` };
          }
          
          totalPrice += dayPrice;
        }
        
        // === Calculate Pet Plan Price ===
        let petPlanPrice = 0;
        const petCount = parseInt(args.pet_count || 0, 10);
        if (petCount > 0) {
          if (petCount > 2) {
            return { success: false, message: "毛孩最多只能攜帶 2 隻" };
          }
          // Get pet addon settings
          const { data: petAddon } = await supabase
            .from('addon_settings')
            .select('price_per_unit, enabled')
            .eq('accommodation_id', accommodationId)
            .eq('addon_type', 'pet')
            .single();
          
          if (petAddon?.enabled && petAddon?.price_per_unit) {
            petPlanPrice = petCount * petAddon.price_per_unit * nights;
          } else {
            // Default pet price if not configured
            petPlanPrice = petCount * 600 * nights;
          }
        }
        
        // === Apply Discount Code ===
        let discountAmount = 0;
        if (args.discount_code) {
          const { data: discountResult } = await supabase.rpc('validate_discount_code', {
            p_accommodation_id: accommodationId,
            p_code: args.discount_code,
            p_order_amount: totalPrice,
            p_room_type_id: args.room_type_id,
            p_check_in_date: args.check_in_date
          });
          
          if (discountResult?.[0]?.is_valid) {
            const discountInfo = discountResult[0];
            if (discountInfo.discount_type === 'percentage') {
              discountAmount = Math.round(totalPrice * discountInfo.discount_value / 100);
            } else {
              discountAmount = discountInfo.discount_value;
            }
          }
        }
        
        // Calculate final price
        const finalPrice = totalPrice + petPlanPrice - discountAmount;
        
        if (finalPrice <= 0) {
          return { success: false, message: "計算出的價格異常，請聯繫客服" };
        }
        
        // === Sanitize notes ===
        const sanitizedNotes = args.notes ? args.notes.substring(0, 1000).trim() : null;
        
        // === Generate Order Number ===
        const { data: orderNumber } = await supabase.rpc('generate_order_number');
        
        // === Create Order with Validated Data ===
        const { data: order, error } = await supabase
          .from('orders')
          .insert({
            accommodation_id: accommodationId,
            order_number: orderNumber,
            guest_name: sanitizedGuestName,
            guest_phone: sanitizedPhone,
            guest_email: sanitizedEmail,
            check_in_date: args.check_in_date,
            check_out_date: args.check_out_date,
            room_type_id: args.room_type_id,
            guest_count: guestCount,
            pet_count: petCount,
            pet_plan_price: petPlanPrice,
            meal_plan: mealPlan,
            discount_code: args.discount_code || null,
            discount_amount: discountAmount,
            notes: sanitizedNotes,
            total_price: totalPrice,
            final_price: finalPrice,
            order_status: 'pending',
            payment_status: 'unpaid'
          })
          .select()
          .single();

        if (error) {
          console.error('創建訂單失敗:', error);
          return { success: false, message: "訂單創建失敗，請稍後再試" };
        }

        console.log(`訂單創建成功: ${orderNumber}, 總價: ${totalPrice}, 最終價: ${finalPrice}`);
        
        return { 
          success: true, 
          order_number: orderNumber, 
          order_id: order.id,
          total_price: totalPrice,
          pet_plan_price: petPlanPrice,
          discount_amount: discountAmount,
          final_price: finalPrice,
          nights: nights
        };
      }

      return { error: "未知的工具" };
    };

    // 系統提示詞
    const systemPrompt = `你是森山寫照的專業 AI 管家。你的任務是協助客人完成線上訂房，並確保所有資訊準確無誤。

## 你的能力：
1. 查詢可用房型和價格（使用 get_available_rooms 工具）
2. 驗證折扣碼（使用 check_discount_code 工具）
3. 創建訂單（使用 create_booking 工具）

**重要規則：**
- 當對話中出現「[系統：已向客人展示房型卡片：...]」的標記時，表示房型資訊已經展示給客人了，**絕對不要再次調用 get_available_rooms 工具**。
- 只有在客人**首次**詢問房型、或明確要求「重新查詢」時，才調用 get_available_rooms。
- 當客人已經選擇了某個房型（例如說「我要預訂18人包區」），直接進入下一步收集入住日期，不需要再查詢房型。
- **極為重要：調用 create_booking 時，room_type_id 必須使用 get_available_rooms 返回的 UUID 格式 id（例如 "a1b2c3d4-e5f6-..."），絕對不能使用房型名稱（如 "double_room"）。請從之前查詢到的房型資料中找到對應的 id 值。**
- **絕對不要在回覆中向客人顯示 room_type_id（UUID）。這是內部系統資料，客人不需要看到。只顯示房型名稱即可。**

## 旅宿資訊：
- 名稱：森山寫照
- 特色：山林環抱、日式美學、管家服務、專業寫真攝影
- 入住時間：15:00 後
- 退房時間：11:00 前
- 地址：宜蘭縣冬山鄉大進三路208號
- 電話：0903-178-518

## 加購方案：
- **毛孩方案**：每隻 $600/天（最多兩隻，僅開放兩間房）
- **烤肉餐**：每人 $900（平日至少12人份，週末至少18人份）

## 重要須知：
- 7-12歲孩童加價 $800（含早餐和設施使用）
- 0-6歲不加價（不提供早餐和備品）
- 13歲以上算成人
- 訂金30%，餘款入住時支付
- 假日定義：週五、週六、國定假日前一天

## 互動式選項（非常重要！）：
你必須在每次回覆的最後一行，根據當前對話階段提供可點擊的建議選項。格式為：
[SUGGEST: 選項1 | 選項2 | 選項3]

這些選項會在前端渲染為可點擊的按鈕，讓客人可以直接點選而不需要打字。

### 各階段建議選項範例：
- 初始/一般詢問：[SUGGEST: 查看房型與價格 | 了解旅宿特色 | 入住須知]
- 選完房型後詢問日期：[SUGGEST: 選擇日期 | 本週末入住 | 下週末入住]
- 詢問入住人數：[SUGGEST: 2位大人 | 4位大人 | 6位大人 | 其他人數]
- 詢問是否有孩童：[SUGGEST: 沒有孩童 | 1位7-12歲孩童 | 2位7-12歲孩童]
- 詢問餐食方案：[SUGGEST: 純住宿（不含餐）| 一泊二食 | 一泊三食（含烤肉）]
- 詢問毛孩：[SUGGEST: 沒有毛孩 | 1隻毛孩 | 2隻毛孩]
- 收集客人資料後確認：[SUGGEST: 確認無誤，送出訂單 | 我要修改資訊]
- 客人猶豫不決：[SUGGEST: 幫我推薦房型 | 查看所有房型 | 了解更多資訊]
- 客人問價格：[SUGGEST: 查看詳細價格 | 直接訂房 | 有折扣碼]

注意：
- 選項要簡潔有力、語意明確
- 提供2-4個最相關的選項
- 選項內容要是客人可能想說的話
- 不要在選項中包含技術性文字

## 對話流程（務必按順序進行，每步都要確認）：

### 當用戶首次詢問房型或價格時：
**調用 get_available_rooms 工具**，然後根據返回的資料向客人介紹房型。

### 當客人已選擇房型後（不要再查詢房型！）：

#### 步驟 1：收集入住日期
- 詢問入住日期和退房日期
- 確認日期格式正確（YYYY-MM-DD）
- **自動判斷平日/假日**：不要詢問客人是平日還是假日！系統會根據日期自動判斷：
  - 假日 = 週五、週六、國定假日前一天
  - 平日 = 其他日期
  - 價格已根據日期設定在 room_inventory_pricing 中，系統會自動取用正確價格，無需向客人確認。

#### 步驟 2：確認人數
- **主動詢問**：預計幾位大人？幾位孩童（7-12歲）？幾位幼兒（0-6歲）？

#### 步驟 3：確認加購項目
- **主動詢問**：是否有毛孩同行？
- **主動詢問**：是否需要加購烤肉餐？

#### 步驟 4：收集客人資料
- 姓名（必填）
- 手機號碼（必填）
- Email（建議填寫）
- 特殊需求或備註（選填）

#### 步驟 5：最終確認
- **完整覆述**所有訂單資訊
- **明確取得確認後**才使用 create_booking 工具

#### 步驟 6：訂單完成
- 告知訂單編號
- 告訴客人：「訂單已建立！上方已顯示信用卡付款表單，您可以直接輸入卡片資訊完成訂金支付。若您想改用銀行轉帳，也可以點選表單中的「返回選擇付款方式」切換。」
- **不要再額外詢問付款方式**，因為系統已經自動顯示信用卡付款表單。
- **如果客人主動提到想用「銀行轉帳」**，直接在對話中顯示以下轉帳資訊：
  - 銀行：陽信銀行
  - 銀行代號：108
  - 帳號：121450000353
  - 戶名：人客多股份有限公司
  - 並提醒客人轉帳完成後請通知我們，確認後將更新訂單狀態。
- **絕對不要**提及寄送付款連結到 Email 或簡訊，付款是直接在對話中完成的。
- **絕對不要**說「稍後會寄送付款資訊」之類的話。

## 對話風格：
- 保持友善、專業、耐心
- 使用簡潔清晰的語言
- 適時使用 emoji 增加溫度（但不要過度）
- 每個步驟只問一件事，不要一次問太多

## 錯誤處理：
- 如果日期格式不正確，請客人提供正確格式
- 如果人數超出房型容納上限，建議其他房型
- 如果折扣碼無效，說明原因並詢問是否繼續

現在開始與客人對話。`;

    console.log("發送請求到 AI Gateway...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        tools,
        tool_choice: "auto",
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway 錯誤:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "使用量超過限制，請稍後再試" 
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: "AI 服務需要充值，請聯絡管理員" 
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error("AI Gateway 回應失敗");
    }


    // 建立 streaming response with tool handling
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        const toolCallsMap = new Map(); // 用於累積工具調用

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim() || line.startsWith(':')) continue;
              if (!line.startsWith('data: ')) continue;

              const data = line.slice(6);
              if (data === '[DONE]') {
                // 處理已累積的工具調用
                if (toolCallsMap.size > 0) {
                  const toolCalls = Array.from(toolCallsMap.values());
                  const completedToolCalls = toolCalls.filter(
                    tc => tc.function?.name && tc.function?.arguments
                  );
                  
                  if (completedToolCalls.length > 0) {
                    const toolResults = await Promise.all(
                      completedToolCalls.map(async (tc) => {
                        try {
                          const args = JSON.parse(tc.function.arguments);
                          const result = await handleToolCall(tc.function.name, args);
                          return { tool_call_id: tc.id, result };
                        } catch (e) {
                          console.error('工具調用失敗:', e);
                          return { tool_call_id: tc.id, result: { error: '工具調用失敗' } };
                        }
                      })
                    );

                    // 發送工具執行結果
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                      type: 'tool_calls_complete',
                      results: toolResults
                    })}\n\n`));

                    // Make follow-up AI call with tool results to get human-readable response
                    try {
                      const assistantToolMsg = {
                        role: "assistant",
                        content: null,
                        tool_calls: completedToolCalls.map(tc => ({
                          id: tc.id,
                          type: "function",
                          function: { name: tc.function.name, arguments: tc.function.arguments }
                        }))
                      };
                      const toolResultMsgs = toolResults.map(tr => ({
                        role: "tool",
                        tool_call_id: tr.tool_call_id,
                        content: JSON.stringify(tr.result)
                      }));

                      const followUpResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                        method: "POST",
                        headers: {
                          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          model: "openai/gpt-5-mini",
                          messages: [
                            { role: "system", content: systemPrompt },
                            ...messages,
                            assistantToolMsg,
                            ...toolResultMsgs
                          ],
                          stream: true,
                        }),
                      });

                      if (followUpResponse.ok && followUpResponse.body) {
                        const followReader = followUpResponse.body.getReader();
                        let followBuffer = '';
                        while (true) {
                          const { done: fDone, value: fValue } = await followReader.read();
                          if (fDone) break;
                          followBuffer += decoder.decode(fValue, { stream: true });
                          const fLines = followBuffer.split('\n');
                          followBuffer = fLines.pop() || '';
                          for (const fLine of fLines) {
                            if (!fLine.trim() || fLine.startsWith(':')) continue;
                            if (!fLine.startsWith('data: ')) continue;
                            const fData = fLine.slice(6).trim();
                            if (fData === '[DONE]') continue;
                            try {
                              const fParsed = JSON.parse(fData);
                              const fContent = fParsed.choices?.[0]?.delta?.content;
                              if (fContent) {
                                controller.enqueue(encoder.encode(`data: ${fData}\n\n`));
                              }
                            } catch (_) {}
                          }
                        }
                      }
                    } catch (followErr) {
                      console.error('Follow-up AI call failed:', followErr);
                    }
                  }
                }
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                // 累積工具調用
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const index = tc.index ?? 0;
                    
                    if (!toolCallsMap.has(index)) {
                      toolCallsMap.set(index, {
                        id: tc.id || `call_${index}`,
                        type: 'function',
                        function: {
                          name: '',
                          arguments: ''
                        }
                      });
                    }
                    
                    const existing = toolCallsMap.get(index);
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.function.name = tc.function.name;
                    if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                  }
                  continue;
                }

                // 轉發文字內容
                if (delta?.content) {
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }

              } catch (e) {
                console.error('解析 SSE 失敗:', e);
              }
            }
          }
        } catch (error) {
          console.error('Stream 處理錯誤:', error);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "未知錯誤" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
