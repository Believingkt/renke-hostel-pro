-- 只補記推薦碼（不改金額）：update_order_referral_code_v1
-- 只改 orders.discount_code；任何金額／加購／付款欄位變動都會整筆回滾。
-- 適用 deposit_paid／paid／fully_paid；權限比照 update_paid_order_discount_v2（同館「訂單」模組 editable）。
-- 不修改任何既有函式或觸發器；佣金由既有 create_commission_record 觸發器依 discount_code 變動處理。
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $pre$
BEGIN
  IF to_regprocedure('public.update_order_referral_code_v1(uuid, timestamp with time zone, text, text, boolean, boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_order_referral_code_v1 已存在（是否重複套用？）';
  END IF;
  IF to_regprocedure('public.evaluate_discount_code(text, uuid, integer, uuid, date, uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：evaluate_discount_code 不存在（需先套用 20261028090000）';
  END IF;
  IF to_regprocedure('public.set_order_change_context(text, text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：set_order_change_context 不存在';
  END IF;
  IF to_regprocedure('public.get_staff_module_permission(uuid, uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：get_staff_module_permission 不存在';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_immutable_order_fields' AND tgrelid = 'public.orders'::regclass) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到 trg_prevent_immutable_order_fields';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'pricing_template_id') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：orders.pricing_template_id 不存在';
  END IF;
END
$pre$;

CREATE FUNCTION public.update_order_referral_code_v1(
  p_order_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_reason text,
  p_discount_code text,
  p_confirmed boolean,
  p_risk_acknowledged boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
-- REFERRAL_CODE_ONLY_V1
DECLARE
  c_money_keys CONSTANT text[] := ARRAY[
    'total_price', 'discount_amount', 'final_price', 'paid_amount', 'deposit_amount',
    'booking_deposit_amount', 'booking_deposit_percentage', 'deposit_required_amount',
    'deposit_charged_amount', 'deposit_refunded_amount', 'refunded_amount', 'refund_fee_amount',
    'cancellation_fee_amount', 'pet_plan_price', 'meal_plan_total', 'meal_plan_details',
    'custom_addon_details', 'notes', 'payment_status', 'deposit_status', 'order_status'];
  o public.orders%ROWTYPE;
  v_after public.orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_new_code text := NULLIF(upper(btrim(COALESCE(p_discount_code, ''))), '');
  v_old_code text;
  v_action text;
  v_eval record;
  v_eval_status text;
  v_room_fee integer;
  v_risky boolean := false;
  v_risk_kind text := 'none';
  v_rows int;
  v_audit_id uuid;
  v_before_money jsonb;
  v_after_money jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order id is required' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 2 THEN
    RAISE EXCEPTION '請填寫修改原因' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_confirmed, false) IS NOT TRUE THEN
    RAISE EXCEPTION '尚未完成二次確認，未做任何修改' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(public.get_staff_module_permission(v_uid, o.accommodation_id, 'orders'), 'hidden') <> 'editable' THEN
    RAISE EXCEPTION '權限不足：您對此館別的「訂單」模組沒有編輯權限' USING ERRCODE = '42501';
  END IF;

  IF p_expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '訂單已被其他人修改，請重新整理後再試' USING ERRCODE = '40001';
  END IF;

  IF lower(COALESCE(o.payment_status, '')) NOT IN ('deposit_paid', 'paid', 'fully_paid') THEN
    RAISE EXCEPTION '此訂單付款狀態為 %，不適用「只補記推薦碼」，請使用一般訂單編輯',
      COALESCE(o.payment_status, '(空)') USING ERRCODE = '22023';
  END IF;

  -- 高風險判定比照 update_paid_order_discount_v2
  IF COALESCE(lower(o.refund_status), 'none') IN ('pending', 'pending_manual', 'processing', 'refunding', 'refunded')
     OR COALESCE(o.refunded_amount, 0) > 0
     OR o.refunded_at IS NOT NULL THEN
    v_risky := true; v_risk_kind := 'refund';
  END IF;
  IF lower(COALESCE(o.order_status, '')) = 'cancelled' THEN
    v_risky := true;
    v_risk_kind := CASE WHEN v_risk_kind = 'refund' THEN 'refund_and_cancelled' ELSE 'cancelled' END;
  END IF;
  IF v_risky AND COALESCE(p_risk_acknowledged, false) IS NOT TRUE THEN
    RAISE EXCEPTION '此訂單已退款／退款處理中或已取消，需完成高風險確認才能修改推薦碼（未做任何修改）'
      USING ERRCODE = '22023';
  END IF;

  v_old_code := NULLIF(upper(btrim(COALESCE(o.discount_code, ''))), '');

  IF v_new_code IS NOT DISTINCT FROM v_old_code THEN
    RETURN jsonb_build_object(
      'changed', false, 'order_id', o.id, 'action', 'none',
      'discount_code', v_old_code, 'previous_discount_code', v_old_code,
      'discount_amount', o.discount_amount, 'final_price', o.final_price, 'paid_amount', o.paid_amount,
      'settlement_handling', 'data_only', 'risk', v_risk_kind,
      'updated_at', o.updated_at, 'audit_log_id', NULL);
  END IF;

  v_action := CASE WHEN v_old_code IS NULL THEN 'add' WHEN v_new_code IS NULL THEN 'remove' ELSE 'replace' END;

  IF v_new_code IS NOT NULL THEN
    IF lower(COALESCE(o.order_status, '')) = 'cancelled' THEN
      RAISE EXCEPTION '已取消的訂單不可補記或替換推薦碼（可移除）' USING ERRCODE = '22023';
    END IF;
    v_room_fee := GREATEST(
      0,
      COALESCE(o.total_price, 0)::integer
      - CASE WHEN abs(COALESCE(o.final_price, 0) - (COALESCE(o.total_price, 0) - COALESCE(o.discount_amount, 0))) <= 1
               THEN COALESCE(public.calc_order_addon_total(
                      o.pet_plan_price, o.meal_plan_total, o.custom_addon_details, o.notes), 0)::integer
               ELSE 0
        END
    );
    SELECT * INTO v_eval FROM public.evaluate_discount_code(
      v_new_code, o.accommodation_id, v_room_fee, o.room_type_id, o.check_in_date, o.pricing_template_id);
    v_eval_status := v_eval.status;
    IF v_eval_status IS NULL OR v_eval_status NOT IN ('applied', 'not_applicable') THEN
      RAISE EXCEPTION '折扣碼無效' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_old_code IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.commission_records cr WHERE cr.order_id = o.id AND cr.settlement_status = 'paid'
  ) THEN
    RAISE EXCEPTION '此訂單的推薦碼佣金已撥付，不可替換或移除推薦碼' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_object_agg(k, to_jsonb(o) -> k) INTO v_before_money FROM unnest(c_money_keys) k;

  -- 已結清訂單的折扣欄位只能經由專用 RPC 變更（trg_prevent_immutable_order_fields 窄路徑 A）
  PERFORM set_config('app.paid_discount_rpc', 'on', true);
  PERFORM set_config('app.paid_discount_order', o.id::text, true);
  PERFORM set_config('app.paid_discount_reason', v_reason, true);
  PERFORM set_config('app.paid_discount_confirmed', 'on', true);
  PERFORM set_config('app.paid_discount_settlement', 'data_only', true);

  PERFORM public.set_order_change_context(
    'referral_code_edit',
    v_reason,
    '只補記推薦碼（不改金額／' || v_action || '）',
    'user');

  UPDATE public.orders
     SET discount_code = v_new_code,
         updated_at = now()
   WHERE id = o.id
     AND updated_at = p_expected_updated_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION '推薦碼更新失敗（影響 % 筆），可能是權限不足或資料已變更', v_rows USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_after FROM public.orders WHERE id = o.id;
  SELECT jsonb_object_agg(k, to_jsonb(v_after) -> k) INTO v_after_money FROM unnest(c_money_keys) k;
  IF v_after_money IS DISTINCT FROM v_before_money THEN
    RAISE EXCEPTION '只補記推薦碼模式不得變更任何金額欄位，已回滾' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(upper(btrim(COALESCE(v_after.discount_code, ''))), '') IS DISTINCT FROM v_new_code THEN
    RAISE EXCEPTION '推薦碼更新未落地，已回滾' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (
    accommodation_id, user_id, user_email, action_type, action_category,
    entity_type, entity_id, entity_name, details
  ) VALUES (
    o.accommodation_id, v_uid, auth.jwt() ->> 'email',
    'update', 'order', 'order', o.id::text, o.order_number,
    jsonb_build_object(
      'type', 'referral_code_edit',
      'source', '/admin 只補記推薦碼（不改金額）',
      'reason', v_reason,
      'action', v_action,
      'mode', 'referral_only',
      'confirmed', true,
      'settlement_handling', 'data_only',
      'evaluation_status', v_eval_status,
      'risk_state', v_risk_kind,
      'risk_acknowledged', COALESCE(p_risk_acknowledged, false),
      'payment_status', o.payment_status,
      'order_status', o.order_status,
      'previous_discount_code', v_old_code,
      'new_discount_code', v_new_code,
      'discount_amount', o.discount_amount,
      'final_price', o.final_price,
      'paid_amount', o.paid_amount,
      'changes', jsonb_build_array(
        jsonb_build_object('field', 'discount_code', 'label', '推薦碼', 'before', v_old_code, 'after', v_new_code))
    )
  )
  RETURNING id INTO v_audit_id;
  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION '變更紀錄寫入失敗，已取消本次修改' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.paid_discount_rpc', 'off', true);
  PERFORM set_config('app.paid_discount_order', '', true);
  PERFORM set_config('app.paid_discount_reason', '', true);
  PERFORM set_config('app.paid_discount_confirmed', 'off', true);
  PERFORM set_config('app.paid_discount_settlement', '', true);

  RETURN jsonb_build_object(
    'changed', true, 'order_id', o.id, 'action', v_action,
    'discount_code', v_new_code, 'previous_discount_code', v_old_code,
    'evaluation_status', v_eval_status,
    'discount_amount', v_after.discount_amount, 'final_price', v_after.final_price,
    'paid_amount', v_after.paid_amount, 'settlement_handling', 'data_only',
    'risk', v_risk_kind, 'updated_at', v_after.updated_at, 'audit_log_id', v_audit_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_referral_code_v1(uuid, timestamp with time zone, text, text, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_order_referral_code_v1(uuid, timestamp with time zone, text, text, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_order_referral_code_v1(uuid, timestamp with time zone, text, text, boolean, boolean) TO authenticated, service_role;

COMMIT;
