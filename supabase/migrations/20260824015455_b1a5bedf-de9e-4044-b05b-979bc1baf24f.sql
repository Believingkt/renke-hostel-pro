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
BEGIN
  -- 僅保護「正式官網 / 公開外部訂房 API」建單來源
  IF NEW.order_source IS NULL
     OR NOT (NEW.order_source = 'website' OR NEW.order_source LIKE 'points\_%')
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

  -- 與團購 acquire_group_buy_payment_hold 使用完全相同的 lock key
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

DROP TRIGGER IF EXISTS trg_orders_website_inventory_gate ON public.orders;
CREATE TRIGGER trg_orders_website_inventory_gate
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.orders_website_inventory_gate();