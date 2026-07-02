CREATE OR REPLACE FUNCTION public.change_order_dates(
  _order_id uuid,
  _new_check_in date,
  _new_check_out date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_room record;
BEGIN
  IF _new_check_in IS NULL OR _new_check_out IS NULL THEN
    RAISE EXCEPTION '入住/退房日期不可為空' USING ERRCODE = 'P0001';
  END IF;
  IF _new_check_out <= _new_check_in THEN
    RAISE EXCEPTION '退房日期必須晚於入住日期' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, accommodation_id, check_in_date, check_out_date, order_status,
         order_source, payment_status, order_number
    INTO v_order
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION '訂單不存在' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.order_status = 'cancelled' THEN
    RAISE EXCEPTION '已取消的訂單無法改期' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.check_in_date = _new_check_in AND v_order.check_out_date = _new_check_out THEN
    RAISE EXCEPTION '新舊日期相同，不需改期' USING ERRCODE = 'P0001';
  END IF;

  -- 先更新訂單日期，讓 order_rooms trigger 讀到新日期
  UPDATE public.orders
     SET check_in_date = _new_check_in,
         check_out_date = _new_check_out,
         updated_at = now()
   WHERE id = _order_id;

  -- 重新觸發 validate_order_rooms_inventory；任一房間驗證失敗即回滾。
  -- order_rooms 沒有 updated_at 欄位，因此只做 no-op quantity update 來觸發驗證。
  FOR v_room IN SELECT id FROM public.order_rooms WHERE order_id = _order_id LOOP
    UPDATE public.order_rooms
       SET quantity = quantity
     WHERE id = v_room.id;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', _order_id,
    'order_number', v_order.order_number,
    'accommodation_id', v_order.accommodation_id,
    'order_source', v_order.order_source,
    'old_check_in', v_order.check_in_date,
    'old_check_out', v_order.check_out_date,
    'new_check_in', _new_check_in,
    'new_check_out', _new_check_out
  );
END;
$$;

REVOKE ALL ON FUNCTION public.change_order_dates(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_order_dates(uuid, date, date) TO authenticated, service_role;