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

    // Validate required parameters
    if (!discountCode) {
      return new Response(
        JSON.stringify({ error: '缺少必要參數：code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!apiKey) {
      console.log('[KOL-API] Missing API key for code:', discountCode);
      return new Response(
        JSON.stringify({ error: '缺少必要參數：api_key。請在請求頭中添加 x-api-key 或在 URL 參數中添加 api_key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify discount code exists AND API key matches
    const { data: discountData, error: discountError } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', discountCode.toUpperCase())
      .single();

    if (discountError || !discountData) {
      console.error('[KOL-API] Discount code not found:', discountCode, discountError);
      return new Response(
        JSON.stringify({ error: '折扣碼不存在' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify API key matches the discount code's API key
    if (!discountData.api_key) {
      console.log('[KOL-API] No API key configured for discount code:', discountCode);
      return new Response(
        JSON.stringify({ error: '此折扣碼尚未設定 API 金鑰，請聯繫管理員' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (discountData.api_key !== apiKey) {
      console.log('[KOL-API] Invalid API key attempt for code:', discountCode);
      return new Response(
        JSON.stringify({ error: 'API 金鑰無效' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[KOL-API] Authenticated successfully for code:', discountCode);

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
        console.error('[KOL-API] Error fetching orders:', ordersError);
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
        console.error('[KOL-API] Error fetching stats:', ordersError);
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

      // Calculate commission based on actual payment amount (final_price)
      // Commission rate is retrieved from the discount code settings
      const commissionRate = discountData.commission_rate || 0;
      const estimatedCommission = Math.round(totalRevenue * (commissionRate / 100));

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

    // GET /kol-api/commission - Query commission records and statistics
    if (pathname.includes('/commission')) {
      const { data: commissionRecords, error: commissionError } = await supabase
        .from('commission_records')
        .select(`
          id,
          order_id,
          order_total,
          discount_amount,
          commission_rate,
          commission_amount,
          settlement_status,
          settlement_date,
          payment_date,
          created_at,
          orders:order_id (
            order_number,
            guest_name,
            check_in_date,
            check_out_date,
            order_status,
            payment_status
          )
        `)
        .eq('discount_code_id', discountData.id)
        .order('created_at', { ascending: false });

      if (commissionError) {
        console.error('[KOL-API] Error fetching commission records:', commissionError);
        return new Response(
          JSON.stringify({ error: '查詢佣金記錄失敗' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Calculate commission statistics
      const records = commissionRecords || [];
      
      const totalCommission = records
        .filter(r => r.settlement_status !== 'cancelled')
        .reduce((sum, r) => sum + r.commission_amount, 0);
      
      const pendingCommission = records
        .filter(r => r.settlement_status === 'pending')
        .reduce((sum, r) => sum + r.commission_amount, 0);
      
      const approvedCommission = records
        .filter(r => r.settlement_status === 'approved')
        .reduce((sum, r) => sum + r.commission_amount, 0);
      
      const paidCommission = records
        .filter(r => r.settlement_status === 'paid')
        .reduce((sum, r) => sum + r.commission_amount, 0);

      return new Response(
        JSON.stringify({
          success: true,
          discount_code: discountCode,
          commission_statistics: {
            total_records: records.length,
            total_commission: totalCommission,
            pending_commission: pendingCommission,
            approved_commission: approvedCommission,
            paid_commission: paidCommission,
            commission_rate: discountData.commission_rate || 0
          },
          commission_records: records.map(record => {
            const order = Array.isArray(record.orders) ? record.orders[0] : record.orders;
            return {
              id: record.id,
              order_number: order?.order_number || null,
              guest_name: order?.guest_name || null,
              check_in_date: order?.check_in_date || null,
              order_status: order?.order_status || null,
              order_total: record.order_total,
              discount_amount: record.discount_amount,
              commission_rate: record.commission_rate,
              commission_amount: record.commission_amount,
              settlement_status: record.settlement_status,
              settlement_date: record.settlement_date,
              payment_date: record.payment_date,
              created_at: record.created_at
            };
          })
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default response - API info
    return new Response(
      JSON.stringify({
        success: true,
        message: '網紅 API - 需要 API 金鑰驗證',
        authentication: {
          method: '請在請求頭中添加 x-api-key 或在 URL 參數中添加 api_key',
          example_header: 'x-api-key: YOUR_API_KEY',
          example_url: '/kol-api/orders?code=YOUR_CODE&api_key=YOUR_API_KEY'
        },
        endpoints: {
          orders: '/kol-api/orders?code=YOUR_CODE&api_key=YOUR_API_KEY',
          stats: '/kol-api/stats?code=YOUR_CODE&api_key=YOUR_API_KEY',
          commission: '/kol-api/commission?code=YOUR_CODE&api_key=YOUR_API_KEY'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[KOL-API] Error in function:', error);
    const errorMessage = error instanceof Error ? error.message : '未知錯誤';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
