import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendBookingConfirmationByOrderId } from "../_shared/sendBookingEmail.ts";

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

// Verify webhook payload by querying TapPay Transaction API
async function verifyWithTapPay(recTradeId: string): Promise<{ verified: boolean; record?: any }> {
  const partnerKey = Deno.env.get('TAPPAY_PARTNER_KEY');
  if (!partnerKey) {
    console.error('[tappay-notify] Missing TAPPAY_PARTNER_KEY for verification');
    return { verified: false };
  }

  const envRaw = Deno.env.get('TAPPAY_ENV');
  const env = envRaw === 'sandbox' ? 'sandbox' : 'production';
  const endpoint = env === 'sandbox'
    ? 'https://sandbox.tappaysdk.com/tpc/transaction/query'
    : 'https://prod.tappaysdk.com/tpc/transaction/query';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': partnerKey,
      },
      body: JSON.stringify({
        partner_key: partnerKey,
        filters: { rec_trade_id: recTradeId },
      }),
    });

    const result = await response.json();

    // TapPay Record API: status 0 = success with data, 2 = end of list (both valid)
    if (result.status !== 0 && result.status !== 2) {
      console.warn('[tappay-notify] TapPay query failed:', { status: result.status, msg: result.msg });
      return { verified: false };
    }

    const record = result.trade_records?.[0];
    if (!record) {
      console.warn('[tappay-notify] No trade record found for:', recTradeId);
      return { verified: false };
    }

    return { verified: true, record };
  } catch (err) {
    console.error('[tappay-notify] Error querying TapPay API:', err);
    return { verified: false };
  }
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

    // ===== SECURITY: Verify webhook by querying TapPay API =====
    if (!body.rec_trade_id) {
      console.warn('[tappay-notify] Missing rec_trade_id, rejecting');
      return new Response(
        JSON.stringify({ status: 'error', message: 'Missing rec_trade_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const verification = await verifyWithTapPay(body.rec_trade_id);
    if (!verification.verified) {
      console.warn('[tappay-notify] Failed to verify transaction with TapPay API:', body.rec_trade_id);
      return new Response(
        JSON.stringify({ status: 'error', message: 'Transaction verification failed' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use verified data from TapPay API instead of webhook body
    const verifiedRecord = verification.record;
    const verifiedStatus = verifiedRecord.record_status; // 0=auth success, 1=capture success
    const verifiedAmount = verifiedRecord.amount;
    const isSuccess = verifiedStatus === 0 || verifiedStatus === 1;

    console.log('[tappay-notify] Verified with TapPay API:', {
      rec_trade_id: body.rec_trade_id,
      verified_status: verifiedStatus,
      verified_amount: verifiedAmount,
      webhook_status: body.status,
      webhook_amount: body.amount,
    });

    // Warn if webhook data doesn't match verified data
    if (body.amount !== verifiedAmount) {
      console.warn('[tappay-notify] Amount mismatch! webhook:', body.amount, 'verified:', verifiedAmount);
    }

    const {
      rec_trade_id,
      order_number,
      auth_code,
    } = body;

    // Use verified amount for all calculations
    const amount = verifiedAmount;

    // Strategy 1: Try to find order by order_number
    let order = null;
    let orderSource = '';

    const SELECT_COLS = 'id, accommodation_id, order_number, final_price, paid_amount, payment_status, notes, deposit_method, deposit_status, atm_rec_trade_id, payment_method';

    if (order_number) {
      const { data, error } = await supabase
        .from('orders')
        .select(SELECT_COLS)
        .eq('order_number', order_number)
        .maybeSingle();

      if (!error && data) {
        order = data;
        orderSource = 'order_number';
      }
    }

    // Strategy 1b: ATM 入帳對應 atm_rec_trade_id
    if (!order && rec_trade_id) {
      const { data, error } = await supabase
        .from('orders')
        .select(SELECT_COLS)
        .eq('atm_rec_trade_id', rec_trade_id)
        .maybeSingle();
      if (!error && data) {
        order = data;
        orderSource = 'atm_rec_trade_id';
      }
    }

    // Strategy 2: Search by rec_trade_id in order notes (backup)
    if (!order && rec_trade_id) {
      console.log('[tappay-notify] Searching by rec_trade_id in notes...');
      const { data, error } = await supabase
        .from('orders')
        .select(SELECT_COLS)
        .ilike('notes', `%${rec_trade_id}%`)
        .maybeSingle();

      if (!error && data) {
        order = data;
        orderSource = 'rec_trade_id_notes';
      }
    }

    // Strategy 3: Check for pending 3DS booking that needs order creation
    if (!order && isSuccess && rec_trade_id) {
      console.log('[tappay-notify] No existing order found. Creating notification for manual follow-up...');
      
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
      }

      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'Payment verified but no matching order found. Notification created.',
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
        // 偵測是否為 ATM 入帳
        const isAtm = order.atm_rec_trade_id === rec_trade_id
          || order.payment_method === 'atm'
          || verifiedRecord?.acquirer === 'TW_TAPPAY_ATM'
          || verifiedRecord?.pay_info != null;

        const currentPaidAmount = order.paid_amount || 0;
        const newPaidAmount = currentPaidAmount + amount;

        let newPaymentStatus = order.payment_status;
        if (newPaidAmount >= order.final_price) {
          newPaymentStatus = 'paid';
        } else if (newPaidAmount > 0) {
          newPaymentStatus = order.payment_status === 'unpaid' || order.payment_status === 'pending_payment'
            ? 'deposit_paid' : 'partial';
        }

        const tag = isAtm ? '[ATM Webhook]' : '[3DS Webhook]';
        const transactionNote = `${tag} ${new Date().toISOString()} - 付款成功 NT$${amount} (rec_trade_id: ${rec_trade_id}${auth_code ? `, auth_code: ${auth_code}` : ''})`;
        const newNotes = order.notes
          ? `${order.notes}\n${transactionNote}`
          : transactionNote;

        const updatePayload: Record<string, unknown> = {
          payment_status: newPaymentStatus,
          paid_amount: newPaidAmount,
          payment_method: isAtm ? 'atm' : 'credit_card_3ds',
          balance_payment_method: newPaymentStatus === 'paid'
            ? (isAtm ? 'ATM 虛擬帳號轉帳' : '信用卡(3D驗證)')
            : null,
          notes: newNotes,
          updated_at: new Date().toISOString(),
        };

        const { error: updateError } = await supabase
          .from('orders')
          .update(updatePayload)
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

          // Save deposit card token if order needs card binding and TapPay returned card_secret
          try {
            const cardSecret = verifiedRecord?.card_secret;
            const needsBinding = order.deposit_method === 'card'
              && order.deposit_status !== 'card_bound'
              && order.deposit_status !== 'charged'
              && order.deposit_status !== 'partially_refunded'
              && order.deposit_status !== 'refunded';
            if (needsBinding && cardSecret?.card_key && cardSecret?.card_token) {
              const cardInfo = verifiedRecord?.card_info ?? {};
              await supabase
                .from('deposit_card_tokens')
                .update({ is_active: false })
                .eq('order_id', order.id);
              await supabase.from('deposit_card_tokens').insert({
                order_id: order.id,
                accommodation_id: order.accommodation_id,
                card_key: cardSecret.card_key,
                card_token: cardSecret.card_token,
                card_last_four: cardInfo.last_four ?? null,
                card_type: cardInfo.type ? String(cardInfo.type) : null,
                card_expiry: cardInfo.expiry_date ?? null,
                is_active: true,
              });
              await supabase
                .from('orders')
                .update({ deposit_method: 'card', deposit_status: 'card_bound' })
                .eq('id', order.id);
              console.log('[tappay-notify] Deposit card token bound from payment');
            }
          } catch (bindErr) {
            console.error('[tappay-notify] Failed to bind deposit card from payment:', bindErr);
          }

          await supabase.from('notifications').insert({
            accommodation_id: await getAccommodationIdFromOrder(supabase, order.id),
            type: 'payment',
            title: isAtm ? 'ATM 付款確認成功' : '3DS 付款確認成功',
            description: `訂單 ${order.order_number} 透過 ${isAtm ? 'ATM 虛擬帳號' : '3D 驗證'} 付款 NT$${amount.toLocaleString()}，狀態已更新為「${getPaymentStatusLabel(newPaymentStatus)}」`,
            order_id: order.id,
            is_read: false,
          });

          // ATM 付款完成且訂單已全額付清 → 寄送訂房通知 email
          if (isAtm && newPaymentStatus === 'paid') {
            try {
              const { data: full } = await supabase
                .from('orders')
                .select('guest_name, guest_email, check_in_date, check_out_date, guest_count, meal_plan, final_price, pet_count, pet_plan_price, meal_plan_details, meal_plan_total, room_types(name)')
                .eq('id', order.id)
                .maybeSingle();

              if (full?.guest_email) {
                const roomName = (full as any).room_types?.name || '';
                const emailPayload = {
                  guestName: full.guest_name,
                  guestEmail: full.guest_email,
                  orderNumber: order.order_number,
                  roomName,
                  checkInDate: full.check_in_date,
                  checkOutDate: full.check_out_date,
                  guestCount: full.guest_count,
                  mealPlan: full.meal_plan || '',
                  finalPrice: full.final_price,
                  depositAmount: full.final_price,
                  paymentMethod: 'ATM 虛擬帳號轉帳',
                  petCount: full.pet_count > 0 ? full.pet_count : undefined,
                  petPlanPrice: full.pet_plan_price > 0 ? full.pet_plan_price : undefined,
                  mealPlanDetails: Array.isArray(full.meal_plan_details) && full.meal_plan_details.length > 0 ? full.meal_plan_details : undefined,
                  mealPlanTotal: full.meal_plan_total > 0 ? full.meal_plan_total : undefined,
                };
                const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify(emailPayload),
                });
                console.log('[tappay-notify] ATM booking confirmation email status:', emailResp.status);
              } else {
                console.log('[tappay-notify] ATM order has no guest_email, skip email');
              }
            } catch (mailErr) {
              console.error('[tappay-notify] ATM email send failed (non-fatal):', mailErr);
            }
          }
        }
      } else {
        console.log('[tappay-notify] Payment failed (verified):', { 
          orderId: order.id,
          orderNumber: order.order_number,
          verifiedStatus: verifiedStatus,
        });

        const failureNote = `[3DS Webhook] ${new Date().toISOString()} - 付款失敗 (rec_trade_id: ${rec_trade_id}, verified_status: ${verifiedStatus})`;
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

        await supabase.from('notifications').insert({
          accommodation_id: await getAccommodationIdFromOrder(supabase, order.id),
          type: 'payment',
          title: '3DS 付款失敗',
          description: `訂單 ${order.order_number} 的 3D 驗證付款失敗`,
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
    'refunded': '已退款',
    'partial_refunded': '部分退款',
  };
  return labels[status] || status;
}
