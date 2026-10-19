-- PAYUNi W8 rollback：移除撥款明細表（會刪除已同步的撥款資料；可由 payuni-grant-sync 30 天內補跑重建）
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
DROP TABLE IF EXISTS public.payuni_grant_records;
COMMIT;
