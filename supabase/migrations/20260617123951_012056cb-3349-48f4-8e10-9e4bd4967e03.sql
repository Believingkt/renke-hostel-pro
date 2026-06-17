
CREATE OR REPLACE FUNCTION public.fn_orders_owlting_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.owlting_res_status;
  v_was_active boolean;
  v_is_active  boolean;
  v_relevant_changed boolean;
  v_cfg_enabled boolean;
  v_echo text;
  v_status public.owlting_push_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.order_source, '') = 'owlting' THEN
      RETURN NEW;
    END IF;
    IF NEW.order_status IN ('confirmed','pending') THEN
      v_action := 'Commit';
    ELSE
      RETURN NEW;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    v_was_active := OLD.order_status IN ('confirmed','pending');
    v_is_active  := NEW.order_status IN ('confirmed','pending');
    v_relevant_changed :=
         NEW.check_in_date  IS DISTINCT FROM OLD.check_in_date
      OR NEW.check_out_date IS DISTINCT FROM OLD.check_out_date
      OR NEW.room_type_id   IS DISTINCT FROM OLD.room_type_id
      OR NEW.guest_count    IS DISTINCT FROM OLD.guest_count
      OR NEW.total_price    IS DISTINCT FROM OLD.total_price;

    IF OLD.order_status <> 'cancelled' AND NEW.order_status = 'cancelled' THEN
      v_action := 'Cancel';
    ELSIF NOT v_was_active AND v_is_active THEN
      v_action := 'Commit';
    ELSIF v_is_active AND v_relevant_changed THEN
      v_action := 'Modify';
    ELSE
      RETURN NEW;
    END IF;

    IF COALESCE(NEW.order_source, '') = 'owlting' THEN
      IF v_action = 'Cancel' OR v_relevant_changed THEN
        NULL;
      ELSE
        RETURN NEW;
      END IF;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT sync_enabled INTO v_cfg_enabled
  FROM public.accommodation_owlting_config
  WHERE accommodation_id = NEW.accommodation_id;

  v_status := CASE WHEN v_cfg_enabled IS DISTINCT FROM true THEN 'skipped'::public.owlting_push_status
                   ELSE 'pending'::public.owlting_push_status END;

  -- Unique echo: epoch ms + 6 hex random suffix
  v_echo := 'RENKE-' || COALESCE(NEW.order_number,'NA')
            || '-' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint
            || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);

  INSERT INTO public.owlting_order_push_queue
    (accommodation_id, order_id, res_status, echo_token, status)
  VALUES
    (NEW.accommodation_id, NEW.id, v_action, v_echo, v_status);

  RETURN NEW;
END;
$$;
