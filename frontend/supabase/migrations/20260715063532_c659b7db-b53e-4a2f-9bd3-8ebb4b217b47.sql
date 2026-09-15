
-- 1. 額度表加 package_id (nullable, NULL = 全民宿共用)
ALTER TABLE public.kol_reciprocal_monthly_quotas
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.accommodation_packages(id) ON DELETE CASCADE;

-- 換掉舊的 unique constraint,改用允許 package_id NULL 的 unique index
ALTER TABLE public.kol_reciprocal_monthly_quotas
  DROP CONSTRAINT IF EXISTS kol_reciprocal_monthly_quotas_accommodation_id_year_month_key;

CREATE UNIQUE INDEX IF NOT EXISTS kol_quota_uniq_shared
  ON public.kol_reciprocal_monthly_quotas (accommodation_id, year_month)
  WHERE package_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS kol_quota_uniq_package
  ON public.kol_reciprocal_monthly_quotas (accommodation_id, year_month, package_id)
  WHERE package_id IS NOT NULL;

-- 2. accommodation_info 增加模式與追蹤包棟清單
ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS kol_quota_mode text NOT NULL DEFAULT 'shared',
  ADD COLUMN IF NOT EXISTS kol_quota_tracked_package_ids uuid[] NOT NULL DEFAULT '{}';

-- 3. RPC 新增 package_id 參數
CREATE OR REPLACE FUNCTION public.count_kol_reciprocal_orders(
  _accommodation_id uuid,
  _year_month text,
  _exclude_order_id uuid DEFAULT NULL,
  _package_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::int
  FROM public.orders o
  WHERE o.accommodation_id = _accommodation_id
    AND o.order_source = 'kol'
    AND COALESCE(o.order_status, '') <> 'cancelled'
    AND to_char(o.check_in_date, 'YYYY-MM') = _year_month
    AND (_exclude_order_id IS NULL OR o.id <> _exclude_order_id)
    AND (_package_id IS NULL OR o.package_id = _package_id);
$function$;
