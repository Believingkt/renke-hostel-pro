import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to generate HMAC signature for LINE Pay
async function generateSignature(channelSecret: string, uri: string, body: string, nonce: string): Promise<string> {
  const message = channelSecret + uri + body + nonce;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(channelSecret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return base64;
}

// Input validation helper for LINE Pay
function validateLinePayInput(data: Record<string, unknown>): { valid: boolean; error?: string } {
  const { action, amount, orderId, transactionId, orderData } = data;

  // Validate action
  if (!action || (action !== 'request' && action !== 'confirm')) {
    return { valid: false, error: 'Invalid action: must be "request" or "confirm"' };
  }

  // Validate amount: must be positive integer within reasonable range
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > 10000000) {
    return { valid: false, error: 'Invalid amount: must be a positive integer between 1 and 10,000,000' };
  }

  // Validate orderId format (should be date-based: YYYYMMDDNNN)
  if (!orderId || typeof orderId !== 'string' || !/^\d{11}$/.test(orderId)) {
    return { valid: false, error: 'Invalid order ID format' };
  }

  // For confirm action, validate transactionId
  if (action === 'confirm') {
    if (!transactionId || typeof transactionId !== 'string' || transactionId.length < 10) {
      return { valid: false, error: 'Invalid transaction ID for confirmation' };
    }
  }

  // For request action, validate orderData
  if (action === 'request') {
    if (!orderData || typeof orderData !== 'object') {
      return { valid: false, error: 'Missing order data for payment request' };
    }
    const order = orderData as Record<string, unknown>;
    if (!order.roomTypeId || !order.roomTypeName || !order.confirmUrl || !order.cancelUrl) {
      return { valid: false, error: 'Invalid order data: missing required fields' };
    }
    // Validate URLs
    if (typeof order.confirmUrl !== 'string' || !order.confirmUrl.startsWith('http')) {
      return { valid: false, error: 'Invalid confirm URL' };
    }
    if (typeof order.cancelUrl !== 'string' || !order.cancelUrl.startsWith('http')) {
      return { valid: false, error: 'Invalid cancel URL' };
    }
  }

  return { valid: true };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData = await req.json();
    
    // Validate input
    const validation = validateLinePayInput(requestData);
    if (!validation.valid) {
      console.warn('LINE Pay input validation failed:', validation.error);
      return new Response(
        JSON.stringify({
          success: false,
          message: '付款資料驗證失敗',
          suggestion: '請檢查付款資訊是否正確',
          errorCategory: 'validation',
          originalMessage: validation.error,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { action, transactionId, amount, orderId, orderData } = requestData;

    console.log('Processing LINE Pay:', { action, orderId, amount });

    const channelId = Deno.env.get('LINE_PAY_CHANNEL_ID');
    const channelSecret = Deno.env.get('LINE_PAY_CHANNEL_SECRET');

    if (!channelId || !channelSecret) {
      throw new Error('LINE Pay credentials not configured');
    }

    const isProduction = Deno.env.get('LINE_PAY_ENV') === 'production';
    const baseUrl = isProduction 
      ? 'https://api-pay.line.me'
      : 'https://sandbox-api-pay.line.me';

    if (action === 'request') {
      // Step 1: Request Payment
      const uri = '/v3/payments/request';
      const nonce = crypto.randomUUID();
      
      const requestBody = {
        amount: amount,
        currency: 'TWD',
        orderId: orderId,
        packages: [
          {
            id: '1',
            amount: amount,
            products: [
              {
                id: orderData.roomTypeId,
                name: orderData.roomTypeName,
                quantity: 1,
                price: amount,
              }
            ]
          }
        ],
        redirectUrls: {
          confirmUrl: `${orderData.confirmUrl}?orderId=${orderId}&transactionId={transactionId}`,
          cancelUrl: orderData.cancelUrl,
        }
      };

      const bodyString = JSON.stringify(requestBody);
      const signature = await generateSignature(channelSecret, uri, bodyString, nonce);

      const response = await fetch(`${baseUrl}${uri}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-LINE-ChannelId': channelId,
          'X-LINE-Authorization-Nonce': nonce,
          'X-LINE-Authorization': signature,
        },
        body: bodyString,
      });

      const result = await response.json();

      console.log('LINE Pay request response:', result);

      if (result.returnCode === '0000') {
        // Payment request successful
        return new Response(
          JSON.stringify({
            success: true,
            transactionId: result.info.transactionId,
            paymentUrl: result.info.paymentUrl.web,
            message: '付款請求成功',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } else {
        // Payment request failed - categorize error
        let errorCategory = 'system';
        let userMessage = result.returnMessage || '付款請求失敗';
        let suggestion = '請稍後再試或選擇其他付款方式';
        
        // Categorize common LINE Pay error codes
        switch (result.returnCode) {
          case '1104':
          case '1105':
          case '1106':
            errorCategory = 'config';
            userMessage = 'LINE Pay 服務設定錯誤';
            suggestion = '請聯繫客服處理，或選擇其他付款方式';
            break;
          case '1150':
          case '1152':
            errorCategory = 'validation';
            userMessage = '訂單資訊有誤';
            suggestion = '請檢查訂單金額和商品資訊';
            break;
          case '1170':
          case '1172':
            errorCategory = 'transaction';
            userMessage = 'LINE Pay 交易處理失敗';
            suggestion = '請稍後重試或使用其他付款方式';
            break;
          case '2101':
          case '2102':
            errorCategory = 'auth';
            userMessage = 'LINE Pay 授權失敗';
            suggestion = '請重新登入 LINE Pay 或使用其他付款方式';
            break;
          case '9000':
            errorCategory = 'network';
            userMessage = 'LINE Pay 服務暫時無法連線';
            suggestion = '請檢查網路連線後重試';
            break;
          default:
            if (result.returnCode?.startsWith('1')) {
              errorCategory = 'validation';
            } else if (result.returnCode?.startsWith('2')) {
              errorCategory = 'auth';
            }
        }
        
        return new Response(
          JSON.stringify({
            success: false,
            message: userMessage,
            suggestion: suggestion,
            errorCode: result.returnCode,
            errorCategory: errorCategory,
            originalMessage: result.returnMessage,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    } else if (action === 'confirm') {
      // Step 2: Confirm Payment
      const uri = `/v3/payments/${transactionId}/confirm`;
      const nonce = crypto.randomUUID();
      
      const confirmBody = {
        amount: amount,
        currency: 'TWD',
      };

      const bodyString = JSON.stringify(confirmBody);
      const signature = await generateSignature(channelSecret, uri, bodyString, nonce);

      const response = await fetch(`${baseUrl}${uri}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-LINE-ChannelId': channelId,
          'X-LINE-Authorization-Nonce': nonce,
          'X-LINE-Authorization': signature,
        },
        body: bodyString,
      });

      const result = await response.json();

      console.log('LINE Pay confirm response:', result);

      if (result.returnCode === '0000') {
        // Payment confirmed
        return new Response(
          JSON.stringify({
            success: true,
            transactionId: result.info.transactionId,
            orderId: result.info.orderId,
            message: '付款確認成功',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } else {
        // Payment confirmation failed - categorize error
        let errorCategory = 'system';
        let userMessage = result.returnMessage || '付款確認失敗';
        let suggestion = '請稍後再試或聯繫客服';
        
        // Categorize confirmation errors
        switch (result.returnCode) {
          case '1198':
            errorCategory = 'duplicate';
            userMessage = '此訂單已經完成付款';
            suggestion = '請勿重複確認付款';
            break;
          case '1190':
          case '1193':
            errorCategory = 'expired';
            userMessage = 'LINE Pay 付款已逾時';
            suggestion = '請重新發起付款';
            break;
          case '1145':
            errorCategory = 'cancelled';
            userMessage = 'LINE Pay 付款已取消';
            suggestion = '請重新發起付款';
            break;
          case '2125':
            errorCategory = 'insufficient';
            userMessage = 'LINE Pay 餘額不足';
            suggestion = '請儲值後再試或使用其他付款方式';
            break;
          default:
            if (result.returnCode?.startsWith('11')) {
              errorCategory = 'transaction';
            }
        }
        
        return new Response(
          JSON.stringify({
            success: false,
            message: userMessage,
            suggestion: suggestion,
            errorCode: result.returnCode,
            errorCategory: errorCategory,
            originalMessage: result.returnMessage,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    } else {
      throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Error in process-linepay-payment function:', error);
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
