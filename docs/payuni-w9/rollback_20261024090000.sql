-- PAYUNi W9 rollback：移除平台費兩張表（會刪除批次與明細；已送出 agent_fee 的紀錄請先匯出 CSV 留存）
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
DROP TABLE IF EXISTS public.payuni_platform_fee_items;
DROP TABLE IF EXISTS public.payuni_platform_fee_batches;
COMMIT;
