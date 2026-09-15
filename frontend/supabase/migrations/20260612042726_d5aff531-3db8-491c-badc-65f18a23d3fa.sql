
-- 1. validate_order_insert
CREATE OR REPLACE FUNCTION public.validate_order_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_info
    WHERE id = NEW.accommodation_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid accommodation_id';
  END IF;

  IF NEW.room_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_types
    WHERE id = NEW.room_type_id AND accommodation_id = NEW.accommodation_id
  ) THEN
    RAISE EXCEPTION 'Invalid room_type_id';
  END IF;

  IF NEW.guest_name IS NULL OR NEW.guest_name = '' THEN
    RAISE EXCEPTION 'Guest name is required';
  END IF;

  IF NEW.guest_phone IS NULL OR NEW.guest_phone = '' THEN
    RAISE EXCEPTION 'Guest phone is required';
  END IF;

  IF NEW.check_out_date <= NEW.check_in_date THEN
    RAISE EXCEPTION 'Check-out date must be after check-in date';
  END IF;

  IF NEW.total_price < 0 OR NEW.final_price < 0 THEN
    RAISE EXCEPTION 'Price cannot be negative';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. validate_order_deposit_on_insert
CREATE OR REPLACE FUNCTION public.validate_order_deposit_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  half_final NUMERIC;
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.deposit_amount, 0) > 0 THEN
    half_final := FLOOR(COALESCE(NEW.final_price, 0) / 2);

    IF NEW.deposit_amount > half_final THEN
      RAISE EXCEPTION '訂金金額 (%) 必須小於或等於尾款（上限 %）', NEW.deposit_amount, half_final
        USING ERRCODE = 'check_violation';
    END IF;

    IF COALESCE(NEW.balance_payment_method, NEW.payment_method, '') <> 'bank_transfer'
       AND NEW.payment_status = 'deposit_paid' THEN
      RAISE EXCEPTION '只有「匯款」付款方式可使用訂金 / 尾款拆分'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.payment_status = 'paid' THEN
    NEW.deposit_amount := 0;
    IF COALESCE(NEW.paid_amount, 0) < COALESCE(NEW.final_price, 0) THEN
      NEW.paid_amount := NEW.final_price;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. sync_order_payment_fields
CREATE OR REPLACE FUNCTION public.sync_order_payment_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  canonical_method text;
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS NOT NULL AND NEW.payment_status NOT IN (
    'unpaid','paid','deposit_paid','refunded','partial_refunded','pending_payment'
  ) THEN
    RAISE EXCEPTION 'Invalid payment_status: %', NEW.payment_status;
  END IF;

  canonical_method := COALESCE(
    NULLIF(NEW.payment_method, ''),
    NULLIF(NEW.balance_payment_method, ''),
    NULLIF(NEW.deposit_payment_method, '')
  );

  IF canonical_method IS NOT NULL THEN
    NEW.payment_method := canonical_method;
    NEW.balance_payment_method := canonical_method;
    NEW.deposit_payment_method := canonical_method;
  END IF;

  IF NEW.payment_status = 'paid' AND (NEW.deposit_status IS NULL OR NEW.deposit_status = 'unpaid') THEN
    NEW.deposit_status := 'paid';
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. prevent_immutable_order_fields_change
CREATE OR REPLACE FUNCTION public.prevent_immutable_order_fields_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_super_admin_user boolean := false;
  can_unlock_discount boolean := false;
  old_line text;
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

    IF OLD.payment_status IN ('fully_paid', 'paid') THEN
      IF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
        RAISE EXCEPTION 'total_price cannot be changed after payment';
      END IF;
      IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount AND NOT can_unlock_discount THEN
        RAISE EXCEPTION 'discount_amount cannot be changed after payment';
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

-- 5. 移除重複的 trigger
DROP TRIGGER IF EXISTS trigger_create_commission_on_order_insert ON public.orders;
