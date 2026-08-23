-- ============================================================
-- Phase G2-C：團購信用卡付款後建單－原子性、對帳與巡檢
-- 僅影響 order_source='group_buy' 的信用卡流程；
-- 一般訂房（pending_paid_order_drafts / create-paid-order）完全不觸及。
-- ============================================================

-- ── 1) Draft：退款對帳 / 卡住告警 / Email 一次性欄位 ──
ALTER TABLE public.group_buy_payment_drafts
  ADD COLUMN IF NOT EXISTS refunded_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_status text,
  ADD COLUMN IF NOT EXISTS refund_rec_trade_id text,
  ADD COLUMN IF NOT EXISTS refund_checked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS stuck_alerted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS guest_email_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS venue_email_sent_at timestamp with time zone;

-- 已付款但尚未轉單的 draft 巡檢用
CREATE INDEX IF NOT EXISTS group_buy_payment_drafts_stuck_idx
  ON public.group_buy_payment_drafts (status, updated_at)
  WHERE status = 'paid' AND converted_order_id IS NULL;

-- ── 2) 付款事件：draft 階段尚無正式 order，order_id 必須可為 NULL ──
ALTER TABLE public.group_buy_payment_events ALTER COLUMN order_id DROP NOT NULL;

-- ============================================================
-- 3) 原子取得房位保留（B2）
--    住宿層級 advisory xact lock 涵蓋：accommodation / room_type /
--    check_in~check_out 每一日 / 包棟互斥（cross_block 亦以住宿為範圍）。
--    「查庫存 → INSERT draft」在同一 transaction 內完成。
-- ============================================================
CREATE OR REPLACE FUNCTION public.acquire_group_buy_payment_hold(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_acc   uuid := (p_payload->>'accommodation_id')::uuid;
  v_rt    uuid := (p_payload->>'room_type_id')::uuid;
  v_qty   integer := COALESCE((p_payload->>'room_quantity')::integer, 1);
  v_dates text[] := ARRAY(SELECT jsonb_array_elements_text(p_payload->'dates'));
  v_bad   record;
  v_draft public.group_buy_payment_drafts%ROWTYPE;
BEGIN
  IF v_acc IS NULL OR v_rt IS NULL OR COALESCE(array_length(v_dates, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_payload', 'error', '付款保留資料不完整');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('gb_hold:' || v_acc::text));

  SELECT r.date_value, r.available_rooms, r.is_blocked
    INTO v_bad
  FROM public.get_group_buy_adjusted_inventory_batch(v_rt, v_dates, v_acc, NULL) r
  WHERE r.is_blocked OR r.available_rooms < v_qty
  ORDER BY r.date_value
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'hold_unavailable',
      'date', v_bad.date_value,
      'error', '目前房位已被其他旅客暫時保留，請重新選擇。'
    );
  END IF;

  INSERT INTO public.group_buy_payment_drafts (
    idempotency_key, campaign_id, campaign_package_id, accommodation_id, room_type_id,
    check_in_date, check_out_date, room_quantity,
    adult_count, child_count, toddler_count, infant_count, guest_count,
    guest_name, guest_phone, guest_email, guest_note,
    booking_payload, price_snapshot,
    total_price, deposit_amount, amount_to_charge,
    payment_provider, payment_type, status, expires_at
  ) VALUES (
    p_payload->>'idempotency_key',
    (p_payload->>'campaign_id')::uuid,
    (p_payload->>'campaign_package_id')::uuid,
    v_acc,
    v_rt,
    (p_payload->>'check_in_date')::date,
    (p_payload->>'check_out_date')::date,
    v_qty,
    COALESCE((p_payload->>'adult_count')::integer, 2),
    COALESCE((p_payload->>'child_count')::integer, 0),
    COALESCE((p_payload->>'toddler_count')::integer, 0),
    COALESCE((p_payload->>'infant_count')::integer, 0),
    COALESCE((p_payload->>'guest_count')::integer, 2),
    p_payload->>'guest_name',
    p_payload->>'guest_phone',
    p_payload->>'guest_email',
    NULLIF(p_payload->>'guest_note', ''),
    COALESCE(p_payload->'booking_payload', '{}'::jsonb),
    COALESCE(p_payload->'price_snapshot', '{}'::jsonb),
    (p_payload->>'total_price')::integer,
    (p_payload->>'deposit_amount')::integer,
    (p_payload->>'amount_to_charge')::integer,
    COALESCE(p_payload->>'payment_provider', 'tappay'),
    COALESCE(p_payload->>'payment_type', 'credit_card'),
    'pending',
    (p_payload->>'expires_at')::timestamptz
  )
  RETURNING * INTO v_draft;

  INSERT INTO public.group_buy_payment_events (campaign_id, order_id, event_type, amount, actor_label, note)
  VALUES (
    v_draft.campaign_id, NULL, 'payment_draft_created', v_draft.amount_to_charge,
    COALESCE(v_draft.guest_name, 'guest'),
    '信用卡付款保留建立（draft:' || v_draft.id || '／' || v_draft.check_in_date || ' → ' ||
    v_draft.check_out_date || '／保留至 ' || v_draft.expires_at || '）'
  );

  RETURN jsonb_build_object('ok', true, 'draft', to_jsonb(v_draft));
END;
$function$;

REVOKE ALL ON FUNCTION public.acquire_group_buy_payment_hold(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_group_buy_payment_hold(jsonb) TO service_role;

-- ============================================================
-- 4) 原子轉單：Draft → 正式 order + commission + 稽核 + draft.converted（B3）
--    價格／人數／房型一律使用呼叫端已凍結的 draft 快照，
--    本函式不重算任何團購價格（三段價 / 兒童加價 / deposit_percentage）。
--    任一步失敗 → 整個 transaction rollback，不留半張 order。
-- ============================================================
CREATE OR REPLACE FUNCTION public.convert_group_buy_payment_draft(
  p_draft_id uuid,
  p_order jsonb,
  p_commission jsonb,
  p_events jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_draft  public.group_buy_payment_drafts%ROWTYPE;
  v_order  public.orders%ROWTYPE;
  v_num    text;
  v_ev     jsonb;
  v_bad    record;
  v_dates  text[] := ARRAY(SELECT jsonb_array_elements_text(p_order->'inventory_dates'));
BEGIN
  SELECT * INTO v_draft FROM public.group_buy_payment_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'draft_not_found', 'error', '查無此付款資料');
  END IF;

  -- 已轉單：直接回既有訂單（PaymentResult 重整 / callback 重送）
  IF v_draft.converted_order_id IS NOT NULL THEN
    SELECT order_number INTO v_num FROM public.orders WHERE id = v_draft.converted_order_id;
    RETURN jsonb_build_object(
      'ok', true, 'already_converted', true,
      'order_id', v_draft.converted_order_id, 'order_number', v_num
    );
  END IF;

  IF v_draft.status NOT IN ('pending', 'payment_processing', 'paid', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_status', 'error', '此付款資料目前無法轉為訂單');
  END IF;

  -- 與 acquire_group_buy_payment_hold 共用同一把鎖，序列化同一民宿的保留與轉單
  PERFORM pg_advisory_xact_lock(hashtext('gb_hold:' || v_draft.accommodation_id::text));

  INSERT INTO public.orders (
    order_number, accommodation_id, room_type_id, package_id, room_quantity,
    check_in_date, check_out_date, guest_count,
    adult_count, child_count, toddler_count, infant_count,
    guest_name, guest_phone, guest_email,
    total_price, discount_amount, final_price, deposit_amount, discount_code,
    order_status, confirmed_at, payment_status, paid_amount,
    payment_provider, payment_method, deposit_payment_method,
    order_source, ota_channel, notes, group_buy_booking_notice_snapshot
  ) VALUES (
    '',
    (p_order->>'accommodation_id')::uuid,
    (p_order->>'room_type_id')::uuid,
    NULLIF(p_order->>'package_id', '')::uuid,
    COALESCE((p_order->>'room_quantity')::integer, 1),
    (p_order->>'check_in_date')::date,
    (p_order->>'check_out_date')::date,
    (p_order->>'guest_count')::integer,
    (p_order->>'adult_count')::integer,
    (p_order->>'child_count')::integer,
    (p_order->>'toddler_count')::integer,
    (p_order->>'infant_count')::integer,
    p_order->>'guest_name',
    p_order->>'guest_phone',
    p_order->>'guest_email',
    (p_order->>'total_price')::numeric,
    COALESCE((p_order->>'discount_amount')::numeric, 0),
    (p_order->>'final_price')::numeric,
    (p_order->>'deposit_amount')::numeric,
    NULLIF(p_order->>'discount_code', ''),
    COALESCE(p_order->>'order_status', 'confirmed'),
    COALESCE(NULLIF(p_order->>'confirmed_at', '')::timestamptz, now()),
    COALESCE(p_order->>'payment_status', 'deposit_paid'),
    COALESCE((p_order->>'paid_amount')::numeric, 0),
    COALESCE(p_order->>'payment_provider', 'tappay'),
    COALESCE(p_order->>'payment_method', 'credit_card_3ds'),
    COALESCE(p_order->>'deposit_payment_method', 'credit_card_3ds'),
    COALESCE(p_order->>'order_source', 'group_buy'),
    NULLIF(p_order->>'ota_channel', ''),
    p_order->>'notes',
    CASE WHEN p_order ? 'booking_notice_snapshot' THEN p_order->'booking_notice_snapshot' ELSE NULL END
  )
  RETURNING * INTO v_order;

  -- 建單後複驗（排除本 draft 自己的 hold）：負值代表超賣，直接 rollback
  IF COALESCE(array_length(v_dates, 1), 0) > 0 THEN
    SELECT r.date_value, r.available_rooms, r.is_blocked
      INTO v_bad
    FROM public.get_group_buy_adjusted_inventory_batch(
           v_order.room_type_id, v_dates, v_order.accommodation_id, v_draft.id
         ) r
    WHERE r.available_rooms < 0
    ORDER BY r.date_value
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'group_buy_oversold_on_convert:%', v_bad.date_value;
    END IF;
  END IF;

  INSERT INTO public.group_buy_commissions (
    campaign_id, order_id, kol_profile_id, revenue_base,
    commission_rate, commission_amount, status, price_snapshot
  ) VALUES (
    (p_commission->>'campaign_id')::uuid,
    v_order.id,
    NULLIF(p_commission->>'kol_profile_id', '')::uuid,
    (p_commission->>'revenue_base')::numeric,
    COALESCE((p_commission->>'commission_rate')::numeric, 0),
    COALESCE((p_commission->>'commission_amount')::numeric, 0),
    COALESCE(p_commission->>'status', 'pending'),
    COALESCE(p_commission->'price_snapshot', '{}'::jsonb)
  );

  FOR v_ev IN SELECT * FROM jsonb_array_elements(COALESCE(p_events, '[]'::jsonb))
  LOOP
    INSERT INTO public.group_buy_payment_events (campaign_id, order_id, event_type, amount, actor_label, note)
    VALUES (
      NULLIF(v_ev->>'campaign_id', '')::uuid,
      v_order.id,
      v_ev->>'event_type',
      NULLIF(v_ev->>'amount', '')::numeric,
      v_ev->>'actor_label',
      v_ev->>'note'
    );
  END LOOP;

  UPDATE public.group_buy_payment_drafts
     SET status = 'converted',
         converted_order_id = v_order.id,
         converted_at = now(),
         last_error = NULL
   WHERE id = v_draft.id;

  RETURN jsonb_build_object(
    'ok', true, 'already_converted', false,
    'order_id', v_order.id, 'order_number', v_order.order_number,
    'order', to_jsonb(v_order)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_group_buy_payment_draft(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_group_buy_payment_draft(uuid, jsonb, jsonb, jsonb) TO service_role;

-- ============================================================
-- 5) 已付款但未成單的 draft 巡檢（B5）
--    錢已收，因此「不」自動釋放 hold：僅建立站內通知 + 稽核事件。
-- ============================================================
CREATE OR REPLACE FUNCTION public.scan_stuck_group_buy_paid_drafts(p_minutes integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.group_buy_payment_drafts
    WHERE status = 'paid'
      AND converted_order_id IS NULL
      AND updated_at < now() - make_interval(mins => GREATEST(p_minutes, 1))
      AND (stuck_alerted_at IS NULL OR stuck_alerted_at < now() - interval '6 hours')
    LIMIT 100
  LOOP
    INSERT INTO public.notifications (accommodation_id, type, title, description, is_read)
    VALUES (
      r.accommodation_id, 'payment',
      '團購信用卡已付款但訂單尚未建立',
      '付款保留 ' || r.id || '（交易 ' || COALESCE(r.rec_trade_id, '未知') || '／NT$' ||
      r.amount_to_charge || '／' || r.guest_name || '／' || r.check_in_date || ' → ' || r.check_out_date ||
      '）已收款超過 ' || p_minutes || ' 分鐘仍未建立正式訂單，房位仍保留中，請立即人工處理。',
      false
    );
    INSERT INTO public.group_buy_payment_events (campaign_id, order_id, event_type, amount, actor_label, note)
    VALUES (r.campaign_id, NULL, 'manual_review', r.amount_to_charge, 'system(watchdog)',
      '已付款但未轉單逾時（draft:' || r.id || '／rec_trade_id:' || COALESCE(r.rec_trade_id, '-') || '）');
    UPDATE public.group_buy_payment_drafts SET stuck_alerted_at = now() WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.scan_stuck_group_buy_paid_drafts(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_stuck_group_buy_paid_drafts(integer) TO service_role;

-- 純 SQL 排程，不經 HTTP，不需寫死任何 project ref
SELECT cron.unschedule('group-buy-stuck-paid-draft-scan')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'group-buy-stuck-paid-draft-scan');

SELECT cron.schedule(
  'group-buy-stuck-paid-draft-scan',
  '*/10 * * * *',
  $$SELECT public.scan_stuck_group_buy_paid_drafts(15)$$
);