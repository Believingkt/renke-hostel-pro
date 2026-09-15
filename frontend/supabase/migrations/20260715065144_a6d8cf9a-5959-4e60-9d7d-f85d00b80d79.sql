ALTER TABLE public.kol_reciprocal_monthly_quotas
  DROP CONSTRAINT IF EXISTS kol_reciprocal_monthly_quotas_package_id_fkey;

COMMENT ON COLUMN public.kol_reciprocal_monthly_quotas.package_id IS
  'Quota scope UUID. May reference accommodation_packages.id for new package records, or room_types.id for legacy exclusive-package room types.';

DROP FUNCTION IF EXISTS public.count_kol_reciprocal_orders(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.count_kol_reciprocal_orders(uuid, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.count_kol_reciprocal_orders(uuid, text, uuid, uuid, uuid[], boolean);

CREATE OR REPLACE FUNCTION public.count_kol_reciprocal_orders(
  _accommodation_id uuid,
  _year_month text,
  _exclude_order_id uuid DEFAULT NULL::uuid,
  _package_id uuid DEFAULT NULL::uuid,
  _tracked_package_ids uuid[] DEFAULT NULL::uuid[],
  _shared_untracked_only boolean DEFAULT false
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::int
  FROM public.orders o
  WHERE o.accommodation_id = _accommodation_id
    AND o.order_source = 'kol'
    AND COALESCE(o.order_status, '') <> 'cancelled'
    AND to_char(o.check_in_date, 'YYYY-MM') = _year_month
    AND (_exclude_order_id IS NULL OR o.id <> _exclude_order_id)
    AND (
      CASE
        WHEN _package_id IS NOT NULL THEN
          (o.package_id = _package_id OR o.room_type_id = _package_id)
        WHEN COALESCE(_shared_untracked_only, false) THEN
          NOT (
            COALESCE(o.package_id = ANY(COALESCE(_tracked_package_ids, ARRAY[]::uuid[])), false)
            OR COALESCE(o.room_type_id = ANY(COALESCE(_tracked_package_ids, ARRAY[]::uuid[])), false)
          )
        ELSE true
      END
    );
$function$;