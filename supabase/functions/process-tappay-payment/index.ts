import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

// Input validation helper
function validatePaymentInput(data: Record<string, unknown>): { valid: boolean; error?: string } {
  const { prime, amount, orderId, cardholder } = data;

  // Validate prime token
  if (!prime || typeof prime !== 'string' || prime.length < 10) {
    return { valid: false, error: 'Invalid payment token (prime)' };
  }

  // Validate amount: must be positive integer within reasonable range
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > 10000000) {
    return { valid: false, error: 'Invalid amount: must be a positive integer between 1 and 10,000,000' };
  }

  // Validate orderId format (flexible: alphanumeric, 5-50 chars)
  if (!orderId || typeof orderId !== 'string' || orderId.length < 5 || orderId.length > 50) {
    return { valid: false, error: 'Invalid order ID format' };
  }

  // Validate cardholder info
  if (!cardholder || typeof cardholder !== 'object') {
    return { valid: false, error: 'Missing cardholder information' };
  }

  const holder = cardholder as Record<string, unknown>;
  if (!holder.name || typeof holder.name !== 'string' || holder.name.length < 1 || holder.name.length > 100) {
    return { valid: false, error: 'Invalid cardholder name' };
  }

  if (!holder.email || typeof holder.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(holder.email)) {
    return { valid: false, error: 'Invalid cardholder email' };
  }

  if (!holder.phoneNumber || typeof holder.phoneNumber !== 'string' || !/^[\d\-+()]{8,20}$/.test(holder.phoneNumber)) {
    return { valid: false, error: 'Invalid cardholder phone number' };
  }

  return { valid: true };
}

// Normalize phone number to E.164 format for Taiwan
function normalizePhoneE164(phone: string): string {
  // Remove all non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // If already starts with +, assume it's E.164
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // Taiwan local format: 09xxxxxxxx -> +8869xxxxxxxx
  if (cleaned.startsWith('09') && cleaned.length === 10) {
    return '+886' + cleaned.substring(1);
  }
  
  // If starts with 886, add +
  if (cleaned.startsWith('886')) {
    return '+' + cleaned;
  }
  
  // Default: assume Taiwan, prepend +886
  return '+886' + cleaned;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData = await req.json();
    
    // Validate input
    const validation = validatePaymentInput(requestData);
    if (!validation.valid) {
      console.warn('Payment input validation failed:', validation.error);
      return new Response(
        JSON.stringify({
          success: false,
          message: '付款資料驗證失敗',
          suggestion: '請檢查付款資訊是否正確',
          technicalMessage: validation.error,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { prime, amount, orderId, cardholder, details, frontendRedirectUrl, backendNotifyUrl, bindCard } = requestData;

    console.log('Processing TapPay payment with 3D Secure:', { orderId, amount, has3DUrls: !!frontendRedirectUrl, bindCard: !!bindCard });

    // Persist the email the customer entered on the payment page back to the order,
    // so receipts/notifications go to the address they actually want.
    try {
      const supaUrl = Deno.env.get('SUPABASE_URL');
      const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supaUrl && svcKey && cardholder?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cardholder.email)) {
        const admin = createClient(supaUrl, svcKey);
        await admin
          .from('orders')
          .update({ guest_email: cardholder.email })
          .eq('order_number', orderId)
          .neq('guest_email', cardholder.email);
      }
    } catch (e) {
      console.warn('Failed to sync guest_email to order (non-blocking):', e);
    }

    const partnerKey = Deno.env.get('TAPPAY_PARTNER_KEY');
    const merchantId = Deno.env.get('TAPPAY_MERCHANT_ID');

    if (!partnerKey || !merchantId) {
      console.error('Missing TapPay credentials:', { hasPartnerKey: !!partnerKey, hasMerchantId: !!merchantId });
      throw new Error('TapPay credentials not configured');
    }

    // Normalize phone to E.164 format
    const phoneE164 = normalizePhoneE164(cardholder.phoneNumber);
    console.log('Phone normalized:', { original: cardholder.phoneNumber, e164: phoneE164 });

    // Build request body with 3D Secure support
    const tappayBody: Record<string, unknown> = {
      prime: prime,
      partner_key: partnerKey,
      merchant_id: merchantId,
      amount: amount,
      currency: 'TWD',
      details: details || '訂房付款',
      order_number: orderId,
      cardholder: {
        phone_number: phoneE164,
        name: cardholder.name,
        email: cardholder.email,
      },
      remember: !!bindCard,
      three_domain_secure: true, // Enable 3D Secure
    };

    // Add result_url for 3D Secure redirect.
    // TapPay requires BOTH frontend_redirect_url AND backend_notify_url to be non-empty
    // when three_domain_secure=true, otherwise it returns 629 "Missing arguments".
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const defaultBackendNotifyUrl = supabaseUrl
      ? `${supabaseUrl}/functions/v1/tappay-notify`
      : '';
    const resolvedFrontend =
      (typeof frontendRedirectUrl === 'string' && frontendRedirectUrl.trim())
        ? frontendRedirectUrl.trim()
        : '';
    const resolvedBackend =
      (typeof backendNotifyUrl === 'string' && backendNotifyUrl.trim())
        ? backendNotifyUrl.trim()
        : defaultBackendNotifyUrl;

    if (!resolvedFrontend || !resolvedBackend) {
      console.error('Missing 3DS URLs', {
        hasFrontend: !!resolvedFrontend,
        hasBackend: !!resolvedBackend,
      });
      return new Response(
        JSON.stringify({
          success: false,
          message: '系統設定錯誤,請聯繫客服',
          technicalMessage: 'Missing 3DS redirect URLs',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    tappayBody.result_url = {
      frontend_redirect_url: resolvedFrontend,
      backend_notify_url: resolvedBackend,
    };

    const envRaw = Deno.env.get('TAPPAY_ENV');
    const env = envRaw === 'sandbox' ? 'sandbox' : 'production';
    const endpoint =
      env === 'sandbox'
        ? 'https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime'
        : 'https://prod.tappaysdk.com/tpc/payment/pay-by-prime';

    console.log('Calling TapPay API with 3D Secure enabled', { env, endpoint });

    // Call TapPay Pay by Prime API
    const tappayResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': partnerKey,
      },
      body: JSON.stringify(tappayBody),
    });

    const result = await tappayResponse.json();

    console.log('TapPay response:', { 
      status: result.status, 
      msg: result.msg,
      orderId,
      amount,
      hasPaymentUrl: !!result.payment_url,
    });

    if (result.status === 0) {
      // Check if 3D Secure redirect is required
      if (result.payment_url) {
        console.log('3D Secure redirect required:', { 
          recTradeId: result.rec_trade_id,
          paymentUrl: result.payment_url.substring(0, 50) + '...'
        });
        
        return new Response(
          JSON.stringify({
            success: true,
            requires3DSecure: true,
            paymentUrl: result.payment_url,
            recTradeId: result.rec_trade_id,
            bankTransactionId: result.bank_transaction_id,
            message: '需要進行 3D 驗證',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Payment successful without 3D (rare for production)
      console.log('TapPay payment successful (no 3D):', {
        transactionId: result.rec_trade_id,
        bankTransactionId: result.bank_transaction_id
      });
      
      return new Response(
        JSON.stringify({
          success: true,
          requires3DSecure: false,
          transactionId: result.rec_trade_id,
          bankTransactionId: result.bank_transaction_id,
          message: '付款成功',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      // Payment failed - categorize error
      console.error('TapPay payment failed:', {
        errorCode: result.status,
        errorMsg: result.msg,
        orderId
      });

      let userMessage = '付款失敗';
      let suggestion = '請檢查卡片資訊或聯繫發卡銀行';

      // Categorize common TapPay errors
      switch (result.status) {
        case 1:
          userMessage = '系統錯誤';
          suggestion = '請稍後再試或聯繫客服';
          break;
        case 2:
          userMessage = '參數錯誤';
          suggestion = '請重新輸入付款資訊';
          break;
        case 3:
          userMessage = '卡片資訊錯誤';
          suggestion = '請檢查卡號、有效期限和安全碼是否正確';
          break;
        case 10:
          userMessage = '授權失敗';
          suggestion = '卡片餘額不足或超過信用額度，請更換其他卡片';
          break;
        case 924:
          userMessage = '3D驗證失敗';
          suggestion = '請確認已完成銀行的身份驗證程序';
          break;
        case 925:
          userMessage = '交易被拒絕';
          suggestion = '請聯繫發卡銀行確認卡片狀態';
          break;
        case 10023:
          userMessage = '銀行端回覆錯誤';
          suggestion = '請稍後重試或更換卡片；若持續發生，請聯繫發卡銀行確認卡片交易限制';
          break;
        default:
          if (result.msg) {
            userMessage = result.msg;
          }
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          message: userMessage,
          suggestion: suggestion,
          errorCode: result.status,
          technicalMessage: result.msg
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Error in process-tappay-payment function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
