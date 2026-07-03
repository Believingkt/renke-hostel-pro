
-- 1) Per-room-type OwlTing sync toggle
CREATE TABLE IF NOT EXISTS public.owlting_room_type_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  sync_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id, room_type_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owlting_room_type_sync TO authenticated;
GRANT ALL ON public.owlting_room_type_sync TO service_role;

ALTER TABLE public.owlting_room_type_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HQ admin manage owlting_room_type_sync" ON public.owlting_room_type_sync;
CREATE POLICY "HQ admin manage owlting_room_type_sync"
  ON public.owlting_room_type_sync
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Read owlting_room_type_sync" ON public.owlting_room_type_sync;
CREATE POLICY "Read owlting_room_type_sync"
  ON public.owlting_room_type_sync
  FOR SELECT TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS trg_owlting_room_type_sync_updated_at ON public.owlting_room_type_sync;
CREATE TRIGGER trg_owlting_room_type_sync_updated_at
  BEFORE UPDATE ON public.owlting_room_type_sync
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Seed SENSAN 雙人房 (1002) / 四人房 (1003) as excluded
INSERT INTO public.owlting_room_type_sync (accommodation_id, room_type_id, sync_enabled)
VALUES
  ('5f764d55-ae11-4631-80fe-2e611853deae', 'b415b602-7cca-4f35-829e-2b9cc0cd0bac', false),
  ('5f764d55-ae11-4631-80fe-2e611853deae', 'c483aafb-a22f-4252-a61d-c8f6878bf8f5', false)
ON CONFLICT (accommodation_id, room_type_id)
DO UPDATE SET sync_enabled = EXCLUDED.sync_enabled, updated_at = now();

-- 3) 升級 enqueue trigger：若所有房型都被排除，就不進 push queue
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
BEGIN
  SELECT TRUE, sync_enabled INTO v_cfg_exists, v_sync_enabled
  FROM public.accommodation_owlting_config
  WHERE accommodation_id = NEW.accommodation_id;

  v_queue_status := CASE WHEN COALESCE(v_cfg_exists, FALSE) AND COALESCE(v_sync_enabled, FALSE)
                         THEN 'pending' ELSE 'skipped' END;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.order_source, '') IN ('owlting','hotelnabe') THEN RETURN NEW; END IF;
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

    IF COALESCE(NEW.order_source, '') = 'hotelnabe' THEN
      RETURN NEW;
    END IF;

    IF COALESCE(NEW.order_source, '') = 'owlting'
       AND v_res_status NOT IN ('Cancel') AND NOT v_relevant_change THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- 逐房型同步開關：若主房型被排除，且沒有任何 order_rooms 屬於「非排除」房型，就不推
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
