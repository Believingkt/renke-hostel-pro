CREATE OR REPLACE FUNCTION public.seed_app_review_account(p_user_id uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member_id uuid;
  v_acc_id uuid := '5f764d55-ae11-4631-80fe-2e611853deae'; -- 森山寫照
  v_note text := '【測試資料｜App Review｜請勿計入營收】';
  v_o1 uuid;
  v_o2 uuid;
BEGIN
  -- 種子資料期間關閉 trigger，避免產生通知/OTA 推送/分潤等副作用
  PERFORM set_config('session_replication_role', 'replica', true);

  INSERT INTO public.platform_members (user_id, name, email, phone)
  VALUES (p_user_id, 'App Review 測試帳號', p_email, '0900000000')
  ON CONFLICT (user_id) DO UPDATE
    SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = now()
  RETURNING id INTO v_member_id;

  IF v_member_id IS NULL THEN
    SELECT id INTO v_member_id FROM public.platform_members WHERE user_id = p_user_id;
  END IF;

  -- 點數 500
  INSERT INTO public.member_points (member_id, balance, lifetime_earned, lifetime_used)
  VALUES (v_member_id, 500, 500, 0)
  ON CONFLICT (member_id) DO UPDATE
    SET balance = 500, lifetime_earned = GREATEST(public.member_points.lifetime_earned, 500), updated_at = now();

  IF NOT EXISTS (
    SELECT 1 FROM public.member_point_transactions
    WHERE member_id = v_member_id AND description = v_note || ' 點數發放'
  ) THEN
    INSERT INTO public.member_point_transactions (member_id, type, amount, balance_after, description)
    VALUES (v_member_id, 'admin_adjust', 500, 500, v_note || ' 點數發放');
  END IF;

  -- 訂單 1：即將入住（room_type_id 留空，確保不佔用任何真實庫存）
  INSERT INTO public.orders (
    order_number, accommodation_id, member_id, room_type_id,
    check_in_date, check_out_date, guest_count, adult_count,
    guest_name, guest_phone, guest_email,
    order_status, payment_status, order_source,
    total_price, final_price, paid_amount, notes, order_date
  ) VALUES (
    'APLREVWA', v_acc_id, v_member_id, NULL,
    CURRENT_DATE + 14, CURRENT_DATE + 16, 2, 2,
    'App Review 測試', '0900000000', p_email,
    'confirmed', 'paid', 'official_use',
    6800, 6800, 6800, v_note, CURRENT_DATE
  )
  ON CONFLICT (order_number) DO UPDATE
    SET member_id = EXCLUDED.member_id,
        check_in_date = EXCLUDED.check_in_date,
        check_out_date = EXCLUDED.check_out_date,
        order_status = EXCLUDED.order_status,
        payment_status = EXCLUDED.payment_status,
        notes = EXCLUDED.notes
  RETURNING id INTO v_o1;

  -- 訂單 2：已完成（過去日期）
  INSERT INTO public.orders (
    order_number, accommodation_id, member_id, room_type_id,
    check_in_date, check_out_date, guest_count, adult_count,
    guest_name, guest_phone, guest_email,
    order_status, payment_status, order_source,
    total_price, final_price, paid_amount, notes, order_date
  ) VALUES (
    'APLREVWB', v_acc_id, v_member_id, NULL,
    CURRENT_DATE - 30, CURRENT_DATE - 28, 2, 2,
    'App Review 測試', '0900000000', p_email,
    'confirmed', 'paid', 'official_use',
    5600, 5600, 5600, v_note, CURRENT_DATE - 45
  )
  ON CONFLICT (order_number) DO UPDATE
    SET member_id = EXCLUDED.member_id,
        check_in_date = EXCLUDED.check_in_date,
        check_out_date = EXCLUDED.check_out_date,
        order_status = EXCLUDED.order_status,
        payment_status = EXCLUDED.payment_status,
        notes = EXCLUDED.notes
  RETURNING id INTO v_o2;

  PERFORM set_config('session_replication_role', 'origin', true);

  RETURN jsonb_build_object(
    'member_id', v_member_id,
    'points_balance', 500,
    'upcoming_order', 'APLREVWA',
    'past_order', 'APLREVWB'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_app_review_account(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_app_review_account(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.seed_app_review_account(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_app_review_account(uuid, text) TO service_role;