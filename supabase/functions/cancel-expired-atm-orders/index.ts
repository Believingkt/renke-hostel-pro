// 每日檢查 ATM 虛擬帳號逾期未付的訂單，自動取消
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const nowIso = new Date().toISOString();
  const { data: expired, error } = await supabase
    .from('orders')
    .select('id, order_number, accommodation_id, atm_expire_at, paid_amount, notes')
    .eq('payment_status', 'pending_payment')
    .not('atm_vacc_no', 'is', null)
    .neq('order_status', 'cancelled')
    .lt('atm_expire_at', nowIso)
    .limit(200);

  if (error) {
    console.error('[cancel-expired-atm-orders] query error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const cancelled: string[] = [];
  for (const o of expired || []) {
    if ((o.paid_amount || 0) > 0) continue; // 已部分入帳的不自動取消
    const note = `[ATM Expire] ${nowIso} - 虛擬帳號逾期未繳款，系統自動取消訂單`;
    const newNotes = o.notes ? `${o.notes}\n${note}` : note;
    const { error: upErr } = await supabase
      .from('orders')
      .update({
        order_status: 'cancelled',
        cancelled_at: nowIso,
        notes: newNotes,
        updated_at: nowIso,
      })
      .eq('id', o.id);
    if (upErr) {
      console.error('[cancel-expired-atm-orders] update error:', o.order_number, upErr);
      continue;
    }
    cancelled.push(o.order_number);
    await supabase.from('notifications').insert({
      accommodation_id: o.accommodation_id,
      type: 'payment',
      title: 'ATM 訂單逾期取消',
      description: `訂單 ${o.order_number} 因虛擬帳號逾期未繳款已自動取消`,
      order_id: o.id,
      is_read: false,
    });
  }

  console.log('[cancel-expired-atm-orders] done:', { checked: expired?.length || 0, cancelled: cancelled.length });
  return new Response(JSON.stringify({ ok: true, cancelled }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
