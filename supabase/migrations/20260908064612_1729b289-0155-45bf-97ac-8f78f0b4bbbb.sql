-- V5.5A.6 PRECHECK
DO $$
DECLARE v_null int; v_unresolvable int;
BEGIN
  SELECT count(*) INTO v_null FROM public.order_meta WHERE accommodation_id IS NULL;
  SELECT count(*) INTO v_unresolvable
  FROM public.order_meta om LEFT JOIN public.orders o ON o.id = om.order_id
  WHERE om.accommodation_id IS NULL AND (o.id IS NULL OR o.accommodation_id IS NULL);
  IF v_unresolvable > 0 THEN
    RAISE EXCEPTION 'V5.5A.6 PRECHECK FAILED: % unresolvable orphan rows', v_unresolvable;
  END IF;
  IF v_null = 0 THEN
    RAISE EXCEPTION 'V5.5A.6 PRECHECK FAILED: nothing to backfill';
  END IF;
  RAISE NOTICE 'V5.5A.6 PRECHECK OK: % rows to backfill', v_null;
END $$;

-- SNAPSHOT
CREATE TABLE IF NOT EXISTS public.v55a6_order_meta_backfill_snapshot (
  order_meta_id uuid PRIMARY KEY,
  order_id uuid NOT NULL,
  old_accommodation_id uuid,
  new_accommodation_id uuid NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.v55a6_order_meta_backfill_snapshot ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.v55a6_order_meta_backfill_snapshot TO service_role;

INSERT INTO public.v55a6_order_meta_backfill_snapshot (order_meta_id, order_id, old_accommodation_id, new_accommodation_id)
SELECT om.id, om.order_id, om.accommodation_id, o.accommodation_id
FROM public.order_meta om JOIN public.orders o ON o.id = om.order_id
WHERE om.accommodation_id IS NULL AND o.accommodation_id IS NOT NULL
ON CONFLICT (order_meta_id) DO NOTHING;

-- BACKFILL
UPDATE public.order_meta om
SET accommodation_id = o.accommodation_id
FROM public.orders o
WHERE o.id = om.order_id
  AND om.accommodation_id IS NULL
  AND o.accommodation_id IS NOT NULL;

-- POSTCHECK
DO $$
DECLARE v_null int; v_mismatch int; v_snap int;
BEGIN
  SELECT count(*) INTO v_null FROM public.order_meta WHERE accommodation_id IS NULL;
  SELECT count(*) INTO v_mismatch
  FROM public.v55a6_order_meta_backfill_snapshot s
  JOIN public.order_meta om ON om.id = s.order_meta_id
  WHERE om.accommodation_id IS DISTINCT FROM s.new_accommodation_id;
  SELECT count(*) INTO v_snap FROM public.v55a6_order_meta_backfill_snapshot;
  IF v_null <> 0 THEN RAISE EXCEPTION 'V5.5A.6 POSTCHECK FAILED: % rows still NULL', v_null; END IF;
  IF v_mismatch <> 0 THEN RAISE EXCEPTION 'V5.5A.6 POSTCHECK FAILED: % mismatched rows', v_mismatch; END IF;
  RAISE NOTICE 'V5.5A.6 POSTCHECK OK: snapshot=% rows, remaining NULL=0', v_snap;
END $$;