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
BEGIN
  SELECT TRUE, sync_enabled INTO v_cfg_exists, v_sync_enabled
  FROM public.accommodation_owlting_config
  WHERE accommodation_id = NEW.accommodation_id;

  v_queue_status := CASE WHEN COALESCE(v_cfg_exists, FALSE) AND COALESCE(v_sync_enabled, FALSE)
                         THEN 'pending' ELSE 'skipped' END;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.order_source, '') = 'owlting' THEN RETURN NEW; END IF;
    IF NEW.order_status NOT IN ('confirmed','pending') THEN RETURN NEW; END IF;
    v_res_status := 'Commit';

  ELSIF TG_OP = 'UPDATE' THEN
    v_was_active := OLD.order_status IN ('confirmed','pending','hold','checked_in');
    v_is_active  := NEW.order_status IN ('confirmed','pending','hold','checked_in');

    v_relevant_change := (
         NEW.check_in_date  IS DISTINCT FROM OLD.check_in_date
      OR NEW.check_out_date IS DISTINCT FROM OLD.check_out_date
      OR NEW.room_type_id   IS DISTINCT FROM OLD.room_type_id
      OR NEW.guest_count    IS DISTINCT FROM OLD.guest_count
      OR NEW.total_price    IS DISTINCT FROM OLD.total_price
      OR NEW.final_price    IS DISTINCT FROM OLD.final_price
      OR NEW.package_id     IS DISTINCT FROM OLD.package_id
    );

    IF OLD.order_status <> 'cancelled' AND NEW.order_status = 'cancelled' THEN
      v_res_status := 'Cancel';
    ELSIF (NOT v_was_active) AND v_is_active
          AND NEW.order_status IN ('confirmed','pending') THEN
      v_res_status := 'Commit';
    ELSIF v_was_active AND v_is_active AND v_relevant_change THEN
      v_res_status := 'Modify';
    ELSE
      RETURN NEW;
    END IF;

    IF COALESCE(NEW.order_source, '') = 'owlting'
       AND v_res_status NOT IN ('Cancel') AND NOT v_relevant_change THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
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