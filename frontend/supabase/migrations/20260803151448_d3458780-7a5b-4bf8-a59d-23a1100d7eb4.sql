DROP VIEW IF EXISTS public.kol_profiles_with_progress;

CREATE VIEW public.kol_profiles_with_progress
WITH (security_invoker = on)
AS
SELECT k.*,
    CASE
        WHEN NULLIF(btrim(COALESCE(k.order_number, ''::text)), ''::text) IS NOT NULL AND o.order_number IS NULL AND (EXISTS ( SELECT 1
           FROM audit_logs al
          WHERE al.entity_type = 'order'::text AND al.action_type = 'create'::text AND al.entity_name = btrim(k.order_number))) THEN '異常需檢查'::text
        WHEN NULLIF(btrim(COALESCE(k.publish_url, ''::text)), ''::text) IS NOT NULL THEN
        CASE
            WHEN k.check_in_date IS NOT NULL AND (now() AT TIME ZONE 'Asia/Taipei'::text)::date < k.check_in_date THEN '異常需檢查'::text
            ELSE '已上片'::text
        END
        WHEN NULLIF(btrim(COALESCE(k.order_number, ''::text)), ''::text) IS NULL OR o.order_number IS NULL THEN '未訂房'::text
        WHEN o.order_status = 'cancelled'::text THEN '已取消'::text
        ELSE
        CASE
            WHEN k.check_in_date IS NOT NULL AND (now() AT TIME ZONE 'Asia/Taipei'::text)::date >= k.check_in_date AND o.order_status = 'confirmed'::text THEN '入住未上片'::text
            ELSE '未入住'::text
        END
    END AS collab_progress,
    CASE
        WHEN NULLIF(btrim(COALESCE(k.order_number, ''::text)), ''::text) IS NOT NULL AND o.order_number IS NULL AND (EXISTS ( SELECT 1
           FROM audit_logs al
          WHERE al.entity_type = 'order'::text AND al.action_type = 'create'::text AND al.entity_name = btrim(k.order_number))) THEN 'order_deleted'::text
        WHEN NULLIF(btrim(COALESCE(k.publish_url, ''::text)), ''::text) IS NOT NULL
             AND k.check_in_date IS NOT NULL
             AND (now() AT TIME ZONE 'Asia/Taipei'::text)::date < k.check_in_date THEN 'published_before_checkin'::text
        ELSE NULL::text
    END AS anomaly_reason
FROM kol_profiles k
LEFT JOIN orders o ON o.order_number = btrim(k.order_number);

GRANT SELECT ON public.kol_profiles_with_progress TO authenticated;
GRANT ALL ON public.kol_profiles_with_progress TO service_role;