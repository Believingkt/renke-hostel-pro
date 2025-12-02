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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, transactionId, amount, orderId, orderData } = await req.json();

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
        // Payment request failed
        return new Response(
          JSON.stringify({
            success: false,
            message: result.returnMessage || '付款請求失敗',
            errorCode: result.returnCode,
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
        // Payment confirmation failed
        return new Response(
          JSON.stringify({
            success: false,
            message: result.returnMessage || '付款確認失敗',
            errorCode: result.returnCode,
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
