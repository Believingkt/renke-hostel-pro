import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const discountCode = url.searchParams.get('code');
    const apiKey = req.headers.get('x-api-key') || url.searchParams.get('api_key');

    if (!discountCode) {
      return new Response(
        JSON.stringify({ error: '缺少必要參數：code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify discount code exists
    const { data: discountData, error: discountError } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', discountCode.toUpperCase())
      .single();

    if (discountError || !discountData) {
      console.error('Discount code not found:', discountError);
      return new Response(
        JSON.stringify({ error: '折扣碼不存在' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pathname = url.pathname;

    // GET /kol-api/orders - Query orders using this discount code
    if (pathname.includes('/orders')) {
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          order_date,
          check_in_date,
          check_out_date,
          guest_name,
          guest_count,
          order_status,
          payment_status,
          total_price,
          discount_amount,
          final_price,
          paid_amount,
          room_types:room_type_id (
            name
          )
        `)
        .eq('discount_code', discountCode.toUpperCase())
        .order('order_date', { ascending: false });

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        return new Response(
          JSON.stringify({ error: '查詢訂單失敗' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          discount_code: discountCode,
          orders: orders || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /kol-api/stats - Query statistics
    if (pathname.includes('/stats')) {
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('total_price, discount_amount, final_price, order_status, payment_status')
        .eq('discount_code', discountCode.toUpperCase());

      if (ordersError) {
        console.error('Error fetching stats:', ordersError);
        return new Response(
          JSON.stringify({ error: '查詢統計失敗' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Calculate statistics
      const totalOrders = orders?.length || 0;
      const confirmedOrders = orders?.filter(o => 
        o.order_status !== 'cancelled'
      ).length || 0;
      
      const totalRevenue = orders?.reduce((sum, order) => 
        order.order_status !== 'cancelled' ? sum + order.final_price : sum, 0
      ) || 0;
      
      const totalDiscount = orders?.reduce((sum, order) => 
        order.order_status !== 'cancelled' ? sum + (order.discount_amount || 0) : sum, 0
      ) || 0;

      // Calculate commission (example: 10% of discount amount)
      const commissionRate = 0.1;
      const estimatedCommission = Math.round(totalDiscount * commissionRate);

      return new Response(
        JSON.stringify({
          success: true,
          discount_code: discountCode,
          discount_info: {
            name: discountData.name,
            discount_type: discountData.discount_type,
            discount_value: discountData.discount_value,
            used_count: discountData.used_count,
            usage_limit: discountData.usage_limit,
            is_active: discountData.is_active
          },
          statistics: {
            total_orders: totalOrders,
            confirmed_orders: confirmedOrders,
            total_revenue: totalRevenue,
            total_discount: totalDiscount,
            estimated_commission: estimatedCommission,
            commission_rate: commissionRate
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default response - API info
    return new Response(
      JSON.stringify({
        success: true,
        message: '網紅 API',
        endpoints: {
          orders: '/kol-api/orders?code=YOUR_CODE',
          stats: '/kol-api/stats?code=YOUR_CODE'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in kol-api function:', error);
    const errorMessage = error instanceof Error ? error.message : '未知錯誤';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
