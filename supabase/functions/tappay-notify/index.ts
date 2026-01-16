import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS headers for webhook (TapPay backend calls)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    console.log('TapPay notify received:', {
      status: body.status,
      rec_trade_id: body.rec_trade_id,
      order_number: body.order_number,
      amount: body.amount,
    });

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract transaction info from TapPay webhook payload
    const {
      status,
      rec_trade_id,
      bank_transaction_id,
      order_number,
      amount,
      msg,
      auth_code,
    } = body;

    const isSuccess = status === 0;

    // Try to find and update the order by order_number
    if (order_number) {
      const { data: order, error: findError } = await supabase
        .from('orders')
        .select('id, order_number, final_price, payment_status')
        .eq('order_number', order_number)
        .maybeSingle();

      if (findError) {
        console.error('Error finding order:', findError);
      }

      if (order) {
        console.log('Found order:', { orderId: order.id, currentStatus: order.payment_status });

        // Determine new payment status
        let newPaymentStatus = order.payment_status;
        let newPaidAmount = 0;

        if (isSuccess) {
          // Payment successful
          if (amount >= order.final_price) {
            newPaymentStatus = 'paid';
            newPaidAmount = amount;
          } else {
            newPaymentStatus = 'deposit_paid';
            newPaidAmount = amount;
          }
        } else {
          // Payment failed - keep current status but log
          console.log('Payment failed, keeping current status');
        }

        if (isSuccess) {
          const { error: updateError } = await supabase
            .from('orders')
            .update({
              payment_status: newPaymentStatus,
              paid_amount: newPaidAmount,
              payment_method: 'credit_card_3ds',
              notes: `3D驗證付款成功 (rec_trade_id: ${rec_trade_id}, auth_code: ${auth_code || 'N/A'})`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.id);

          if (updateError) {
            console.error('Error updating order:', updateError);
          } else {
            console.log('Order updated successfully:', { orderId: order.id, newPaymentStatus });
          }
        }
      } else {
        console.warn('Order not found for order_number:', order_number);
      }
    }

    // Always respond with success to TapPay
    return new Response(
      JSON.stringify({
        status: 'ok',
        received: {
          rec_trade_id,
          order_number,
          payment_status: isSuccess ? 'success' : 'failed',
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in tappay-notify:', error);
    
    // Still respond with 200 to prevent TapPay retries
    return new Response(
      JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
