
CREATE TABLE IF NOT EXISTS public.hotelnabe_ari_push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL,
  hotel_code text,
  mode text NOT NULL,
  echo_token text,
  message_count int,
  queue_ids uuid[],
  request_xml text,
  response_xml text,
  http_status int,
  success boolean,
  error_message text,
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hotelnabe_ari_push_log TO authenticated;
GRANT ALL ON public.hotelnabe_ari_push_log TO service_role;

ALTER TABLE public.hotelnabe_ari_push_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hq_super_admin_read_hotelnabe_ari_push_log" ON public.hotelnabe_ari_push_log;
CREATE POLICY "hq_super_admin_read_hotelnabe_ari_push_log"
ON public.hotelnabe_ari_push_log FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'::public.app_role
));

CREATE INDEX IF NOT EXISTS idx_hotelnabe_ari_push_log_acc_created
ON public.hotelnabe_ari_push_log (accommodation_id, created_at DESC);

CREATE OR REPLACE FUNCTION public._hotelnabe_should_sync(_acc uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((
    SELECT (ai.channel_manager = 'hotelnabe') AND COALESCE(cfg.sync_enabled, false)
    FROM public.accommodation_info ai
    LEFT JOIN public.accommodation_hotelnabe_config cfg ON cfg.accommodation_id = ai.id
    WHERE ai.id = _acc LIMIT 1
  ), false);
$$;

CREATE OR REPLACE FUNCTION public._hotelnabe_enqueue_days(
  _acc uuid, _room_type uuid, _checkin date, _checkout date, _reason public.hotelnabe_ari_push_reason
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d date;
BEGIN
  IF _acc IS NULL OR _room_type IS NULL OR _checkin IS NULL OR _checkout IS NULL THEN RETURN; END IF;
  IF _checkout <= _checkin THEN RETURN; END IF;
  IF NOT public._hotelnabe_should_sync(_acc) THEN RETURN; END IF;
  d := _checkin;
  WHILE d < _checkout LOOP
    INSERT INTO public.hotelnabe_ari_push_queue (accommodation_id, room_type_id, from_date, to_date, reason, status)
    VALUES (_acc, _room_type, d, d, _reason, 'pending')
    ON CONFLICT (accommodation_id, room_type_id, from_date, to_date) WHERE status = 'pending' DO NOTHING;
    d := d + 1;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_hotelnabe_enqueue_from_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._hotelnabe_enqueue_days(NEW.accommodation_id, NEW.room_type_id, NEW.check_in_date, NEW.check_out_date, 'order_change');
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public._hotelnabe_enqueue_days(OLD.accommodation_id, OLD.room_type_id, OLD.check_in_date, OLD.check_out_date, 'order_change');
    PERFORM public._hotelnabe_enqueue_days(NEW.accommodation_id, NEW.room_type_id, NEW.check_in_date, NEW.check_out_date, 'order_change');
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public._hotelnabe_enqueue_days(OLD.accommodation_id, OLD.room_type_id, OLD.check_in_date, OLD.check_out_date, 'order_change');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotelnabe_enqueue_from_order ON public.orders;
CREATE TRIGGER trg_hotelnabe_enqueue_from_order
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fn_hotelnabe_enqueue_from_order();

CREATE OR REPLACE FUNCTION public.fn_hotelnabe_enqueue_from_order_rooms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o_acc uuid; o_ci date; o_co date;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT accommodation_id, check_in_date, check_out_date INTO o_acc, o_ci, o_co
    FROM public.orders WHERE id = NEW.order_id;
    PERFORM public._hotelnabe_enqueue_days(o_acc, NEW.room_type_id, o_ci, o_co, 'order_change');
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT accommodation_id, check_in_date, check_out_date INTO o_acc, o_ci, o_co
    FROM public.orders WHERE id = OLD.order_id;
    PERFORM public._hotelnabe_enqueue_days(o_acc, OLD.room_type_id, o_ci, o_co, 'order_change');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotelnabe_enqueue_from_order_rooms ON public.order_rooms;
CREATE TRIGGER trg_hotelnabe_enqueue_from_order_rooms
AFTER INSERT OR UPDATE OR DELETE ON public.order_rooms
FOR EACH ROW EXECUTE FUNCTION public.fn_hotelnabe_enqueue_from_order_rooms();

CREATE OR REPLACE FUNCTION public.fn_hotelnabe_enqueue_from_rip()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _acc uuid;
BEGIN
  IF NEW.available_rooms IS DISTINCT FROM OLD.available_rooms
     OR NEW.is_available   IS DISTINCT FROM OLD.is_available THEN
    SELECT accommodation_id INTO _acc FROM public.room_types WHERE id = NEW.room_type_id;
    PERFORM public._hotelnabe_enqueue_days(_acc, NEW.room_type_id, NEW.date, NEW.date + 1, 'manual');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotelnabe_enqueue_from_rip ON public.room_inventory_pricing;
CREATE TRIGGER trg_hotelnabe_enqueue_from_rip
AFTER UPDATE ON public.room_inventory_pricing
FOR EACH ROW EXECUTE FUNCTION public.fn_hotelnabe_enqueue_from_rip();
