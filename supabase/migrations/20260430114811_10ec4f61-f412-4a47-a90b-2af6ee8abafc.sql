
-- 1) Settled-amount-change notification: only for fully paid orders
CREATE OR REPLACE FUNCTION public.create_order_update_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status_map jsonb := jsonb_build_object(
    'pending', '待確認',
    'confirmed', '已確認',
    'cancelled', '已取消'
  );
  v_old_label text;
  v_new_label text;
  v_was_settled boolean;
  v_parts text[] := ARRAY[]::text[];
BEGIN
  IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    v_old_label := COALESCE(v_status_map->>OLD.order_status, OLD.order_status);
    v_new_label := COALESCE(v_status_map->>NEW.order_status, NEW.order_status);
    INSERT INTO public.notifications (accommodation_id, title, description, type, order_id)
    VALUES (NEW.accommodation_id, '📋 訂單狀態更新',
      '訂單編號：' || NEW.order_number || E'\n狀態：' || v_old_label || ' → ' || v_new_label,
      'status_update', NEW.id)
    ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO UPDATE
      SET description = EXCLUDED.description, is_read = false, created_at = now();
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NEW.payment_status IN ('paid', 'fully_paid', 'deposit_paid') THEN
    INSERT INTO public.notifications (accommodation_id, title, description, type, order_id)
    VALUES (NEW.accommodation_id, '💰 付款完成',
      '訂單編號：' || NEW.order_number ||
      E'\n已收到款項：$' || to_char(COALESCE(NEW.paid_amount, 0), 'FM999,999,999'),
      'payment', NEW.id)
    ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO UPDATE
      SET description = EXCLUDED.description, is_read = false, created_at = now();
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NEW.payment_status IN ('refunded', 'partial_refunded') THEN
    INSERT INTO public.notifications (accommodation_id, title, description, type, order_id)
    VALUES (NEW.accommodation_id,
      CASE WHEN NEW.payment_status = 'refunded' THEN '💸 訂單已退款' ELSE '💸 訂單部分退款' END,
      '訂單編號：' || NEW.order_number ||
      E'\n剩餘已付金額：$' || to_char(COALESCE(NEW.paid_amount, 0), 'FM999,999,999'),
      'refund', NEW.id)
    ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO UPDATE
      SET title = EXCLUDED.title, description = EXCLUDED.description, is_read = false, created_at = now();
  END IF;

  -- Settled amount change: ONLY when order was already fully paid
  v_was_settled := OLD.payment_status IN ('paid', 'fully_paid');
  IF v_was_settled THEN
    IF COALESCE(NEW.total_price,0) IS DISTINCT FROM COALESCE(OLD.total_price,0) THEN
      v_parts := array_append(v_parts, '房費 ' || OLD.total_price || '→' || NEW.total_price);
    END IF;
    IF COALESCE(NEW.discount_amount,0) IS DISTINCT FROM COALESCE(OLD.discount_amount,0) THEN
      v_parts := array_append(v_parts, '折扣 ' || COALESCE(OLD.discount_amount,0) || '→' || COALESCE(NEW.discount_amount,0));
    END IF;
    IF COALESCE(NEW.deposit_amount,0) IS DISTINCT FROM COALESCE(OLD.deposit_amount,0) THEN
      v_parts := array_append(v_parts, '訂金 ' || COALESCE(OLD.deposit_amount,0) || '→' || COALESCE(NEW.deposit_amount,0));
    END IF;
    IF COALESCE(NEW.paid_amount,0) IS DISTINCT FROM COALESCE(OLD.paid_amount,0) THEN
      v_parts := array_append(v_parts, '已付 ' || COALESCE(OLD.paid_amount,0) || '→' || COALESCE(NEW.paid_amount,0));
    END IF;
    IF COALESCE(NEW.final_price,0) IS DISTINCT FROM COALESCE(OLD.final_price,0) THEN
      v_parts := array_append(v_parts, '實收 ' || COALESCE(OLD.final_price,0) || '→' || COALESCE(NEW.final_price,0));
    END IF;

    IF array_length(v_parts, 1) IS NOT NULL THEN
      INSERT INTO public.notifications (accommodation_id, title, description, type, order_id)
      VALUES (NEW.accommodation_id, '🔒 結清金額變動',
        '訂單編號：' || NEW.order_number || E'\n' || array_to_string(v_parts, '、'),
        'settled_amount_change', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Field-locking trigger: only lock on fully paid (paid/fully_paid), not deposit_paid
CREATE OR REPLACE FUNCTION public.prevent_immutable_order_fields_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    -- Only lock financial fields when order is fully paid
    IF OLD.payment_status IN ('fully_paid', 'paid') THEN
      IF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
        RAISE EXCEPTION 'total_price cannot be changed after payment';
      END IF;
      IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount AND NOT can_unlock_discount THEN
        RAISE EXCEPTION 'discount_amount cannot be changed after payment';
      END IF;
      IF NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount THEN
        RAISE EXCEPTION 'deposit_amount cannot be changed after payment';
      END IF;
    END IF;
  END IF;

  -- Protect locked amount-history lines (still applies to all)
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
