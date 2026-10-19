-- ============================================================
-- PAYUNi W6：每日交易對帳與手續費回填（只新增，不改既有欄位／資料）
--   1. payment_transactions.provider_fee：PAYUNi TradeFee（只有交易查詢 DataSource=A 且 TradeStatus=1 時才有值），由 payuni-reconcile 回填
--   2. payuni_reconcile_runs：每個台北日曆日一筆（run_date 唯一）；03:30／03:45／04:00 三次排程接續同一筆，
--      checked_tx_ids 記錄已查過的交易，接續時跳過；completed=false 代表「未查完」（單次 1000 筆或 100 秒上限）
--   3. payuni_reconcile_diffs：差異明細；同一 mer_trade_no＋diff_type 未解決時只更新、不重複新增（部分唯一索引保證）
--      status_fixed（已自動補入帳）寫入時即 resolved_at／resolved_by='system'，不進告警
--   兩張新表：RLS 開啟、沒有 policy、REVOKE anon／authenticated，只有 service role（Edge Function）可存取
--   不設指向 orders／payment_transactions 的外鍵（避免建表時鎖到高流量表）；一致性由 payuni-reconcile 保證
-- 鎖與逾時：整支 BEGIN/COMMIT；lock_timeout 3s 拿不到鎖就整支放棄
--   只有 ADD COLUMN（可為 NULL、無預設值，只改目錄）會短暫取得 payment_transactions 的 ACCESS EXCLUSIVE；不碰 orders
-- 重跑安全：全部 IF NOT EXISTS
-- rollback：docs/payuni-w6/rollback_20261020090000.sql
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS provider_fee integer;

COMMENT ON COLUMN public.payment_transactions.provider_fee IS 'PAYUNi 金流手續費（TradeFee，交易查詢 DataSource=A 且 TradeStatus=1 時由 payuni-reconcile 回填）';

CREATE TABLE IF NOT EXISTS public.payuni_reconcile_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  completed boolean NOT NULL DEFAULT false,
  invocations integer NOT NULL DEFAULT 0,
  queried integer NOT NULL DEFAULT 0,
  matched integer NOT NULL DEFAULT 0,
  processing integer NOT NULL DEFAULT 0,
  status_fixed integer NOT NULL DEFAULT 0,
  query_errors integer NOT NULL DEFAULT 0,
  diff_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_tx_ids uuid[] NOT NULL DEFAULT '{}',
  note text,
  alert_sent_at timestamptz
);

COMMENT ON TABLE public.payuni_reconcile_runs IS
  'PAYUNi 每日對帳執行紀錄（每個台北日一筆，排程多次接續）。completed=false = 未查完。只有 service role 可存取。';

CREATE TABLE IF NOT EXISTS public.payuni_reconcile_diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.payuni_reconcile_runs(id),
  mer_trade_no text NOT NULL,
  order_id uuid,
  accommodation_id uuid,
  diff_type text NOT NULL CHECK (diff_type IN ('amount_mismatch', 'not_found', 'local_paid_remote_unpaid', 'refund_mismatch', 'status_fixed')),
  local_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  payuni_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  note text
);

CREATE UNIQUE INDEX IF NOT EXISTS payuni_reconcile_diffs_open_key
  ON public.payuni_reconcile_diffs (mer_trade_no, diff_type)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS payuni_reconcile_diffs_run_id_idx
  ON public.payuni_reconcile_diffs (run_id);
CREATE INDEX IF NOT EXISTS payuni_reconcile_diffs_accommodation_id_idx
  ON public.payuni_reconcile_diffs (accommodation_id);

COMMENT ON TABLE public.payuni_reconcile_diffs IS
  'PAYUNi 對帳差異明細。未解決時同一 mer_trade_no＋diff_type 只有一筆；status_fixed 寫入即已處理（resolved_by=system）。只有 service role 可存取。';

ALTER TABLE public.payuni_reconcile_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payuni_reconcile_diffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payuni_reconcile_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payuni_reconcile_diffs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.payuni_reconcile_runs TO service_role;
GRANT ALL ON TABLE public.payuni_reconcile_diffs TO service_role;

COMMIT;
