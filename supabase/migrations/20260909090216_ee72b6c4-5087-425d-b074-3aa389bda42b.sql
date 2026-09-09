DO $$
DECLARE v_paid numeric; v_final numeric; v_id uuid;
BEGIN
  SELECT id, paid_amount, final_price INTO v_id, v_paid, v_final
  FROM public.orders WHERE order_number = 'FM2N96G9';

  IF v_id IS NULL THEN RAISE EXCEPTION 'FM2N96G9 not found'; END IF;
  IF v_paid <> 17000 OR v_final <> 57600 THEN
    RAISE EXCEPTION 'precheck failed: paid=% final=%', v_paid, v_final;
  END IF;

  UPDATE public.orders
  SET paid_amount = 57600,
      notes = COALESCE(notes, '') || E'\n' ||
        '🔒[金額異動 ' || to_char(now() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI') ||
        ' by system/V5.5C.1 訂正] 已付 17000→57600（付款狀態已為已付清，補正已付金額）'
  WHERE id = v_id;
END $$;