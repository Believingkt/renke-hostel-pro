CREATE OR REPLACE FUNCTION public.orders_website_inventory_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_qty   integer := GREATEST(COALESCE(NEW.room_quantity, 1), 1);
  v_dates text[];
  v_bad   record;
  v_is_staff boolean := false;
  v_is_group_buy_manual boolean := false;
BEGIN
  -- 團購匯款／ATM 建單（payment_provider = 'manual'）：先建單後付款，無 payment draft 保留，
  -- 需與官網同一把鎖做交易內庫存複驗。信用卡團購走 convert_group_buy_payment_draft（已有鎖與複驗），不進本閘門。
  v_is_group_buy_manual := (NEW.order_source = 'group_buy' AND COALESCE(NEW.payment_provider, '') = 'manual');

  IF NEW.order_source IS NULL
     OR NOT (NEW.order_source = 'website' OR NEW.order_source LIKE 'points\_%' OR v_is_group_buy_manual)
  THEN
    RETURN NEW;
  END IF;

  -- 無房型（純行程單）／無日期／取消單不進閘門
  IF NEW.accommodation_id IS NULL
     OR NEW.room_type_id IS NULL
     OR NEW.check_in_date IS NULL
     OR NEW.check_out_date IS NULL
     OR NEW.check_out_date <= NEW.check_in_date
     OR COALESCE(NEW.order_status, '') = 'cancelled'
  THEN
    RETURN NEW;
  END IF;

  -- 後台 / PMS 人工建單保留既有 override 能力（即使來源被選為 website）
  IF auth.uid() IS NOT NULL THEN
    v_is_staff := public.is_admin_or_super()
      OR public.is_hotel_admin_of(NEW.accommodation_id)
      OR EXISTS (
        SELECT 1 FROM public.current_user_accommodation_ids() a(id)
        WHERE a.id = NEW.accommodation_id
      );
    IF v_is_staff THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT array_agg(to_char(d, 'YYYY-MM-DD') ORDER BY d)
    INTO v_dates
  FROM generate_series(NEW.check_in_date, NEW.check_out_date - 1, interval '1 day') AS d;

  IF COALESCE(array_length(v_dates, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- 與團購 acquire_group_buy_payment_hold / convert_group_buy_payment_draft 使用完全相同的 lock key
  PERFORM pg_advisory_xact_lock(hashtext('gb_hold:' || NEW.accommodation_id::text));

  SELECT r.date_value, r.available_rooms, r.is_blocked, r.blocked_by_room_name
    INTO v_bad
  FROM public.get_adjusted_room_inventory_batch(
         NEW.room_type_id, v_dates, NEW.accommodation_id, NULL
       ) r
  WHERE r.is_blocked OR r.available_rooms < v_qty
  ORDER BY r.date_value
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'inventory_unavailable: % 已無可訂房位（需要 % 間，可訂 % 間%）',
      v_bad.date_value,
      v_qty,
      CASE WHEN v_bad.is_blocked THEN 0 ELSE v_bad.available_rooms END,
      COALESCE('，封鎖來源：' || v_bad.blocked_by_room_name, '')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;