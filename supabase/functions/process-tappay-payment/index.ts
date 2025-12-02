import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prime, amount, orderId, cardholder, details } = await req.json();

    console.log('Processing TapPay payment:', { orderId, amount });

    const appId = Deno.env.get('TAPPAY_APP_ID');
    const appKey = Deno.env.get('TAPPAY_APP_KEY');

    if (!appId || !appKey) {
      throw new Error('TapPay credentials not configured');
    }

    // Call TapPay Pay by Prime API
    const tappayResponse = await fetch('https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': appKey,
      },
      body: JSON.stringify({
        prime: prime,
        partner_key: appKey,
        merchant_id: appId,
        amount: amount,
        currency: 'TWD',
        order_number: orderId,
        details: details || '訂房付款',
        cardholder: {
          phone_number: cardholder.phoneNumber,
          name: cardholder.name,
          email: cardholder.email,
        },
      }),
    });

    const result = await tappayResponse.json();

    console.log('TapPay response:', result);

    if (result.status === 0) {
      // Payment successful
      return new Response(
        JSON.stringify({
          success: true,
          transactionId: result.rec_trade_id,
          bankTransactionId: result.bank_transaction_id,
          message: '付款成功',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      // Payment failed
      return new Response(
        JSON.stringify({
          success: false,
          message: result.msg || '付款失敗',
          errorCode: result.status,
        }),
        {
          status: 400,
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
