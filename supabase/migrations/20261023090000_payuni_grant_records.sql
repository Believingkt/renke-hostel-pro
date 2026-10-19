-- ============================================================
-- PAYUNi W8：撥款明細同步（grant_query）— 只新增一張表，不改既有表／資料
--   payuni_grant_records：payuni-grant-sync 每天同步各館前一日撥款明細（PAYUNi Result 陣列一列一筆）
--   match_status：matched（對到 payment_transactions）／unmatched（有 MerTradeNo 但對不到）／
--                 no_order（Type=出帳且沒有 MerTradeNo，例如退款轉匯手續費、提領費；正常出帳，不告警）
--   對應順序：同 mer_trade_no 的交易列 → 退回原付款交易（parent_tx_id）；payment_tx_id／order_id 只記錄，不設外鍵
--   去重：UNIQUE NULLS NOT DISTINCT (mer_id, trade_no, query_date, type, execute_amt)，重跑同一天 upsert 不重複
--   RLS：SELECT 只給本館 hotel_admin 與 super_admin；寫入只有 service role（authenticated 只 GRANT SELECT）
--   accommodation_id 不設外鍵（避免建表時鎖到 accommodation_info）
-- 鎖與逾時：整支 BEGIN/COMMIT；lock_timeout 3s；只建新物件，不取得既有表的 ACCESS EXCLUSIVE
-- 重跑安全：CREATE TABLE／INDEX IF NOT EXISTS；policy 先查 pg_policies 再建
-- 需 PostgreSQL 15 以上（NULLS NOT DISTINCT）
-- rollback：docs/payuni-w8/rollback_20261023090000.sql
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.payuni_grant_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL,
  mer_id text NOT NULL,
  query_date date NOT NULL,
  trade_date date,
  mer_trade_no text,
  trade_no text,
  payment_type text,
  bank_channel text,
  payment_date text,
  payment_info text,
  execute_amt integer,
  fee integer,
  action text,
  funds_amt integer,
  type text,
  match_status text NOT NULL CHECK (match_status IN ('matched', 'unmatched', 'no_order')),
  payment_tx_id uuid,
  order_id uuid,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payuni_grant_records_dedupe_key
    UNIQUE NULLS NOT DISTINCT (mer_id, trade_no, query_date, type, execute_amt)
);

CREATE INDEX IF NOT EXISTS payuni_grant_records_acc_trade_date_idx
  ON public.payuni_grant_records (accommodation_id, trade_date);
CREATE INDEX IF NOT EXISTS payuni_grant_records_query_date_idx
  ON public.payuni_grant_records (query_date);
CREATE INDEX IF NOT EXISTS payuni_grant_records_unmatched_idx
  ON public.payuni_grant_records (query_date)
  WHERE match_status = 'unmatched';

COMMENT ON TABLE public.payuni_grant_records IS
  'PAYUNi 撥款明細（grant_query），payuni-grant-sync 每日同步。本館 hotel_admin／super_admin 可讀，只有 service role 可寫。';
COMMENT ON COLUMN public.payuni_grant_records.query_date IS '查詢用的 QueryDate（台北日）';
COMMENT ON COLUMN public.payuni_grant_records.trade_date IS 'PAYUNi TradeDate（入帳日期）';
COMMENT ON COLUMN public.payuni_grant_records.payment_date IS 'PAYUNi PaymentDate（付款／退款日期，原文保存）';
COMMENT ON COLUMN public.payuni_grant_records.funds_amt IS 'PAYUNi FundsAmt（入帳金額，已扣 PAYUNi 手續費）';
COMMENT ON COLUMN public.payuni_grant_records.type IS 'PAYUNi Type（入帳／出帳，原文保存）';
COMMENT ON COLUMN public.payuni_grant_records.match_status IS 'matched／unmatched／no_order（出帳且無訂單編號，正常不告警）';

ALTER TABLE public.payuni_grant_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payuni_grant_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payuni_grant_records TO authenticated;
GRANT ALL ON TABLE public.payuni_grant_records TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payuni_grant_records'
      AND policyname = 'payuni_grant_records_select_hotel_admin'
  ) THEN
    CREATE POLICY payuni_grant_records_select_hotel_admin ON public.payuni_grant_records
      FOR SELECT TO authenticated
      USING (
        public.is_super_admin(auth.uid())
        OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::public.app_role)
      );
  END IF;
END $$;

COMMIT;
