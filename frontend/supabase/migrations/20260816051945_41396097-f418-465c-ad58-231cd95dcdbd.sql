CREATE OR REPLACE FUNCTION public.calc_order_addon_total(
  _pet_plan_price numeric,
  _meal_plan_total numeric,
  _custom_addon_details jsonb,
  _notes text
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  pet_from_custom numeric := 0;
  meal_from_custom numeric := 0;
  other_custom numeric := 0;
  pet_total numeric := 0;
  meal_total numeric := 0;
  extra numeric := 0;
  m text[];
BEGIN
  IF _custom_addon_details IS NOT NULL AND jsonb_typeof(_custom_addon_details) = 'array' THEN
    SELECT
      COALESCE(SUM(CASE WHEN d->>'addon_type' = 'pet' THEN COALESCE((d->>'total')::numeric, 0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN d->>'addon_type' = 'meal' THEN COALESCE((d->>'total')::numeric, 0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN COALESCE(d->>'addon_type', '') NOT IN ('pet', 'meal', 'bbq') THEN COALESCE((d->>'total')::numeric, 0) ELSE 0 END), 0)
    INTO pet_from_custom, meal_from_custom, other_custom
    FROM jsonb_array_elements(_custom_addon_details) AS d;
  END IF;

  pet_total := CASE WHEN COALESCE(_pet_plan_price, 0) > 0 THEN _pet_plan_price ELSE pet_from_custom END;
  meal_total := CASE WHEN COALESCE(_meal_plan_total, 0) > 0 THEN _meal_plan_total ELSE meal_from_custom END;

  IF _notes IS NOT NULL THEN
    m := regexp_match(_notes, '【額外現場加購金額[^】]*】\s*(\d+)\s*【額外現場加購金額END】');
    IF m IS NOT NULL THEN
      extra := COALESCE(m[1]::numeric, 0);
    END IF;
  END IF;

  RETURN COALESCE(pet_total, 0) + COALESCE(meal_total, 0) + COALESCE(other_custom, 0) + COALESCE(extra, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_immutable_order_fields_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_super_admin_user boolean := false;
  can_unlock_discount boolean := false;
  is_hotelnabe boolean := false;
  old_line text;
  old_room_fee numeric;
  new_room_fee numeric;
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'::app_role
    ) INTO is_super_admin_user;

    SELECT public.can_unlock_paid_order_discount(auth.uid(), NEW.accommodation_id)
      INTO can_unlock_discount;
  END IF;

  is_hotelnabe := COALESCE(OLD.order_source, '') = 'hotelnabe'
                  OR COALESCE(NEW.order_source, '') = 'hotelnabe';

  IF NOT is_super_admin_user THEN
    IF NEW.order_number IS DISTINCT FROM OLD.order_number THEN
      RAISE EXCEPTION 'order_number is immutable and cannot be changed';
    END IF;

    IF NEW.accommodation_id IS DISTINCT FROM OLD.accommodation_id THEN
      RAISE EXCEPTION 'accommodation_id is immutable and cannot be changed';
    END IF;

    IF OLD.idempotency_key IS NOT NULL
       AND NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'idempotency_key cannot be changed once set';
    END IF;

    IF OLD.payment_status IN ('fully_paid', 'paid') AND NOT is_hotelnabe THEN
      IF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
        -- total_price 內含加購金額；只要「房費部分」未變，允許因加購調整而變動
        old_room_fee := COALESCE(OLD.total_price, 0) - public.calc_order_addon_total(
          OLD.pet_plan_price, OLD.meal_plan_total, OLD.custom_addon_details, OLD.notes);
        new_room_fee := COALESCE(NEW.total_price, 0) - public.calc_order_addon_total(
          NEW.pet_plan_price, NEW.meal_plan_total, NEW.custom_addon_details, NEW.notes);
        IF old_room_fee IS DISTINCT FROM new_room_fee THEN
          RAISE EXCEPTION 'total_price cannot be changed after payment';
        END IF;
      END IF;
      IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount AND NOT can_unlock_discount THEN
        RAISE EXCEPTION 'discount_amount cannot be changed after payment';
      END IF;
      IF COALESCE(NEW.discount_code, '') IS DISTINCT FROM COALESCE(OLD.discount_code, '') AND NOT can_unlock_discount THEN
        RAISE EXCEPTION 'discount_code cannot be changed after payment';
      END IF;
    END IF;
  END IF;

  IF OLD.notes IS NOT NULL THEN
    FOR old_line IN
      SELECT line FROM regexp_split_to_table(OLD.notes, E'\n') AS line
      WHERE line LIKE '🔒[金額異動%'
    LOOP
      IF NEW.notes IS NULL OR position(old_line IN NEW.notes) = 0 THEN
        RAISE EXCEPTION '已鎖定的金額異動記錄不可刪除或修改：%', old_line;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;