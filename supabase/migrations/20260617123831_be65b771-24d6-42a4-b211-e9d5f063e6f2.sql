
-- Phase 3 Step 2: Triggers to enqueue OwlTing pushes on order changes
-- No external calls. Only writes to owlting_order_push_queue.

-- 1) BEFORE trigger: ensure owlting_unique_id is set (sticky for the order's lifetime)
CREATE OR REPLACE FUNCTION public.fn_orders_owlting_set_unique_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owlting_unique_id IS NULL OR NEW.owlting_unique_id = '' THEN
    NEW.owlting_unique_id := NEW.order_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_owlting_set_unique_id ON public.orders;
CREATE TRIGGER trg_orders_owlting_set_unique_id
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_orders_owlting_set_unique_id();

-- 2) AFTER trigger: enqueue Commit / Modify / Cancel rows
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
  -- "已成立" = confirmed / pending (per user confirmation: hold NOT counted)
  IF TG_OP = 'INSERT' THEN
    -- owlting source: do NOT push on insert (it came FROM OwlTing)
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

    -- 1. Cancel: non-cancelled -> cancelled
    IF OLD.order_status <> 'cancelled' AND NEW.order_status = 'cancelled' THEN
      v_action := 'Cancel';

    -- 2. Re-Commit: previously non-active -> active (e.g. hold -> confirmed)
    ELSIF NOT v_was_active AND v_is_active THEN
      v_action := 'Commit';

    -- 3. Modify: still active AND relevant field changed
    ELSIF v_is_active AND v_relevant_changed THEN
      v_action := 'Modify';

    ELSE
      RETURN NEW;
    END IF;

    -- owlting source: only enqueue on cancel or relevant change; skip PII-only updates
    IF COALESCE(NEW.order_source, '') = 'owlting' THEN
      IF v_action = 'Cancel' OR v_relevant_changed THEN
        NULL; -- ok, enqueue
      ELSE
        RETURN NEW;
      END IF;
    END IF;

  ELSE
    RETURN NEW;
  END IF;

  -- Determine whether to mark queue row as skipped (no config / sync disabled)
  SELECT sync_enabled INTO v_cfg_enabled
  FROM public.accommodation_owlting_config
  WHERE accommodation_id = NEW.accommodation_id;

  IF v_cfg_enabled IS DISTINCT FROM true THEN
    v_status := 'skipped';
  ELSE
    v_status := 'pending';
  END IF;

  v_echo := 'RENKE-' || COALESCE(NEW.order_number,'NA') || '-' || EXTRACT(EPOCH FROM clock_timestamp())::bigint;

  INSERT INTO public.owlting_order_push_queue
    (accommodation_id, order_id, res_status, echo_token, status)
  VALUES
    (NEW.accommodation_id, NEW.id, v_action, v_echo, v_status);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_owlting_enqueue ON public.orders;
CREATE TRIGGER trg_orders_owlting_enqueue
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_orders_owlting_enqueue();
