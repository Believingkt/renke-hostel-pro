import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: {
    order_number: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    guest_count: number;
    total_price: number;
    discount_amount: number;
    final_price: number;
    order_status: string;
    room_type_name?: string;
    discount_code: string;
    commission_rate: number;
    estimated_commission: number;
  };
}

// Generate HMAC signature for webhook payload
function generateSignature(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  return hmac.digest('hex');
}

// Send webhook notification
async function sendWebhook(
  webhookUrl: string, 
  webhookSecret: string | null, 
  payload: WebhookPayload
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const payloadString = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': payload.event,
      'X-Webhook-Timestamp': payload.timestamp,
    };
    
    // Add HMAC signature if secret is configured
    if (webhookSecret) {
      const signature = generateSignature(payloadString, webhookSecret);
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }
    
    console.log(`[KOL-Webhook] Sending webhook to: ${webhookUrl}`);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: payloadString,
    });
    
    console.log(`[KOL-Webhook] Response status: ${response.status}`);
    
    return { 
      success: response.ok, 
      statusCode: response.status 
    };
  } catch (error) {
    console.error('[KOL-Webhook] Error sending webhook:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // This function can be called:
    // 1. Internally when a new order is created (POST with order data)
    // 2. By admin to test webhook (POST with test flag)
    
    const body = await req.json();
    const { order_id, test_mode, discount_code_id } = body;

    // Test mode - send a test webhook
    if (test_mode && discount_code_id) {
      console.log(`[KOL-Webhook] Test mode for discount code: ${discount_code_id}`);
      
      // Fetch discount code info (without sensitive data)
      const { data: discountCode, error: dcError } = await supabase
        .from('discount_codes')
        .select('id, code, commission_rate, name')
        .eq('id', discount_code_id)
        .single();

      if (dcError || !discountCode) {
        return new Response(
          JSON.stringify({ error: '找不到折扣碼' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch secrets from the secure table
      const { data: secrets, error: secretsError } = await supabase
        .from('discount_code_secrets')
        .select('webhook_url, webhook_secret')
        .eq('discount_code_id', discount_code_id)
        .single();

      if (secretsError) {
        console.error('[KOL-Webhook] Error fetching secrets:', secretsError);
      }

      const webhookUrl = secrets?.webhook_url;
      const webhookSecret = secrets?.webhook_secret;

      if (!webhookUrl) {
        return new Response(
          JSON.stringify({ error: 'Webhook 未啟用或未設定 URL' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const testPayload: WebhookPayload = {
        event: 'order.test',
        timestamp: new Date().toISOString(),
        data: {
          order_number: 'TEST-20240101-001',
          guest_name: '測試用戶',
          check_in_date: '2024-12-25',
          check_out_date: '2024-12-27',
          guest_count: 2,
          total_price: 5000,
          discount_amount: 500,
          final_price: 4500,
          order_status: 'confirmed',
          room_type_name: '測試房型',
          discount_code: discountCode.code,
          commission_rate: discountCode.commission_rate || 0,
          estimated_commission: Math.round(4500 * ((discountCode.commission_rate || 0) / 100)),
        },
      };

      const result = await sendWebhook(
        webhookUrl, 
        webhookSecret, 
        testPayload
      );

      return new Response(
        JSON.stringify({ 
          success: result.success, 
          message: result.success ? 'Webhook 測試發送成功' : 'Webhook 發送失敗',
          statusCode: result.statusCode,
          error: result.error
        }),
        { 
          status: result.success ? 200 : 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Normal mode - triggered when an order is created
    if (!order_id) {
      return new Response(
        JSON.stringify({ error: '缺少 order_id 參數' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[KOL-Webhook] Processing order: ${order_id}`);

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        guest_name,
        check_in_date,
        check_out_date,
        guest_count,
        total_price,
        discount_amount,
        final_price,
        order_status,
        discount_code,
        room_types:room_type_id (name)
      `)
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      console.error('[KOL-Webhook] Order not found:', orderError);
      return new Response(
        JSON.stringify({ error: '找不到訂單' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if order has a discount code
    if (!order.discount_code) {
      console.log('[KOL-Webhook] Order has no discount code, skipping');
      return new Response(
        JSON.stringify({ success: true, message: '訂單沒有折扣碼，跳過 webhook' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get discount code info (without sensitive data)
    const { data: discountCode, error: dcError } = await supabase
      .from('discount_codes')
      .select('id, commission_rate')
      .eq('code', order.discount_code.toUpperCase())
      .single();

    if (dcError || !discountCode) {
      console.log('[KOL-Webhook] Discount code not found');
      return new Response(
        JSON.stringify({ success: true, message: '找不到折扣碼，跳過 webhook' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch secrets from the secure table
    const { data: secrets, error: secretsError } = await supabase
      .from('discount_code_secrets')
      .select('webhook_url, webhook_secret')
      .eq('discount_code_id', discountCode.id)
      .single();

    if (secretsError) {
      console.error('[KOL-Webhook] Error fetching secrets:', secretsError);
    }

    const webhookUrl = secrets?.webhook_url;
    const webhookSecret = secrets?.webhook_secret;

    // Check if webhook is enabled
    if (!webhookUrl) {
      console.log('[KOL-Webhook] Webhook not enabled for this discount code');
      return new Response(
        JSON.stringify({ success: true, message: 'Webhook 未啟用' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare webhook payload
    const roomTypeName = Array.isArray(order.room_types) 
      ? order.room_types[0]?.name 
      : (order.room_types as { name: string } | null)?.name;

    const commissionRate = discountCode.commission_rate || 0;
    const estimatedCommission = Math.round(order.final_price * (commissionRate / 100));

    const payload: WebhookPayload = {
      event: 'order.created',
      timestamp: new Date().toISOString(),
      data: {
        order_number: order.order_number,
        guest_name: order.guest_name,
        check_in_date: order.check_in_date,
        check_out_date: order.check_out_date,
        guest_count: order.guest_count,
        total_price: order.total_price,
        discount_amount: order.discount_amount || 0,
        final_price: order.final_price,
        order_status: order.order_status,
        room_type_name: roomTypeName,
        discount_code: order.discount_code,
        commission_rate: commissionRate,
        estimated_commission: estimatedCommission,
      },
    };

    // Send webhook
    const result = await sendWebhook(
      webhookUrl,
      webhookSecret,
      payload
    );

    console.log(`[KOL-Webhook] Webhook sent: ${result.success}`);

    return new Response(
      JSON.stringify({ 
        success: result.success,
        statusCode: result.statusCode,
        error: result.error
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[KOL-Webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});