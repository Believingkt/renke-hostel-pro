-- 共用 Demo rollback：只停用與封存，不 DROP、不刪除任何資料列（可再 GRANT 恢復）。
BEGIN;
REVOKE EXECUTE ON FUNCTION public.hq_shared_demo_get() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.hq_shared_demo_put(integer, jsonb, jsonb) FROM authenticated;
UPDATE public.hq_shared_demo_datasets SET status = 'archived', updated_at = now() WHERE status = 'active';
COMMIT;

-- 恢復（需要時）：
-- GRANT EXECUTE ON FUNCTION public.hq_shared_demo_get() TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.hq_shared_demo_put(integer, jsonb, jsonb) TO authenticated;
-- UPDATE public.hq_shared_demo_datasets SET status = 'active' WHERE slot = 'analytics';
