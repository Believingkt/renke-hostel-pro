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

    console.log('TapPay response:', { 
      status: result.status, 
      msg: result.msg,
      orderId,
      amount 
    });

    if (result.status === 0) {
      // Payment successful
      console.log('TapPay payment successful:', {
        transactionId: result.rec_trade_id,
        bankTransactionId: result.bank_transaction_id
      });
      
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
