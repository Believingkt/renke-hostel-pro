-- 20261018130000 rollback（W7 程式下架後才執行；會刪除退款帳戶資料與退款列的 3 個欄位）
BEGIN;
SET LOCAL lock_timeout = '3s';
DROP TABLE IF EXISTS public.refund_bank_accounts;
ALTER TABLE public.payment_transactions
  DROP COLUMN IF EXISTS refund_pending_reason,
  DROP COLUMN IF EXISTS refund_source,
  DROP COLUMN IF EXISTS parent_tx_id;
COMMIT;
