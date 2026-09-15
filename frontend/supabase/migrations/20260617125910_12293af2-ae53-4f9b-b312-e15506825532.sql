-- Step 3.5: add orders.package_id and best-effort backfill from meal_plan name
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS package_id uuid
    REFERENCES public.accommodation_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_package_id ON public.orders(package_id);

-- Best-effort backfill: match orders.meal_plan to an accommodation_packages.name
-- within the same accommodation. Only the first match wins; unmatched rows are left null.
UPDATE public.orders o
SET package_id = p.id
FROM public.accommodation_packages p
WHERE o.package_id IS NULL
  AND o.meal_plan IS NOT NULL
  AND o.meal_plan <> ''
  AND p.accommodation_id = o.accommodation_id
  AND p.name = o.meal_plan;

-- Extend the OwlTing enqueue trigger so a package_id change is treated as a
-- relevant modification (since it changes the RatePlanCode we'd push).
CREATE OR REPLACE FUNCTION public.fn_orders_owlting_enqueue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    (NEW.accommodation_id, NEW.id, v_res_status, v_echo_token, v_queue_status);

  RETURN NEW;
END;
$$;
