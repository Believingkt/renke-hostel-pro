
CREATE OR REPLACE FUNCTION public.update_paid_order_discount_v2(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_reason text, p_mode text, p_discount_amount integer DEFAULT NULL::integer, p_discount_code text DEFAULT NULL::text, p_confirmed boolean DEFAULT false, p_settlement_handling text DEFAULT NULL::text, p_applied_discount_amount integer DEFAULT NULL::integer, p_risk_acknowledged boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
-- PHASE3A_V5_5A3 / V5.5C5 code_keep
DECLARE
  o public.orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_mode text := lower(btrim(COALESCE(p_mode, '')));
  v_code text := NULLIF(upper(btrim(COALESCE(p_discount_code, ''))), '');
  v_standard integer;
  v_new_discount integer;
  v_new_code text;
  v_new_final integer;
  v_room_fee integer;
  v_cap integer;
  v_template_ids uuid[];
  v_room_type_ids uuid[];
  v_template_id uuid;
  v_room_type_id uuid;
  v_valid record;
  v_rows int;
  v_audit_id uuid;
  v_after public.orders%ROWTYPE;
  v_old_discount integer;
  v_old_code text;
  v_old_final integer;
  v_settle text := lower(btrim(COALESCE(p_settlement_handling, '')));
  v_paid integer;
  v_diff integer;
  v_diff_note text;
  v_override boolean := false;
  v_risky boolean := false;
  v_risk_kind text := 'none';
  v_scope_mode text;
  v_dc_tpls jsonb;
  v_scope_ids uuid[];
  v_allow text[];
  v_hit int := 0;
  v_full_coverage boolean := false;
  v_keep boolean := false;
  v_mode_label text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order id is required' USING ERRCODE = '22023';
  END IF;
  IF v_mode NOT IN ('manual', 'none', 'code', 'code_override') THEN
    RAISE EXCEPTION 'invalid mode: %', p_mode USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 2 THEN
    RAISE EXCEPTION '請填寫修改原因' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_confirmed, false) IS NOT TRUE THEN
    RAISE EXCEPTION '尚未完成二次確認，未做任何修改' USING ERRCODE = '22023';
  END IF;
  IF v_settle NOT IN ('collected', 'refunded', 'offset', 'pending', 'data_only') THEN
    RAISE EXCEPTION '請選擇差額處理方式（已完成收款／已完成退款或返還／已完成折抵或其他處理／尚待處理／純資料校正）'
      USING ERRCODE = '22023';
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

  -- 僅適用已付清訂單
  IF lower(COALESCE(o.payment_status, '')) NOT IN ('paid', 'fully_paid') THEN
    RAISE EXCEPTION '此訂單付款狀態為 %，不適用「修改已結清折扣」，請使用一般訂單編輯',
      COALESCE(o.payment_status, '(空)') USING ERRCODE = '22023';
  END IF;

  -- 高風險：退款中／已退款欄位有值，或訂單已取消 → 確認制
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
    RAISE EXCEPTION '此訂單已退款／退款處理中或已取消，需完成高風險確認才能修改折扣（未做任何修改）'
      USING ERRCODE = '22023';
  END IF;

  v_old_discount := COALESCE(o.discount_amount, 0);
  v_old_code := NULLIF(upper(btrim(COALESCE(o.discount_code, ''))), '');
  v_old_final := COALESCE(o.final_price, 0);

  v_room_fee := GREATEST(
    0,
    COALESCE(o.total_price, 0)::integer
    - CASE WHEN abs(COALESCE(o.final_price, 0) - (COALESCE(o.total_price, 0) - COALESCE(o.discount_amount, 0))) <= 1
             THEN COALESCE(public.calc_order_addon_total(
                    o.pet_plan_price, o.meal_plan_total, o.custom_addon_details, o.notes), 0)::integer
             ELSE 0
      END
  );

  IF v_mode = 'none' THEN
    v_new_discount := 0;
    v_new_code := NULL;

  ELSIF v_mode = 'manual' THEN
    IF p_discount_amount IS NULL OR p_discount_amount < 0 THEN
      RAISE EXCEPTION '折扣金額不得為負數' USING ERRCODE = '22023';
    END IF;
    v_new_discount := p_discount_amount;
    v_new_code := NULL;

  ELSE -- code / code_override / code_keep
    IF v_code IS NULL THEN
      RAISE EXCEPTION '請輸入折扣碼' USING ERRCODE = '22023';
    END IF;

    -- V5.5C5：提交的折扣碼與「資料庫中此訂單目前的 discount_code」完全相同
    -- → 沿用原碼，不重新驗證存在性／啟用狀態／有效期限／適用範圍，只允許人工指定金額。
    -- 比對基準一律是 v_old_code（FOR UPDATE 讀出的資料庫值），前端無法偽造。
    IF v_old_code IS NOT NULL AND v_code = v_old_code THEN
      v_keep := true;
      v_new_code := v_old_code;
      v_new_discount := COALESCE(p_applied_discount_amount, v_old_discount);
      IF v_new_discount < 0 THEN
        RAISE EXCEPTION '實際套用折扣金額不得為負數' USING ERRCODE = '22023';
      END IF;
      -- 上限兩道檢查完全比照 code_override，不放寬
      v_cap := LEAST(v_room_fee, COALESCE(o.total_price, 0)::integer);
      IF v_new_discount > v_cap THEN
        RAISE EXCEPTION '實際套用折扣金額不得大於折扣基準（房費 NT$%）', v_cap USING ERRCODE = '22023';
      END IF;
      v_standard := NULL;   -- 未重新驗證，無標準折扣可比對
      v_override := true;

    ELSE
      SELECT array_agg(DISTINCT r.template_id) FILTER (WHERE r.template_id IS NOT NULL),
             array_agg(DISTINCT r.room_type_id) FILTER (WHERE r.room_type_id IS NOT NULL)
        INTO v_template_ids, v_room_type_ids
      FROM public.order_rooms r
      WHERE r.order_id = o.id;

      IF COALESCE(array_length(v_template_ids, 1), 0) > 1
         OR COALESCE(array_length(v_room_type_ids, 1), 0) > 1 THEN
        SELECT COALESCE(ai.discount_scope_mode, 'pricing_template') INTO v_scope_mode
        FROM public.accommodation_info ai WHERE ai.id = o.accommodation_id;

        IF v_scope_mode IS DISTINCT FROM 'pricing_template' THEN
          IF COALESCE(array_length(v_template_ids, 1), 0) > 1 THEN
            RAISE EXCEPTION '此訂單包含多個房價方案，無法自動判斷折扣碼適用範圍，請改填手動折扣金額' USING ERRCODE = '22023';
          END IF;
          RAISE EXCEPTION '此訂單包含多個房型，無法自動判斷折扣碼適用範圍，請改填手動折扣金額' USING ERRCODE = '22023';
        END IF;

        v_scope_ids := COALESCE(v_template_ids, '{}');

        IF cardinality(v_scope_ids) = 0 THEN
          IF COALESCE(array_length(v_template_ids, 1), 0) > 1 THEN
            RAISE EXCEPTION '此訂單包含多個房價方案，無法自動判斷折扣碼適用範圍，請改填手動折扣金額' USING ERRCODE = '22023';
          END IF;
          RAISE EXCEPTION '此訂單包含多個房型，無法自動判斷折扣碼適用範圍，請改填手動折扣金額' USING ERRCODE = '22023';
        END IF;

        SELECT dc.applicable_pricing_template_ids INTO v_dc_tpls
        FROM public.discount_codes dc
        WHERE dc.accommodation_id = o.accommodation_id AND upper(dc.code) = upper(v_code);

        v_allow := COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_dc_tpls, '[]'::jsonb))), '{}');
        SELECT count(*) INTO v_hit FROM unnest(v_scope_ids) x WHERE x::text = ANY (v_allow);

        IF v_hit = 0 THEN
          RAISE EXCEPTION '此折扣碼不適用於本訂單的任何房價方案，請確認是否用錯折扣碼，或改用手動折扣金額' USING ERRCODE = '22023';
        ELSIF v_hit < cardinality(v_scope_ids) THEN
          RAISE EXCEPTION '此折扣碼只適用於本訂單的部分房價方案，系統無法自動分攤，請改填手動折扣金額' USING ERRCODE = '22023';
        END IF;

        v_template_id := v_scope_ids[1];
        v_room_type_id := COALESCE(v_room_type_ids[1], o.room_type_id);
        v_full_coverage := true;
      END IF;

      IF NOT v_full_coverage THEN
        v_template_id := CASE WHEN COALESCE(array_length(v_template_ids, 1), 0) = 1 THEN v_template_ids[1] END;
        v_room_type_id := COALESCE(
          CASE WHEN COALESCE(array_length(v_room_type_ids, 1), 0) = 1 THEN v_room_type_ids[1] END,
          o.room_type_id
        );
      END IF;

      SELECT * INTO v_valid
      FROM public.validate_discount_code(
        v_code, o.accommodation_id, v_room_fee, v_room_type_id, o.check_in_date, v_template_id
      );

      IF NOT COALESCE(v_valid.is_valid, false) THEN
        RAISE EXCEPTION '折扣碼無效：%', COALESCE(v_valid.message, '請確認代碼或有效期限') USING ERRCODE = '22023';
      END IF;

      v_standard := CASE
        WHEN v_valid.discount_type = 'percentage'
          THEN round(v_room_fee * (v_valid.discount_value::numeric / 100))::integer
        ELSE v_valid.discount_value::integer
      END;
      v_new_code := v_code;

      IF v_mode = 'code' THEN
        v_new_discount := v_standard;
      ELSE
        IF p_applied_discount_amount IS NULL OR p_applied_discount_amount < 0 THEN
          RAISE EXCEPTION '實際套用折扣金額不得為空或負數' USING ERRCODE = '22023';
        END IF;
        -- 上限沿用正式折扣規則：折扣基準為房費，且不得大於訂單總額
        v_cap := LEAST(v_room_fee, COALESCE(o.total_price, 0)::integer);
        IF p_applied_discount_amount > v_cap THEN
          RAISE EXCEPTION '實際套用折扣金額不得大於折扣基準（房費 NT$%）', v_cap USING ERRCODE = '22023';
        END IF;
        v_new_discount := p_applied_discount_amount;
        v_override := (v_new_discount IS DISTINCT FROM v_standard);
      END IF;
    END IF;
  END IF;

  IF v_new_discount > COALESCE(o.total_price, 0) THEN
    RAISE EXCEPTION '折扣金額不得大於訂單總額' USING ERRCODE = '22023';
  END IF;

  v_mode_label := CASE WHEN v_keep THEN 'code_keep' ELSE v_mode END;
  v_new_final := COALESCE(o.final_price, 0) + (v_old_discount - v_new_discount);

  IF v_new_discount = v_old_discount
     AND v_new_code IS NOT DISTINCT FROM v_old_code
     AND v_new_final = v_old_final THEN
    RETURN jsonb_build_object(
      'changed', false, 'order_id', o.id,
      'discount_amount', v_old_discount, 'discount_code', v_old_code,
      'standard_discount_amount', v_standard, 'manual_override', v_override,
      'mode', v_mode_label, 'keep_existing_code', v_keep,
      'final_price', v_old_final, 'risk', v_risk_kind,
      'updated_at', o.updated_at, 'audit_log_id', NULL);
  END IF;

  v_paid := COALESCE(o.paid_amount, 0)::integer;
  v_diff := v_new_final - v_paid;
  v_diff_note := CASE
    WHEN v_diff > 0 THEN '目前應收金額比已付金額多 NT$' || v_diff::text || '。請確認差額是否已另外收取，或仍待處理。'
    WHEN v_diff < 0 THEN '目前已付金額比應收金額多 NT$' || abs(v_diff)::text || '。請確認差額是否已退款、折抵或另行處理。'
    ELSE '調整後應收與已付金額一致。'
  END;

  PERFORM set_config('app.paid_discount_rpc', 'on', true);
  PERFORM set_config('app.paid_discount_order', o.id::text, true);
  PERFORM set_config('app.paid_discount_reason', v_reason, true);
  PERFORM set_config('app.paid_discount_confirmed', 'on', true);
  PERFORM set_config('app.paid_discount_settlement', v_settle, true);

  -- V5.5C 批次四：標記變更來源／原因／操作者，供 zzz_order_change_log trigger 記錄
  PERFORM public.set_order_change_context(
    'paid_discount_edit',
    v_reason,
    '已結清折扣修改（' || v_mode_label || '／' || v_settle || '）',
    'user');

  UPDATE public.orders
     SET discount_amount = v_new_discount,
         discount_code = v_new_code,
         final_price = v_new_final,
         updated_at = now()
   WHERE id = o.id
     AND updated_at = p_expected_updated_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION '折扣更新失敗（影響 % 筆），可能是權限不足或資料已變更', v_rows USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (
    accommodation_id, user_id, user_email, action_type, action_category,
    entity_type, entity_id, entity_name, details
  ) VALUES (
    o.accommodation_id, v_uid, auth.jwt() ->> 'email',
    'update', 'order', 'order', o.id::text, o.order_number,
    jsonb_build_object(
      'type', 'paid_discount_edit',
      'source', '/admin 修改已結清折扣（v5.5A.3）',
      'reason', v_reason,
      'mode', v_mode_label,
      'keep_existing_code', v_keep,
      'confirmed', true,
      'settlement_handling', v_settle,
      'risk_state', v_risk_kind,
      'risk_acknowledged', COALESCE(p_risk_acknowledged, false),
      'payment_status', o.payment_status,
      'refund_status', o.refund_status,
      'order_status', o.order_status,
      'paid_amount', v_paid,
      'difference', v_diff,
      'difference_note', v_diff_note,
      'standard_discount_amount', v_standard,
      'applied_discount_amount', v_new_discount,
      'manual_override', v_override,
      'changes', CASE WHEN v_keep THEN jsonb_build_array(
          jsonb_build_object('field', 'discount_code', 'label', '折扣碼',
                             'before', v_old_code, 'after', v_new_code,
                             'note', '沿用訂單原折扣碼，未重新驗證'),
          jsonb_build_object('field', 'discount_amount', 'label', '實際套用折扣（人工指定）',
                             'before', v_old_discount, 'after', v_new_discount),
          jsonb_build_object('field', 'final_price', 'label', '應收金額',
                             'before', v_old_final, 'after', v_new_final)
        ) ELSE jsonb_build_array(
          jsonb_build_object('field', 'discount_code', 'label', '折扣碼',
                             'before', v_old_code, 'after', v_new_code),
          jsonb_build_object('field', 'standard_discount_amount', 'label', '系統計算標準折扣',
                             'before', NULL, 'after', v_standard),
          jsonb_build_object('field', 'discount_amount', 'label', '實際套用折扣',
                             'before', v_old_discount, 'after', v_new_discount),
          jsonb_build_object('field', 'final_price', 'label', '應收金額',
                             'before', v_old_final, 'after', v_new_final)
        ) END
    )
  )
  RETURNING id INTO v_audit_id;

  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION '變更紀錄寫入失敗，已取消本次折扣修改' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_after FROM public.orders WHERE id = o.id;
  IF v_after.discount_amount IS DISTINCT FROM v_new_discount
     OR NULLIF(upper(btrim(COALESCE(v_after.discount_code, ''))), '') IS DISTINCT FROM v_new_code
     OR v_after.final_price IS DISTINCT FROM v_new_final THEN
    RAISE EXCEPTION '折扣更新未落地，已回滾' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE id = v_audit_id) THEN
    RAISE EXCEPTION '變更紀錄未落地，已回滾' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.paid_discount_rpc', 'off', true);
  PERFORM set_config('app.paid_discount_order', '', true);
  PERFORM set_config('app.paid_discount_reason', '', true);
  PERFORM set_config('app.paid_discount_confirmed', 'off', true);
  PERFORM set_config('app.paid_discount_settlement', '', true);

  RETURN jsonb_build_object(
    'changed', true, 'order_id', o.id,
    'discount_amount', v_after.discount_amount,
    'discount_code', v_after.discount_code,
    'standard_discount_amount', v_standard,
    'applied_discount_amount', v_new_discount,
    'manual_override', v_override,
    'mode', v_mode_label,
    'keep_existing_code', v_keep,
    'final_price', v_after.final_price,
    'paid_amount', v_after.paid_amount,
    'difference', v_diff,
    'difference_note', v_diff_note,
    'settlement_handling', v_settle,
    'risk', v_risk_kind,
    'updated_at', v_after.updated_at,
    'audit_log_id', v_audit_id);
END;
$function$;

DO $$
DECLARE v_bad text;
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE proname='update_paid_order_discount_v2') THEN
    RAISE EXCEPTION 'postcheck failed: must remain SECURITY INVOKER';
  END IF;
  SELECT string_agg(x,',') INTO v_bad FROM (
    SELECT unnest(ARRAY['public','anon']) x
  ) t WHERE has_function_privilege(t.x, 'public.update_paid_order_discount_v2(uuid,timestamptz,text,text,integer,text,boolean,text,integer,boolean)', 'EXECUTE') IS NULL;
  RAISE NOTICE 'postcheck ok %', COALESCE(v_bad,'-');
END $$;
