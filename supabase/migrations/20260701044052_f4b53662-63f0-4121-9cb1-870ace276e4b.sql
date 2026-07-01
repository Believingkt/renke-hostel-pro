
ALTER TABLE public.accommodation_hotelnabe_config
  ADD COLUMN IF NOT EXISTS sync_enabled boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE public.hotelnabe_ari_push_reason AS ENUM ('order_change','manual','backfill');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hotelnabe_ari_push_status AS ENUM ('pending','sending','sent','failed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.hotelnabe_ari_push_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  from_date date NOT NULL,
  to_date date NOT NULL,
  reason public.hotelnabe_ari_push_reason NOT NULL,
  status public.hotelnabe_ari_push_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotelnabe_ari_push_queue TO authenticated;
GRANT ALL ON public.hotelnabe_ari_push_queue TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hotelnabe_ari_push_queue_pending
  ON public.hotelnabe_ari_push_queue (accommodation_id, room_type_id, from_date, to_date)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_hotelnabe_ari_push_queue_status
  ON public.hotelnabe_ari_push_queue (status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_hotelnabe_ari_push_queue_acc_room
  ON public.hotelnabe_ari_push_queue (accommodation_id, room_type_id, from_date);

DROP TRIGGER IF EXISTS trg_hotelnabe_ari_push_queue_updated_at ON public.hotelnabe_ari_push_queue;
CREATE TRIGGER trg_hotelnabe_ari_push_queue_updated_at
  BEFORE UPDATE ON public.hotelnabe_ari_push_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.hotelnabe_ari_push_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read ari push queue" ON public.hotelnabe_ari_push_queue;
CREATE POLICY "Admins read ari push queue"
  ON public.hotelnabe_ari_push_queue
  FOR SELECT TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

DROP POLICY IF EXISTS "Admins write ari push queue" ON public.hotelnabe_ari_push_queue;
CREATE POLICY "Admins write ari push queue"
  ON public.hotelnabe_ari_push_queue
  FOR ALL TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  )
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

DROP VIEW IF EXISTS public.order_room_nights CASCADE;
CREATE VIEW public.order_room_nights
WITH (security_invoker = true) AS
WITH effective_orders AS (
  SELECT o.id AS order_id,
         o.accommodation_id,
         o.check_in_date,
         o.check_out_date,
         o.order_status,
         o.package_id
  FROM public.orders o
  WHERE o.order_status <> 'cancelled'
    AND o.check_out_date > o.check_in_date
),
from_order_rooms AS (
  SELECT eo.order_id, eo.accommodation_id,
         orr.room_type_id,
         COALESCE(orr.quantity, 1) AS quantity,
         eo.check_in_date, eo.check_out_date, eo.order_status
  FROM effective_orders eo
  JOIN public.order_rooms orr ON orr.order_id = eo.order_id
  WHERE orr.room_type_id IS NOT NULL
),
orders_without_rooms AS (
  SELECT eo.*
  FROM effective_orders eo
  WHERE NOT EXISTS (SELECT 1 FROM public.order_rooms r WHERE r.order_id = eo.order_id)
),
from_package_allocation AS (
  SELECT eo.order_id, eo.accommodation_id,
         (alloc->>'room_type_id')::uuid AS room_type_id,
         GREATEST(COALESCE((alloc->>'qty')::int, 1), 1) AS quantity,
         eo.check_in_date, eo.check_out_date, eo.order_status
  FROM orders_without_rooms eo
  JOIN public.accommodation_packages p ON p.id = eo.package_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.room_type_allocation) = 'array'
         THEN p.room_type_allocation ELSE '[]'::jsonb END
  ) alloc
  WHERE jsonb_typeof(p.room_type_allocation) = 'array'
    AND jsonb_array_length(p.room_type_allocation) > 0
),
from_package_primary AS (
  SELECT eo.order_id, eo.accommodation_id,
         p.primary_room_type_id AS room_type_id,
         1 AS quantity,
         eo.check_in_date, eo.check_out_date, eo.order_status
  FROM orders_without_rooms eo
  JOIN public.accommodation_packages p ON p.id = eo.package_id
  WHERE p.primary_room_type_id IS NOT NULL
    AND (jsonb_typeof(p.room_type_allocation) IS DISTINCT FROM 'array'
         OR jsonb_array_length(p.room_type_allocation) = 0)
    AND NOT EXISTS (SELECT 1 FROM from_package_allocation fa WHERE fa.order_id = eo.order_id)
),
combined AS (
  SELECT * FROM from_order_rooms
  UNION ALL SELECT * FROM from_package_allocation
  UNION ALL SELECT * FROM from_package_primary
)
SELECT c.order_id, c.accommodation_id, c.room_type_id, c.quantity,
       gs::date AS stay_date, c.order_status
FROM combined c
CROSS JOIN LATERAL generate_series(c.check_in_date, c.check_out_date - 1, interval '1 day') gs;

GRANT SELECT ON public.order_room_nights TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.calculate_room_remaining(
  _accommodation_id uuid,
  _room_type_id uuid,
  _date date
)
RETURNS TABLE (
  available_rooms integer,
  occupied integer,
  remaining integer,
  is_available boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _avail int;
  _rip_is_available boolean;
  _has_rip boolean := false;
  _occupied int;
BEGIN
  SELECT rip.available_rooms, rip.is_available, true
    INTO _avail, _rip_is_available, _has_rip
  FROM public.room_inventory_pricing rip
  WHERE rip.room_type_id = _room_type_id
    AND rip.date = _date
  LIMIT 1;

  IF NOT COALESCE(_has_rip, false) THEN
    SELECT rt.room_count INTO _avail
    FROM public.room_types rt
    WHERE rt.id = _room_type_id;
    _rip_is_available := true;
  END IF;

  _avail := COALESCE(_avail, 0);

  SELECT COALESCE(SUM(orn.quantity), 0)::int INTO _occupied
  FROM public.order_room_nights orn
  WHERE orn.accommodation_id = _accommodation_id
    AND orn.room_type_id = _room_type_id
    AND orn.stay_date = _date;

  available_rooms := _avail;
  occupied := _occupied;
  remaining := GREATEST(_avail - _occupied, 0);
  is_available := COALESCE(_rip_is_available, true) AND (remaining > 0);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_room_remaining(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_room_remaining(uuid, uuid, date) TO authenticated, service_role;
