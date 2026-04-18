import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers for webhook (TapPay backend calls)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * TapPay 退款通知 Webhook
 * 
 * 當在 TapPay 後台執行退款後，TapPay 會發送通知到此 webhook
 * 此 function 會更新訂單的付款狀態和記錄
 * 
 * TapPay 退款通知的 payload 結構：
 * - status: 退款狀態 (0 = 成功)
 * - rec_trade_id: 原始交易編號
 * - refund_id: 退款編號
 * - amount: 退款金額
 * - refund_amount: 退款金額
 * - order_number: 訂單編號 (若有帶入)
 */

interface TapPayRefundNotifyPayload {
  status: number;
  rec_trade_id: string;
  refund_id?: string;
  bank_refund_id?: string;
  order_number?: string;
  amount?: number;
  refund_amount?: number;
  msg?: string;
  refund_at?: number; // Unix timestamp in milliseconds
  merchant_id?: string;
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
    // ===== Webhook auth: shared secret in header =====
    // TapPay 後台對此 notify URL 設一個固定 query/header 驗證碼，作為基本驗證層。
    // 我們同時支援兩種：
    //   1) 自訂 header `x-webhook-secret`（推薦，需在 TapPay 後台設定可帶 header 時）
    //   2) URL query `?secret=xxx`（多數 webhook 後台都支援）
    const expectedSecret = Deno.env.get('TAPPAY_WEBHOOK_SECRET');
    if (expectedSecret) {
      const headerSecret = req.headers.get('x-webhook-secret');
      const url = new URL(req.url);
      const querySecret = url.searchParams.get('secret');
      const provided = headerSecret || querySecret || '';
      // Constant-time compare
      const a = new TextEncoder().encode(provided);
      const b = new TextEncoder().encode(expectedSecret);
      let mismatch = a.length !== b.length ? 1 : 0;
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i++) mismatch |= a[i] ^ b[i];
      if (mismatch !== 0) {
        console.warn('[tappay-refund-notify] Invalid webhook secret');
        return new Response(JSON.stringify({ status: 'unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.warn('[tappay-refund-notify] TAPPAY_WEBHOOK_SECRET not set — webhook is unauthenticated');
    }

    const body: TapPayRefundNotifyPayload = await req.json();
    
    console.log('[tappay-refund-notify] Webhook received:', {
      status: body.status,
      rec_trade_id: body.rec_trade_id,
      refund_id: body.refund_id,
      order_number: body.order_number,
      refund_amount: body.refund_amount || body.amount,
      msg: body.msg,
    });

    const {
      status,
      rec_trade_id,
      refund_id,
      order_number,
      msg,
    } = body;

    // 退款金額可能在 refund_amount 或 amount 欄位
    const refundAmount = body.refund_amount || body.amount || 0;
    const isSuccess = status === 0;

    // Strategy 1: Try to find order by order_number
    let order = null;
    let orderSource = '';

    if (order_number) {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, final_price, paid_amount, payment_status, notes, accommodation_id')
        .eq('order_number', order_number)
        .maybeSingle();

      if (!error && data) {
        order = data;
        orderSource = 'order_number';
      }
    }

    // Strategy 2: Search by rec_trade_id in order notes (backup)
    if (!order && rec_trade_id) {
      console.log('[tappay-refund-notify] Searching by rec_trade_id in notes...');
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, final_price, paid_amount, payment_status, notes, accommodation_id')
        .ilike('notes', `%${rec_trade_id}%`)
        .maybeSingle();

      if (!error && data) {
        order = data;
        orderSource = 'rec_trade_id_notes';
      }
    }

    if (!order) {
      console.warn('[tappay-refund-notify] Order not found for:', { order_number, rec_trade_id });
      
      // 建立通知以便人工處理
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          accommodation_id: await getDefaultAccommodationId(supabase),
          type: 'payment',
          title: '退款通知 - 找不到對應訂單',
          description: `TapPay 退款通知: 交易 ${rec_trade_id}，退款金額 NT$${refundAmount.toLocaleString()}，但系統找不到對應訂單。可能需要手動處理。`,
          is_read: false,
        });

      if (notifError) {
        console.error('[tappay-refund-notify] Failed to create notification:', notifError);
      }

      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'Order not found for refund notification',
          received: { rec_trade_id, order_number, refund_amount: refundAmount },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tappay-refund-notify] Found order:', { 
      orderId: order.id, 
      orderNumber: order.order_number,
      currentStatus: order.payment_status,
      currentPaidAmount: order.paid_amount,
      foundBy: orderSource,
    });

    // Check if refund already recorded (prevent duplicate updates)
    const refundIdentifier = refund_id || `refund-${rec_trade_id}-${refundAmount}`;
    if (order.notes?.includes(refundIdentifier)) {
      console.log('[tappay-refund-notify] Refund already recorded in order, skipping update');
      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'Refund already processed',
          order_number: order.order_number,
          refund_id: refundIdentifier,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (isSuccess) {
      // 計算退款後的已付金額
      const currentPaidAmount = order.paid_amount || 0;
      const newPaidAmount = Math.max(0, currentPaidAmount - refundAmount);
      
      // 決定新的付款狀態
      let newPaymentStatus = order.payment_status;
      if (newPaidAmount <= 0) {
        // 全額退款
        newPaymentStatus = 'refunded';
      } else if (newPaidAmount < order.final_price) {
        // 部分退款
        newPaymentStatus = 'partial_refunded';
      }

      // 建立退款記錄
      const refundNote = `[退款 Webhook] ${new Date().toISOString()} - 退款成功 NT$${refundAmount.toLocaleString()} (rec_trade_id: ${rec_trade_id}, refund_id: ${refund_id || 'N/A'})`;
      const newNotes = order.notes 
        ? `${order.notes}\n${refundNote}`
        : refundNote;

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: newPaymentStatus,
          paid_amount: newPaidAmount,
          notes: newNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (updateError) {
        console.error('[tappay-refund-notify] Error updating order:', updateError);
        throw updateError;
      }

      console.log('[tappay-refund-notify] Order updated successfully:', { 
        orderId: order.id, 
        orderNumber: order.order_number,
        previousPaid: currentPaidAmount,
        refundedAmount: refundAmount,
        newPaidAmount,
        newPaymentStatus,
      });

      // 建立退款成功通知
      await supabase.from('notifications').insert({
        accommodation_id: order.accommodation_id,
        type: 'payment',
        title: '退款處理成功',
        description: `訂單 ${order.order_number} 已退款 NT$${refundAmount.toLocaleString()}。付款狀態已更新為「${getPaymentStatusLabel(newPaymentStatus)}」，剩餘已付金額 NT$${newPaidAmount.toLocaleString()}`,
        order_id: order.id,
        is_read: false,
      });

      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'Refund processed successfully',
          order_number: order.order_number,
          refund_amount: refundAmount,
          new_paid_amount: newPaidAmount,
          new_payment_status: newPaymentStatus,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // 退款失敗
      console.log('[tappay-refund-notify] Refund failed:', { 
        orderId: order.id,
        orderNumber: order.order_number,
        status,
        msg,
      });

      // 記錄退款失敗
      const failureNote = `[退款 Webhook] ${new Date().toISOString()} - 退款失敗 NT$${refundAmount.toLocaleString()} (rec_trade_id: ${rec_trade_id}, status: ${status}, msg: ${msg || 'N/A'})`;
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

      // 建立退款失敗通知
      await supabase.from('notifications').insert({
        accommodation_id: order.accommodation_id,
        type: 'payment',
        title: '退款處理失敗',
        description: `訂單 ${order.order_number} 的退款處理失敗，金額 NT$${refundAmount.toLocaleString()}。原因: ${msg || '未知'}`,
        order_id: order.id,
        is_read: false,
      });

      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'Refund failure recorded',
          order_number: order.order_number,
          refund_status: 'failed',
          error_msg: msg,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tappay-refund-notify] Error:', error);
    
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
    'refunded': '已退款',
    'partial_refunded': '部分退款',
  };
  return labels[status] || status;
}
