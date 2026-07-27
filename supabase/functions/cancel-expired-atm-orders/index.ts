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
  const taipeiIso = (() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date()).reduce<Record<string, string>>((a, p) => (a[p.type] = p.value, a), {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
  })();
  // 寬限期：銀行入帳／TapPay 回呼可能延遲，逾期後再等 GRACE_MINUTES 才取消
  const GRACE_MINUTES = 3;
  const cutoffIso = new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString();
  const { data: expired, error } = await supabase
    .from('orders')
    .select('id, order_number, accommodation_id, atm_expire_at, paid_amount, notes')
    .eq('payment_status', 'pending_payment')
    .not('atm_vacc_no', 'is', null)
    .neq('order_status', 'cancelled')
    .lt('atm_expire_at', cutoffIso)
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

    // 取消前再讀一次最新狀態，避免與付款回呼（tappay-notify）競爭而誤取消已付款訂單
    const { data: fresh } = await supabase
      .from('orders')
      .select('payment_status, order_status, paid_amount')
      .eq('id', o.id)
      .maybeSingle();
    if (!fresh) continue;
    if (fresh.order_status === 'cancelled') continue;
    if ((fresh.paid_amount || 0) > 0) continue;
    if (fresh.payment_status !== 'pending_payment') {
      console.log('[cancel-expired-atm-orders] skip (payment recorded):', o.order_number, fresh.payment_status);
      continue;
    }
    const note = `[ATM Expire] ${taipeiIso} - 虛擬帳號逾期未繳款，系統自動取消訂單`;
    const newNotes = o.notes ? `${o.notes}\n${note}` : note;
    const { error: upErr } = await supabase
      .from('orders')
      .update({
        order_status: 'cancelled',
        cancelled_at: nowIso,
        notes: newNotes,
        updated_at: nowIso,
      })
      .eq('id', o.id)
      .eq('payment_status', 'pending_payment')
      .neq('order_status', 'cancelled');
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
