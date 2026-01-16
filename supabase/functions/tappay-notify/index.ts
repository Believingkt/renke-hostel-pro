import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers for webhook (TapPay backend calls)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TapPayNotifyPayload {
  status: number;
  rec_trade_id: string;
  bank_transaction_id?: string;
  order_number?: string;
  amount: number;
  msg?: string;
  auth_code?: string;
  card_info?: {
    bin_code?: string;
    last_four?: string;
    issuer?: string;
    funding?: number;
    type?: number;
    level?: string;
    country?: string;
    country_code?: string;
  };
  merchant_id?: string;
  acquirer?: string;
  transaction_time_millis?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: TapPayNotifyPayload = await req.json();
    
    console.log('[tappay-notify] Webhook received:', {
      status: body.status,
      rec_trade_id: body.rec_trade_id,
      order_number: body.order_number,
      amount: body.amount,
      auth_code: body.auth_code,
      msg: body.msg,
    });

    const {
      status,
      rec_trade_id,
      bank_transaction_id,
      order_number,
      amount,
      auth_code,
    } = body;

    const isSuccess = status === 0;

    // Strategy 1: Try to find order by order_number
    let order = null;
    let orderSource = '';

    if (order_number) {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, final_price, paid_amount, payment_status, notes')
        .eq('order_number', order_number)
        .maybeSingle();

      if (!error && data) {
        order = data;
        orderSource = 'order_number';
      }
    }

    // Strategy 2: Search by rec_trade_id in order notes (backup)
    if (!order && rec_trade_id) {
      console.log('[tappay-notify] Searching by rec_trade_id in notes...');
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, final_price, paid_amount, payment_status, notes')
        .ilike('notes', `%${rec_trade_id}%`)
        .maybeSingle();

      if (!error && data) {
        order = data;
        orderSource = 'rec_trade_id_notes';
      }
    }

    // Strategy 3: Check for pending 3DS booking that needs order creation
    // This happens when frontend callback failed but webhook arrives
    if (!order && isSuccess && rec_trade_id) {
      console.log('[tappay-notify] No existing order found. Checking if this is a pending 3DS booking...');
      
      // Log this for debugging - the actual order creation should be done by frontend
      // But we can create a notification for manual follow-up
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          accommodation_id: await getDefaultAccommodationId(supabase),
          type: 'payment',
          title: '3DS 付款成功但無對應訂單',
          description: `交易 ${rec_trade_id} 付款成功 (NT$${amount})，但系統找不到對應訂單。可能需要手動處理。授權碼: ${auth_code || 'N/A'}`,
          is_read: false,
        });

      if (notifError) {
        console.error('[tappay-notify] Failed to create notification:', notifError);
      } else {
        console.log('[tappay-notify] Created notification for unmatched payment');
      }

      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'Payment received but no matching order found. Notification created.',
          rec_trade_id,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (order) {
      console.log('[tappay-notify] Found order:', { 
        orderId: order.id, 
        orderNumber: order.order_number,
        currentStatus: order.payment_status,
        foundBy: orderSource,
      });

      // Check if order already has this transaction recorded (prevent duplicate updates)
      if (order.notes?.includes(rec_trade_id)) {
        console.log('[tappay-notify] Transaction already recorded in order, skipping update');
        return new Response(
          JSON.stringify({
            status: 'ok',
            message: 'Transaction already processed',
            order_number: order.order_number,
            rec_trade_id,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (isSuccess) {
        // Calculate new payment amounts
        const currentPaidAmount = order.paid_amount || 0;
        const newPaidAmount = currentPaidAmount + amount;
        
        // Determine new payment status
        let newPaymentStatus = order.payment_status;
        if (newPaidAmount >= order.final_price) {
          newPaymentStatus = 'paid';
        } else if (newPaidAmount > 0) {
          newPaymentStatus = order.payment_status === 'unpaid' ? 'deposit_paid' : 'partial';
        }

        // Build updated notes
        const transactionNote = `[3DS Webhook] ${new Date().toISOString()} - 付款成功 NT$${amount} (rec_trade_id: ${rec_trade_id}, auth_code: ${auth_code || 'N/A'})`;
        const newNotes = order.notes 
          ? `${order.notes}\n${transactionNote}`
          : transactionNote;

        const { error: updateError } = await supabase
          .from('orders')
          .update({
            payment_status: newPaymentStatus,
            paid_amount: newPaidAmount,
            payment_method: 'credit_card_3ds',
            balance_payment_method: newPaymentStatus === 'paid' ? '信用卡(3D驗證)' : null,
            notes: newNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id);

        if (updateError) {
          console.error('[tappay-notify] Error updating order:', updateError);
        } else {
          console.log('[tappay-notify] Order updated successfully:', { 
            orderId: order.id, 
            orderNumber: order.order_number,
            previousPaid: currentPaidAmount,
            addedAmount: amount,
            newPaidAmount,
            newPaymentStatus,
          });

          // Create success notification
          await supabase.from('notifications').insert({
            accommodation_id: await getAccommodationIdFromOrder(supabase, order.id),
            type: 'payment',
            title: '3DS 付款確認成功',
            description: `訂單 ${order.order_number} 透過 3D 驗證付款 NT$${amount.toLocaleString()}，狀態已更新為「${getPaymentStatusLabel(newPaymentStatus)}」`,
            order_id: order.id,
            is_read: false,
          });
        }
      } else {
        // Payment failed
        console.log('[tappay-notify] Payment failed:', { 
          orderId: order.id,
          orderNumber: order.order_number,
          status: body.status,
          msg: body.msg,
        });

        // Add failure note but don't change payment status
        const failureNote = `[3DS Webhook] ${new Date().toISOString()} - 付款失敗 (rec_trade_id: ${rec_trade_id}, status: ${status}, msg: ${body.msg || 'N/A'})`;
        const newNotes = order.notes 
          ? `${order.notes}\n${failureNote}`
          : failureNote;

        await supabase
          .from('orders')
          .update({
            notes: newNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id);

        // Create failure notification
        await supabase.from('notifications').insert({
          accommodation_id: await getAccommodationIdFromOrder(supabase, order.id),
          type: 'payment',
          title: '3DS 付款失敗',
          description: `訂單 ${order.order_number} 的 3D 驗證付款失敗。原因: ${body.msg || '未知'}`,
          order_id: order.id,
          is_read: false,
        });
      }

      return new Response(
        JSON.stringify({
          status: 'ok',
          received: {
            rec_trade_id,
            order_number: order.order_number,
            payment_status: isSuccess ? 'success' : 'failed',
            amount,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.warn('[tappay-notify] Order not found for:', { order_number, rec_trade_id });
      
      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'Order not found',
          received: { rec_trade_id, order_number },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tappay-notify] Error:', error);
    
    // Still respond with 200 to prevent TapPay retries
    return new Response(
      JSON.stringify({
        status: 'error',
        message: errorMessage,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Helper function to get accommodation_id from order
async function getAccommodationIdFromOrder(supabase: any, orderId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('orders')
      .select('accommodation_id')
      .eq('id', orderId)
      .single();
    return data?.accommodation_id || await getDefaultAccommodationId(supabase);
  } catch {
    return await getDefaultAccommodationId(supabase);
  }
}

// Helper function to get default accommodation_id (fallback)
async function getDefaultAccommodationId(supabase: any): Promise<string> {
  try {
    const { data } = await supabase
      .from('accommodation_info')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .single();
    return data?.id || '';
  } catch {
    return '';
  }
}

// Helper function to get payment status label
function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'unpaid': '未付款',
    'deposit_paid': '已付訂金',
    'partial': '部分付款',
    'paid': '已付清',
  };
  return labels[status] || status;
}
