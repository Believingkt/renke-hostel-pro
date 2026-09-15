CREATE OR REPLACE VIEW public.kol_profiles_with_progress
WITH (security_invoker = on) AS
SELECT
  k.*,
  CASE
    WHEN NULLIF(btrim(COALESCE(k.order_number, '')), '') IS NOT NULL
         AND o.order_number IS NULL
         AND EXISTS (
           SELECT 1 FROM public.audit_logs al
           WHERE al.entity_type = 'order'
             AND al.action_type = 'create'
             AND al.entity_name = btrim(k.order_number)
         )
      THEN '異常需檢查'
    WHEN NULLIF(btrim(COALESCE(k.publish_url, '')), '') IS NOT NULL THEN
      CASE
        WHEN k.check_in_date IS NOT NULL
             AND (now() AT TIME ZONE 'Asia/Taipei')::date < k.check_in_date
          THEN '異常需檢查'
        ELSE '已上片'
      END
    WHEN NULLIF(btrim(COALESCE(k.order_number, '')), '') IS NULL OR o.order_number IS NULL
      THEN '未訂房'
    WHEN o.order_status = 'cancelled' THEN '已取消'
    ELSE
      CASE
        WHEN k.check_in_date IS NOT NULL
             AND (now() AT TIME ZONE 'Asia/Taipei')::date >= k.check_in_date
             AND o.order_status = 'confirmed'
          THEN '入住未上片'
        ELSE '未入住'
      END
  END AS collab_progress
FROM public.kol_profiles k
LEFT JOIN public.orders o
  ON o.order_number = btrim(k.order_number);

GRANT SELECT ON public.kol_profiles_with_progress TO authenticated;
GRANT ALL ON public.kol_profiles_with_progress TO service_role;