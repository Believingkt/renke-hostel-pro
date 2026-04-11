import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-platform-key',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const segments = [];
  for (let s = 0; s < 4; s++) {
    let segment = '';
    for (let i = 0; i < 8; i++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(segment);
  }
  return `kol_${segments.join('_')}`;
}

// Rate limiting: 100 requests per hour per API key
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms

// Per-code rate limiting to prevent discount code enumeration
const codeRateLimitMap = new Map<string, { count: number; resetAt: number; failedAttempts: number }>();
const CODE_RATE_LIMIT_MAX = 10; // Max 10 requests per code per hour
const CODE_RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms
const MAX_FAILED_ATTEMPTS = 5; // Max 5 failed attempts before lockout

function checkRateLimit(apiKey: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = rateLimitMap.get(apiKey);
  
  if (!existing || now > existing.resetAt) {
    rateLimitMap.set(apiKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW };
  }
  
  if (existing.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  
  existing.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}

// Check per-code rate limit to prevent enumeration attacks
function checkCodeRateLimit(code: string): { allowed: boolean; remaining: number; resetAt: number; isLocked: boolean } {
  const now = Date.now();
  const normalizedCode = code.toUpperCase();
  const existing = codeRateLimitMap.get(normalizedCode);
  
  if (!existing || now > existing.resetAt) {
    codeRateLimitMap.set(normalizedCode, { count: 1, resetAt: now + CODE_RATE_LIMIT_WINDOW, failedAttempts: 0 });
    return { allowed: true, remaining: CODE_RATE_LIMIT_MAX - 1, resetAt: now + CODE_RATE_LIMIT_WINDOW, isLocked: false };
  }
  
  // Check if locked due to too many failed attempts
  if (existing.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt, isLocked: true };
  }
  
  if (existing.count >= CODE_RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt, isLocked: false };
  }
  
  existing.count++;
  return { allowed: true, remaining: CODE_RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt, isLocked: false };
}

// Record failed authentication attempt for a code
function recordFailedAttempt(code: string): void {
  const normalizedCode = code.toUpperCase();
  const existing = codeRateLimitMap.get(normalizedCode);
  
  if (existing) {
    existing.failedAttempts++;
    console.log(`[KOL-API] Failed attempt recorded for code: ${normalizedCode}, total: ${existing.failedAttempts}`);
  } else {
    const now = Date.now();
    codeRateLimitMap.set(normalizedCode, { 
      count: 1, 
      resetAt: now + CODE_RATE_LIMIT_WINDOW, 
      failedAttempts: 1 
    });
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // ========== Platform Management Endpoints ==========
    // Authenticated via PLATFORM_MASTER_KEY header
    // Allow any origin for platform API calls
    const manageCorsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-platform-key',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    };

    if (pathname.includes('/manage/')) {
      const platformKey = req.headers.get('x-platform-key');
      const masterKey = Deno.env.get('PLATFORM_MASTER_KEY');

      if (!masterKey) {
        console.error('[KOL-API] PLATFORM_MASTER_KEY not configured');
        return new Response(
          JSON.stringify({ error: '平台管理功能未設定' }),
          { status: 500, headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!platformKey || platformKey !== masterKey) {
        return new Response(
          JSON.stringify({ error: '平台驗證失敗' }),
          { status: 401, headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // POST /kol-api/manage/keys - Generate API key for a discount code
      if (pathname.includes('/manage/keys') && req.method === 'POST') {
        const body = await req.json();
        const code = body.code?.toUpperCase();

        if (!code) {
          return new Response(
            JSON.stringify({ error: '缺少必要參數：code' }),
            { status: 400, headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Find discount code
        const { data: dc, error: dcErr } = await supabase
          .from('discount_codes')
          .select('id, code, name')
          .eq('code', code)
          .single();

        if (dcErr || !dc) {
          return new Response(
            JSON.stringify({ error: '找不到此折扣碼' }),
            { status: 404, headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Generate new API key
        const newApiKey = generateApiKey();

        // Upsert into discount_code_secrets
        const { error: upsertErr } = await supabase
          .from('discount_code_secrets')
          .upsert(
            { discount_code_id: dc.id, api_key: newApiKey, updated_at: new Date().toISOString() },
            { onConflict: 'discount_code_id' }
          );

        if (upsertErr) {
          console.error('[KOL-API] Error upserting API key:', upsertErr);
          return new Response(
            JSON.stringify({ error: '生成 API Key 失敗' }),
            { status: 500, headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[KOL-API] Platform generated API key for code:', code);
        return new Response(
          JSON.stringify({
            success: true,
            discount_code: dc.code,
            name: dc.name,
            api_key: newApiKey
          }),
          { headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // GET /kol-api/manage/keys?code=XXX - Get API key for a discount code
      if (pathname.includes('/manage/keys') && req.method === 'GET') {
        const code = url.searchParams.get('code')?.toUpperCase();

        if (!code) {
          return new Response(
            JSON.stringify({ error: '缺少必要參數：code' }),
            { status: 400, headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: dc } = await supabase
          .from('discount_codes')
          .select('id, code, name')
          .eq('code', code)
          .single();

        if (!dc) {
          return new Response(
            JSON.stringify({ error: '找不到此折扣碼' }),
            { status: 404, headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: secrets } = await supabase
          .from('discount_code_secrets')
          .select('api_key, created_at, updated_at')
          .eq('discount_code_id', dc.id)
          .single();

        return new Response(
          JSON.stringify({
            success: true,
            discount_code: dc.code,
            name: dc.name,
            api_key: secrets?.api_key || null,
            has_key: !!secrets?.api_key,
            created_at: secrets?.created_at,
            updated_at: secrets?.updated_at
          }),
          { headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // DELETE /kol-api/manage/keys?code=XXX - Revoke API key
      if (pathname.includes('/manage/keys') && req.method === 'DELETE') {
        const code = url.searchParams.get('code')?.toUpperCase();

        if (!code) {
          return new Response(
            JSON.stringify({ error: '缺少必要參數：code' }),
            { status: 400, headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: dc } = await supabase
          .from('discount_codes')
          .select('id, code, name')
          .eq('code', code)
          .single();

        if (!dc) {
          return new Response(
            JSON.stringify({ error: '找不到此折扣碼' }),
            { status: 404, headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: updateErr } = await supabase
          .from('discount_code_secrets')
          .update({ api_key: null, updated_at: new Date().toISOString() })
          .eq('discount_code_id', dc.id);

        if (updateErr) {
          return new Response(
            JSON.stringify({ error: '撤銷 API Key 失敗' }),
            { status: 500, headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[KOL-API] Platform revoked API key for code:', code);
        return new Response(
          JSON.stringify({ success: true, message: `已撤銷 ${dc.code} 的 API Key` }),
          { headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // GET /kol-api/manage/codes - List all discount codes with key status
      if (pathname.includes('/manage/codes') && req.method === 'GET') {
        const { data: codes, error: codesErr } = await supabase
          .from('discount_codes')
          .select(`
            id, code, name, discount_type, discount_value, 
            is_active, used_count, usage_limit, commission_rate,
            discount_code_secrets (api_key, updated_at)
          `)
          .order('created_at', { ascending: false });

        if (codesErr) {
          return new Response(
            JSON.stringify({ error: '查詢折扣碼失敗' }),
            { status: 500, headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const result = (codes || []).map((c: any) => ({
          code: c.code,
          name: c.name,
          discount_type: c.discount_type,
          discount_value: c.discount_value,
          is_active: c.is_active,
          used_count: c.used_count,
          usage_limit: c.usage_limit,
          commission_rate: c.commission_rate,
          has_api_key: !!c.discount_code_secrets?.api_key,
          api_key_updated_at: c.discount_code_secrets?.updated_at || null
        }));

        return new Response(
          JSON.stringify({ success: true, codes: result }),
          { headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: '未知的管理端點' }),
        { status: 404, headers: { ...manageCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== KOL Data Endpoints (existing) ==========
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

    // Check rate limit before any database operations
    const rateLimit = checkRateLimit(apiKey);
    const rateLimitHeaders = {
      'X-RateLimit-Limit': RATE_LIMIT_MAX.toString(),
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
    };

    if (!rateLimit.allowed) {
      console.log('[KOL-API] Rate limit exceeded for API key');
      return new Response(
        JSON.stringify({ 
          error: '請求過於頻繁，請稍後再試',
          retry_after: Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            ...rateLimitHeaders,
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString()
          } 
        }
      );
    }

    // Check per-code rate limit to prevent enumeration attacks
    const codeRateLimit = checkCodeRateLimit(discountCode);
    
    if (!codeRateLimit.allowed) {
      console.log('[KOL-API] Per-code rate limit exceeded or locked:', discountCode, codeRateLimit.isLocked ? '(LOCKED)' : '');
      return new Response(
        JSON.stringify({ 
          error: codeRateLimit.isLocked 
            ? '此折扣碼因多次驗證失敗已被暫時鎖定，請稍後再試'
            : '此折扣碼請求過於頻繁，請稍後再試',
          retry_after: Math.ceil((codeRateLimit.resetAt - Date.now()) / 1000)
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            ...rateLimitHeaders,
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((codeRateLimit.resetAt - Date.now()) / 1000).toString()
          } 
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify discount code exists (without sensitive data - api_key is now in secrets table)
    const { data: discountData, error: discountError } = await supabase
      .from('discount_codes')
      .select('id, code, name, discount_type, discount_value, used_count, usage_limit, is_active, commission_rate')
      .eq('code', discountCode.toUpperCase())
      .single();

    if (discountError || !discountData) {
      console.error('[KOL-API] Discount code not found:', discountCode, discountError);
      // Record failed attempt for enumeration protection
      recordFailedAttempt(discountCode);
      return new Response(
        JSON.stringify({ error: '驗證失敗' }), // Generic error to prevent enumeration
        { status: 401, headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch API key from the secure secrets table
    const { data: secrets, error: secretsError } = await supabase
      .from('discount_code_secrets')
      .select('api_key')
      .eq('discount_code_id', discountData.id)
      .single();

    if (secretsError) {
      console.error('[KOL-API] Error fetching secrets:', secretsError);
    }

    const storedApiKey = secrets?.api_key;

    // Verify API key matches
    if (!storedApiKey) {
      console.log('[KOL-API] No API key configured for discount code:', discountCode);
      // Record failed attempt for enumeration protection
      recordFailedAttempt(discountCode);
      return new Response(
        JSON.stringify({ error: '驗證失敗' }), // Generic error to prevent enumeration
        { status: 401, headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (storedApiKey !== apiKey) {
      console.log('[KOL-API] Invalid API key attempt for code:', discountCode);
      // Record failed attempt for enumeration protection
      recordFailedAttempt(discountCode);
      return new Response(
        JSON.stringify({ error: '驗證失敗' }), // Generic error to prevent enumeration
        { status: 401, headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[KOL-API] Authenticated successfully for code:', discountCode);

    // Use pathname already declared above

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
          { status: 500, headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          discount_code: discountCode,
          orders: orders || []
        }),
        { headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' } }
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
          { status: 500, headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' } }
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
        { headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' } }
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
          { status: 500, headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' } }
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
        { headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' } }
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
        },
        rate_limit: {
          limit: RATE_LIMIT_MAX,
          window: '1 hour'
        }
      }),
      { headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' } }
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