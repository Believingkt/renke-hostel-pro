-- 重建唯一索引：排除 settled_amount_change，允許多筆
DROP INDEX IF EXISTS public.notifications_order_type_uniq;

CREATE UNIQUE INDEX notifications_order_type_uniq
ON public.notifications (order_id, type)
WHERE order_id IS NOT NULL AND type <> 'settled_amount_change';