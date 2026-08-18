CREATE OR REPLACE FUNCTION public.fn_orders_owlting_enqueue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg_exists boolean;
  v_sync_enabled boolean;
  v_queue_status text;
  v_res_status text;
  v_echo_token text;
  v_was_active boolean;
  v_is_active boolean;
  v_relevant_change boolean;
  v_primary_excluded boolean;
  v_any_included_room boolean;
  v_pending_exists boolean;
BEGIN
  -- Inbound-sourced orders (補單) never push back to OwlTing/Hotelnabe,
  -- regardless of later edits or cancellation.
  IF COALESCE(NEW.order_source, '') IN ('owlting','hotelnabe')
     OR NEW.owlting_reservation_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT TRUE, sync_enabled INTO v_cfg_exists, v_sync_enabled
  FROM public.accommodation_owlting_config
  WHERE accommodation_id = NEW.accommodation_id;

  v_queue_status := CASE WHEN COALESCE(v_cfg_exists, FALSE) AND COALESCE(v_sync_enabled, FALSE)
                         THEN 'pending' ELSE 'skipped' END;

  IF TG_OP = 'INSERT' THEN
    IF NEW.order_status NOT IN ('confirmed','pending','hold') THEN RETURN NEW; END IF;
    v_res_status := 'Commit';

  ELSIF TG_OP = 'UPDATE' THEN
    v_was_active := OLD.order_status IN ('confirmed','pending','hold','checked_in');
    v_is_active  := NEW.order_status IN ('confirmed','pending','hold','checked_in');

    v_relevant_change := (
         NEW.check_in_date    IS DISTINCT FROM OLD.check_in_date
      OR NEW.check_out_date   IS DISTINCT FROM OLD.check_out_date
      OR NEW.room_type_id     IS DISTINCT FROM OLD.room_type_id
      OR NEW.guest_count      IS DISTINCT FROM OLD.guest_count
      OR NEW.total_price      IS DISTINCT FROM OLD.total_price
      OR NEW.final_price      IS DISTINCT FROM OLD.final_price
      OR NEW.package_id       IS DISTINCT FROM OLD.package_id
      OR NEW.discount_amount  IS DISTINCT FROM OLD.discount_amount
      OR NEW.discount_code    IS DISTINCT FROM OLD.discount_code
      OR NEW.paid_amount      IS DISTINCT FROM OLD.paid_amount
      OR NEW.deposit_amount   IS DISTINCT FROM OLD.deposit_amount
      OR NEW.payment_status   IS DISTINCT FROM OLD.payment_status
      OR NEW.guest_name       IS DISTINCT FROM OLD.guest_name
      OR NEW.guest_phone      IS DISTINCT FROM OLD.guest_phone
      OR NEW.guest_email      IS DISTINCT FROM OLD.guest_email
      OR NEW.notes            IS DISTINCT FROM OLD.notes
    );

    IF OLD.order_status <> 'cancelled' AND NEW.order_status = 'cancelled' THEN
      v_res_status := 'Cancel';
    ELSIF (NOT v_was_active) AND v_is_active
          AND NEW.order_status IN ('confirmed','pending','hold') THEN
      v_res_status := 'Commit';
    ELSIF v_was_active AND v_is_active AND v_relevant_change THEN
      v_res_status := 'Modify';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  v_primary_excluded := EXISTS (
    SELECT 1 FROM public.owlting_room_type_sync s
    WHERE s.accommodation_id = NEW.accommodation_id
      AND s.room_type_id = NEW.room_type_id
      AND s.sync_enabled = false
  );

  IF v_primary_excluded THEN
    v_any_included_room := EXISTS (
      SELECT 1 FROM public.order_rooms r
      WHERE r.order_id = NEW.id
        AND NOT EXISTS (
          SELECT 1 FROM public.owlting_room_type_sync s2
          WHERE s2.accommodation_id = NEW.accommodation_id
            AND s2.room_type_id = r.room_type_id
            AND s2.sync_enabled = false
        )
    );
    IF NOT v_any_included_room THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_res_status = 'Modify' THEN
    v_pending_exists := EXISTS (
      SELECT 1 FROM public.owlting_order_push_queue q
      WHERE q.order_id = NEW.id
        AND q.status IN ('pending','sending')
    );
    IF v_pending_exists THEN
      RETURN NEW;
    END IF;
  END IF;

  v_echo_token := 'RENKE-' || NEW.order_number || '-'
                  || (extract(epoch from clock_timestamp()) * 1000)::bigint::text
                  || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);

  INSERT INTO public.owlting_order_push_queue
    (accommodation_id, order_id, res_status, echo_token, status)
  VALUES
    (NEW.accommodation_id, NEW.id, v_res_status::public.owlting_res_status, v_echo_token, v_queue_status::public.owlting_push_status);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_order_rooms_owlting_enqueue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_order record;
  v_sync_enabled boolean;
  v_pending_exists boolean;
  v_echo_token text;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id, accommodation_id, order_status, order_source, owlting_reservation_id
    INTO v_order
  FROM public.orders
  WHERE id = v_order_id;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Skip inbound-sourced orders (they originate at OwlTing/Hotelnabe)
  IF COALESCE(v_order.order_source, '') IN ('owlting','hotelnabe')
     OR v_order.owlting_reservation_id IS NOT NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_order.order_status NOT IN ('confirmed','pending','hold','checked_in') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT sync_enabled INTO v_sync_enabled
  FROM public.accommodation_owlting_config
  WHERE accommodation_id = v_order.accommodation_id;

  IF NOT COALESCE(v_sync_enabled, FALSE) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.owlting_order_push_queue
    WHERE order_id = v_order_id
      AND status = 'pending'
      AND res_status = 'Modify'
  ) INTO v_pending_exists;

  IF v_pending_exists THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_echo_token := 'RENKE-' || COALESCE(
    (SELECT order_number FROM public.orders WHERE id = v_order_id),
    v_order_id::text
  ) || '-' || (extract(epoch from clock_timestamp())*1000)::bigint::text
    || '-' || substr(md5(random()::text), 1, 6);

  INSERT INTO public.owlting_order_push_queue
    (accommodation_id, order_id, res_status, echo_token, status, next_retry_at)
  VALUES
    (v_order.accommodation_id, v_order_id, 'Modify', v_echo_token, 'pending', now());

  RETURN COALESCE(NEW, OLD);
END;
$function$;