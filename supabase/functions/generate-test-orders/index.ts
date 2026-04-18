import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestOrderParams {
  accommodationId: string;
  count?: number;
  year?: number; // 單一年份（向後兼容）
  years?: number[]; // 多年份陣列，例如 [2025, 2026]
  month?: number; // 指定月份 (1-12)，搭配 year/years 使用
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting test order generation...');

    // ===== AUTH GUARD =====
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Verify JWT using anon client
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Service-role client for actual writes
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const { accommodationId, count = 20, year, years, month }: TestOrderParams = await req.json();

    if (!accommodationId) {
      throw new Error('Accommodation ID is required');
    }

    // Role check: super_admin (any acc) or hotel_admin of THIS accommodation
    const { data: roleRows, error: roleErr } = await supabaseClient
      .from('user_roles')
      .select('role, accommodation_id')
      .eq('user_id', userId);
    if (roleErr) {
      console.error('[generate-test-orders] role lookup failed:', roleErr);
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const allowed = (roleRows ?? []).some(
      (r) =>
        r.role === 'super_admin' ||
        (r.role === 'hotel_admin' && r.accommodation_id === accommodationId),
    );
    if (!allowed) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // ===== END AUTH GUARD =====


    // 決定要生成的年份列表
    const targetYears: number[] = years && years.length > 0 
      ? years 
      : year 
        ? [year] 
        : []; // 空陣列表示使用預設邏輯（過去6個月）

    console.log(`Generating ${count} test orders for accommodation ${accommodationId}, years: ${targetYears.length > 0 ? targetYears.join(', ') : 'default (past 6 months)'}`);

    // 獲取現有房型（包含容量資訊）
    const { data: roomTypes, error: roomTypesError } = await supabaseClient
      .from('room_types')
      .select('id, name, base_price, capacity')
      .eq('accommodation_id', accommodationId);

    if (roomTypesError) throw roomTypesError;
    if (!roomTypes || roomTypes.length === 0) {
      throw new Error('No room types found for this accommodation');
    }

    console.log(`Found ${roomTypes.length} room types`);

    // 生成測試顧客資料
    const testCustomers = [];
    const customerNames = [
      '王小明', '李小華', '張志偉', '陳美玲', '林建宏',
      '黃淑芬', '吳俊傑', '劉怡君', '鄭雅婷', '蔡宗翰',
      '許家瑋', '謝佳穎', '周宜靜', '楊承翰', '賴思妤'
    ];

    for (let i = 0; i < Math.min(count, 15); i++) {
      const customerData = {
        accommodation_id: accommodationId,
        name: customerNames[i % customerNames.length] + (i > 14 ? ` ${Math.floor(i / 15) + 1}` : ''),
        phone: `09${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
        email: `customer${i + 1}@test.com`,
        visit_count: Math.floor(Math.random() * 5) + 1,
        notes: Math.random() > 0.7 ? '測試顧客資料' : null,
      };
      testCustomers.push(customerData);
    }

    // 插入測試顧客
    const { data: insertedCustomers, error: customersError } = await supabaseClient
      .from('customers')
      .insert(testCustomers)
      .select();

    if (customersError) throw customersError;
    console.log(`Created ${insertedCustomers.length} test customers`);

    // 生成測試訂單
    const testOrders = [];
    const orderStatuses = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];
    const paymentStatuses = ['unpaid', 'deposit_paid', 'paid'];
    const mealPlans = [null, '2_meals', '3_meals'];

    for (let i = 0; i < count; i++) {
      const customer = insertedCustomers[i % insertedCustomers.length];
      const roomType = roomTypes[Math.floor(Math.random() * roomTypes.length)];
      
      let orderDate: Date;
      
      if (targetYears.length > 0) {
        // 從指定的年份中隨機選擇一個
        const selectedYear = targetYears[Math.floor(Math.random() * targetYears.length)];
        if (month && month >= 1 && month <= 12) {
          // 指定月份：在該月份內隨機
          const startOfMonth = new Date(selectedYear, month - 1, 1);
          const endOfMonth = new Date(selectedYear, month, 0); // 該月最後一天
          const randomTime = startOfMonth.getTime() + Math.random() * (endOfMonth.getTime() - startOfMonth.getTime());
          orderDate = new Date(randomTime);
        } else {
          const startOfYear = new Date(selectedYear, 0, 1);
          const endOfYear = new Date(selectedYear, 11, 31);
          const randomTime = startOfYear.getTime() + Math.random() * (endOfYear.getTime() - startOfYear.getTime());
          orderDate = new Date(randomTime);
        }
      } else {
        // 否則生成過去6個月的訂單日期
        const daysAgo = Math.floor(Math.random() * 180);
        orderDate = new Date();
        orderDate.setDate(orderDate.getDate() - daysAgo);
      }
      
      // 入住日期在訂單日期之後 1-30 天
      const checkInDate = new Date(orderDate);
      checkInDate.setDate(checkInDate.getDate() + Math.floor(Math.random() * 30) + 1);
      
      // 退房日期在入住日期之後 1-5 天
      const checkOutDate = new Date(checkInDate);
      checkOutDate.setDate(checkOutDate.getDate() + Math.floor(Math.random() * 4) + 1);
      
      // 住客人數不超過房型容量
      const roomCapacity = roomType.capacity || 4;
      const guestCount = Math.floor(Math.random() * roomCapacity) + 1;
      const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // 計算價格
      const basePrice = roomType.base_price;
      const totalPrice = basePrice * nights;
      const discountAmount = Math.random() > 0.7 ? Math.floor(totalPrice * 0.1) : 0;
      const finalPrice = totalPrice - discountAmount;
      
      const orderStatus = orderStatuses[Math.floor(Math.random() * orderStatuses.length)];
      const paymentStatus = orderStatus === 'cancelled' ? 'unpaid' : 
                           paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)];
      
      const paidAmount = paymentStatus === 'paid' ? finalPrice :
                        paymentStatus === 'deposit_paid' ? Math.floor(finalPrice * 0.3) : 0;

      const orderData = {
        accommodation_id: accommodationId,
        customer_id: customer.id,
        room_type_id: roomType.id,
        order_date: orderDate.toISOString(),
        check_in_date: checkInDate.toISOString().split('T')[0],
        check_out_date: checkOutDate.toISOString().split('T')[0],
        guest_count: guestCount,
        guest_name: customer.name,
        guest_phone: customer.phone,
        guest_email: customer.email,
        total_price: totalPrice,
        discount_amount: discountAmount,
        final_price: finalPrice,
        paid_amount: paidAmount,
        deposit_amount: Math.floor(finalPrice * 0.3),
        order_status: orderStatus,
        payment_status: paymentStatus,
        payment_method: Math.random() > 0.5 ? '現金' : '轉帳',
        meal_plan: mealPlans[Math.floor(Math.random() * mealPlans.length)],
        pet_count: Math.random() > 0.8 ? Math.floor(Math.random() * 2) + 1 : 0,
        notes: Math.random() > 0.8 ? '測試訂單資料' : null,
        order_source: 'test', // 標記為測試訂單，允許歷史日期
        confirmed_at: orderStatus !== 'pending' ? orderDate.toISOString() : null,
        checked_in_at: ['checked_in', 'checked_out'].includes(orderStatus) ? checkInDate.toISOString() : null,
        checked_out_at: orderStatus === 'checked_out' ? checkOutDate.toISOString() : null,
        cancelled_at: orderStatus === 'cancelled' ? orderDate.toISOString() : null,
      };
      
      testOrders.push(orderData);
    }

    // 插入測試訂單
    const { data: insertedOrders, error: ordersError } = await supabaseClient
      .from('orders')
      .insert(testOrders)
      .select();

    if (ordersError) throw ordersError;
    console.log(`Created ${insertedOrders.length} test orders`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `成功生成 ${insertedOrders.length} 筆測試訂單和 ${insertedCustomers.length} 位測試顧客`,
        data: {
          orders: insertedOrders.length,
          customers: insertedCustomers.length,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error generating test orders:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
