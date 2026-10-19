-- 20261020090000 rollback（payuni-reconcile 下架後才執行；會刪除對帳紀錄與已回填的手續費）
BEGIN;
SET LOCAL lock_timeout = '3s';
DROP TABLE IF EXISTS public.payuni_reconcile_diffs;
DROP TABLE IF EXISTS public.payuni_reconcile_runs;
ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS provider_fee;
COMMIT;
