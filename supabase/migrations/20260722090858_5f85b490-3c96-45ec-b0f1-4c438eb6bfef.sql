
CREATE OR REPLACE FUNCTION public.fn_order_rooms_owlting_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT id, accommodation_id, order_status, order_source
    INTO v_order
  FROM public.orders
  WHERE id = v_order_id;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Skip inbound-sourced orders (they originate at OwlTing/Hotelnabe)
  IF COALESCE(v_order.order_source, '') IN ('owlting','hotelnabe') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Only enqueue for active orders
  IF v_order.order_status NOT IN ('confirmed','pending','hold','checked_in') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Sync must be enabled for this property
  SELECT sync_enabled INTO v_sync_enabled
  FROM public.accommodation_owlting_config
  WHERE accommodation_id = v_order.accommodation_id;

  IF NOT COALESCE(v_sync_enabled, FALSE) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Dedup: if there's already a pending Modify for this order, skip
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
$$;

DROP TRIGGER IF EXISTS trg_order_rooms_owlting_enqueue ON public.order_rooms;
CREATE TRIGGER trg_order_rooms_owlting_enqueue
AFTER INSERT OR UPDATE OR DELETE ON public.order_rooms
FOR EACH ROW EXECUTE FUNCTION public.fn_order_rooms_owlting_enqueue();
