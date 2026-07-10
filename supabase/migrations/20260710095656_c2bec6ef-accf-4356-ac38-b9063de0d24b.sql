
-- 1) Add snapshot column so a Cancel push can survive after the order row is deleted.
ALTER TABLE public.owlting_order_push_queue
  ADD COLUMN IF NOT EXISTS order_snapshot jsonb;

-- 2) BEFORE DELETE trigger on orders: enqueue a Cancel + snapshot.
CREATE OR REPLACE FUNCTION public.fn_orders_owlting_enqueue_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg_exists boolean;
  v_sync_enabled boolean;
  v_queue_status text;
  v_echo_token text;
  v_was_active boolean;
  v_had_prior_sync boolean;
  v_primary_excluded boolean;
  v_any_included_room boolean;
  v_snapshot jsonb;
  v_rooms jsonb;
BEGIN
  -- Skip inbound-owned orders — those channels manage their own cancellation state.
  IF COALESCE(OLD.order_source, '') IN ('owlting','hotelnabe') THEN
    RETURN OLD;
  END IF;

  -- Config check
  SELECT TRUE, sync_enabled INTO v_cfg_exists, v_sync_enabled
  FROM public.accommodation_owlting_config
  WHERE accommodation_id = OLD.accommodation_id;

  v_queue_status := CASE WHEN COALESCE(v_cfg_exists, FALSE) AND COALESCE(v_sync_enabled, FALSE)
                         THEN 'pending' ELSE 'skipped' END;

  -- Was this order ever "active" (i.e. possibly known to OwlTing)? If it was
  -- cancelled before delete, it was already Cancel-pushed by the UPDATE trigger.
  v_was_active := OLD.order_status IN ('confirmed','pending','hold','checked_in');
  v_had_prior_sync := OLD.owlting_sync_state IS NOT NULL
    AND (OLD.owlting_sync_state->>'last_action') IS NOT NULL
    AND (OLD.owlting_sync_state->>'last_action') <> 'Cancel';

  IF NOT (v_was_active OR v_had_prior_sync) THEN
    RETURN OLD;
  END IF;

  -- Room-type exclusion check (mirrors the UPDATE-path logic)
  v_primary_excluded := EXISTS (
    SELECT 1 FROM public.owlting_room_type_sync s
    WHERE s.accommodation_id = OLD.accommodation_id
      AND s.room_type_id = OLD.room_type_id
      AND s.sync_enabled = false
  );
  IF v_primary_excluded THEN
    v_any_included_room := EXISTS (
      SELECT 1 FROM public.order_rooms r
      WHERE r.order_id = OLD.id
        AND NOT EXISTS (
          SELECT 1 FROM public.owlting_room_type_sync s2
          WHERE s2.accommodation_id = OLD.accommodation_id
            AND s2.room_type_id = r.room_type_id
            AND s2.sync_enabled = false
        )
    );
    IF NOT v_any_included_room THEN
      RETURN OLD;
    END IF;
  END IF;

  -- Build order_rooms snapshot (before CASCADE wipes them)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'room_type_id', r.room_type_id,
           'quantity',     r.quantity,
           'room_price',   r.room_price
         )), '[]'::jsonb)
    INTO v_rooms
    FROM public.order_rooms r
    WHERE r.order_id = OLD.id;

  v_snapshot := jsonb_build_object(
    'id',                   OLD.id,
    'order_number',         OLD.order_number,
    'accommodation_id',     OLD.accommodation_id,
    'check_in_date',        OLD.check_in_date,
    'check_out_date',       OLD.check_out_date,
    'guest_count',          OLD.guest_count,
    'guest_name',           OLD.guest_name,
    'guest_phone',          OLD.guest_phone,
    'guest_email',          OLD.guest_email,
    'total_price',          OLD.total_price,
    'final_price',          OLD.final_price,
    'deposit_amount',       OLD.deposit_amount,
    'payment_status',       OLD.payment_status,
    'notes',                OLD.notes,
    'room_type_id',         OLD.room_type_id,
    'package_id',           OLD.package_id,
    'meal_plan',            OLD.meal_plan,
    'owlting_unique_id',    OLD.owlting_unique_id,
    'order_status',         'cancelled',
    'order_rooms',          v_rooms
  );

  v_echo_token := 'RENKE-' || OLD.order_number || '-DEL-'
                  || (extract(epoch from clock_timestamp()) * 1000)::bigint::text
                  || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);

  INSERT INTO public.owlting_order_push_queue
    (accommodation_id, order_id, res_status, echo_token, status, order_snapshot)
  VALUES
    (OLD.accommodation_id, OLD.id, 'Cancel'::public.owlting_res_status,
     v_echo_token, v_queue_status::public.owlting_push_status, v_snapshot);

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_owlting_enqueue_delete ON public.orders;
CREATE TRIGGER trg_orders_owlting_enqueue_delete
  BEFORE DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_orders_owlting_enqueue_delete();
