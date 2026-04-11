import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recTradeId } = await req.json();

    if (!recTradeId) {
      return new Response(
        JSON.stringify({ success: false, message: '缺少交易編號' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const partnerKey = Deno.env.get('TAPPAY_PARTNER_KEY');
    if (!partnerKey) {
      throw new Error('TapPay credentials not configured');
    }

    console.log('Querying TapPay transaction:', recTradeId);

    // Call TapPay Record API to get transaction status
    const response = await fetch('https://prod.tappaysdk.com/tpc/transaction/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': partnerKey,
      },
      body: JSON.stringify({
        partner_key: partnerKey,
        filters: {
          rec_trade_id: recTradeId,
        },
      }),
    });

    const result = await response.json();

    console.log('TapPay query response:', {
      status: result.status,
      msg: result.msg,
      recordCount: result.trade_records?.length || 0,
    });

    // TapPay Record API status codes:
    // 0 = success with more data available
    // 2 = success but end of list (still valid!)
    // Other values = actual errors
    if (result.status !== 0 && result.status !== 2) {
      return new Response(
        JSON.stringify({
          success: false,
          message: result.msg || '查詢失敗',
          errorCode: result.status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const record = result.trade_records?.[0];
    if (!record) {
      return new Response(
        JSON.stringify({
          success: false,
          message: '找不到交易記錄',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine payment status based on record_status
    // record_status: 0 = auth success, 1 = capture success, -1 = refund, -2 = failed
    const isSuccess = record.record_status === 0 || record.record_status === 1;

    return new Response(
      JSON.stringify({
        success: true,
        paymentSuccess: isSuccess,
        recTradeId: record.rec_trade_id,
        bankTransactionId: record.bank_transaction_id,
        orderNumber: record.order_number,
        amount: record.amount,
        status: record.record_status,
        authCode: record.auth_code,
        transactionTime: record.transaction_time_millis,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in tappay-query:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
