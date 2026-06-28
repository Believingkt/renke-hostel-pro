
CREATE TABLE public.kol_reciprocal_monthly_quotas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  quota INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id, year_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_reciprocal_monthly_quotas TO authenticated;
GRANT ALL ON public.kol_reciprocal_monthly_quotas TO service_role;

ALTER TABLE public.kol_reciprocal_monthly_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backend users can view quotas for their accommodation"
ON public.kol_reciprocal_monthly_quotas FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.accommodation_id = kol_reciprocal_monthly_quotas.accommodation_id
  )
);

CREATE POLICY "Hotel admins can manage quotas"
ON public.kol_reciprocal_monthly_quotas FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.accommodation_id = kol_reciprocal_monthly_quotas.accommodation_id
      AND ur.role IN ('hotel_admin','super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.accommodation_id = kol_reciprocal_monthly_quotas.accommodation_id
      AND ur.role IN ('hotel_admin','super_admin')
  )
);

CREATE TRIGGER trg_update_kol_quota_updated_at
BEFORE UPDATE ON public.kol_reciprocal_monthly_quotas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: 計算某月某民宿的 KOL 互惠訂單筆數（依入住日歸屬，排除取消單；可排除指定訂單 id）
CREATE OR REPLACE FUNCTION public.count_kol_reciprocal_orders(
  _accommodation_id UUID,
  _year_month TEXT,
  _exclude_order_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.orders o
  WHERE o.accommodation_id = _accommodation_id
    AND o.order_source = 'kol'
    AND COALESCE(o.order_status, '') <> 'cancelled'
    AND to_char(o.check_in_date, 'YYYY-MM') = _year_month
    AND (_exclude_order_id IS NULL OR o.id <> _exclude_order_id);
$$;

GRANT EXECUTE ON FUNCTION public.count_kol_reciprocal_orders(UUID, TEXT, UUID) TO authenticated, service_role;
