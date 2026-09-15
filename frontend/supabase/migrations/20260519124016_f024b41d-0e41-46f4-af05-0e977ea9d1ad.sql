
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

    -- total_price / discount: locked only when fully paid
    IF OLD.payment_status IN ('fully_paid', 'paid') THEN
      IF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
        RAISE EXCEPTION 'total_price cannot be changed after payment';
      END IF;
      IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount AND NOT can_unlock_discount THEN
        RAISE EXCEPTION 'discount_amount cannot be changed after payment';
      END IF;
    END IF;

    -- deposit_amount: 永遠可修改（由前端編輯流程自動追加 🔒 金額異動記錄保留稽核）
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
