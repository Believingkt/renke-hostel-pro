-- ============================================================
-- PAYUNi W9：人客多平台費（多功能收付 agent_fee）— 只新增兩張表，不改既有表／資料
--   payuni_platform_fee_batches：每月一批（period = YYYY-MM），同一 period 只允許一個非 cancelled 的批次
--     status：draft → confirmed → submitting → submitted／partial_failed → settled；draft／confirmed 可 cancelled
--   payuni_platform_fee_items：每館一列（bal_type 1＝正向扣款；bal_type 2＝負向修正，同批每館各一筆）
--     status：pending → sent → funded；送出失敗 failed → 可轉 receivable；金額改 0 或批次取消 → cancelled
--     detail：計算明細快照（訂單清單與各自金額、混合付款、當月 PAYUNi 退款、Ragic 算法參考、人工調整紀錄）
--   RLS：兩張表都只有 super_admin 可讀；寫入只經 edge function（service role）；民宿端經 action:"my_items" 讀
--   accommodation_id 不設外鍵；items.batch_id → batches.id 為兩張新表之間的外鍵
-- 鎖與逾時：整支 BEGIN/COMMIT；lock_timeout 3s；只建新物件；RLS 已開就不再 ALTER（重跑免 ACCESS EXCLUSIVE）
-- 重跑安全：CREATE TABLE／INDEX IF NOT EXISTS；policy 先查 pg_policies 再建
-- rollback：docs/payuni-w9/rollback_20261024090000.sql
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.payuni_platform_fee_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'submitting', 'submitted', 'settled', 'partial_failed', 'cancelled')),
  created_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  submitted_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payuni_platform_fee_batches_period_active_key
  ON public.payuni_platform_fee_batches (period)
  WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS public.payuni_platform_fee_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.payuni_platform_fee_batches(id),
  accommodation_id uuid NOT NULL,
  mer_id text NOT NULL,
  base_amount numeric(14, 2) NOT NULL DEFAULT 0,
  rate numeric(8, 6) NOT NULL DEFAULT 0,
  amount integer NOT NULL CHECK (amount BETWEEN 0 AND 9999999),
  fee_type smallint NOT NULL CHECK (fee_type BETWEEN 1 AND 9),
  bal_type smallint NOT NULL CHECK (bal_type IN (1, 2)),
  trade_no text NOT NULL CHECK (char_length(trade_no) BETWEEN 1 AND 20),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  api_status text,
  api_message text,
  fund_date date,
  payuni_fee integer,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'funded', 'receivable', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payuni_platform_fee_items_batch_acc_bal_key UNIQUE (batch_id, accommodation_id, bal_type)
);

CREATE INDEX IF NOT EXISTS payuni_platform_fee_items_acc_idx
  ON public.payuni_platform_fee_items (accommodation_id);
CREATE INDEX IF NOT EXISTS payuni_platform_fee_items_open_idx
  ON public.payuni_platform_fee_items (status)
  WHERE status IN ('sent', 'failed');

COMMENT ON TABLE public.payuni_platform_fee_batches IS
  'PAYUNi 人客多平台費月批次（多功能收付 agent_fee）。super_admin 可讀，只有 service role 可寫。';
COMMENT ON TABLE public.payuni_platform_fee_items IS
  'PAYUNi 人客多平台費每館明細；detail 為計算快照。super_admin 可讀，只有 service role 可寫；民宿端經 payuni-platform-fee-run my_items 讀取。';
COMMENT ON COLUMN public.payuni_platform_fee_items.trade_no IS 'agent_fee TradeNo：LKZ{YYYYMM}{4 位館序}，負向修正加 N';
COMMENT ON COLUMN public.payuni_platform_fee_items.fund_date IS 'agent_fee_query FundDate（0000-00-00＝尚未撥款，不寫入）';
COMMENT ON COLUMN public.payuni_platform_fee_items.payuni_fee IS 'agent_fee_query Fee（PAYUNi 1% 服務費，由人客多吸收）';

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payuni_platform_fee_batches'::regclass) THEN
    ALTER TABLE public.payuni_platform_fee_batches ENABLE ROW LEVEL SECURITY;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payuni_platform_fee_items'::regclass) THEN
    ALTER TABLE public.payuni_platform_fee_items ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

REVOKE ALL ON TABLE public.payuni_platform_fee_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payuni_platform_fee_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payuni_platform_fee_batches TO authenticated;
GRANT SELECT ON TABLE public.payuni_platform_fee_items TO authenticated;
GRANT ALL ON TABLE public.payuni_platform_fee_batches TO service_role;
GRANT ALL ON TABLE public.payuni_platform_fee_items TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'payuni_platform_fee_batches' AND policyname = 'payuni_platform_fee_batches_select_super_admin'
  ) THEN
    CREATE POLICY payuni_platform_fee_batches_select_super_admin ON public.payuni_platform_fee_batches
      FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'payuni_platform_fee_items' AND policyname = 'payuni_platform_fee_items_select_super_admin'
  ) THEN
    CREATE POLICY payuni_platform_fee_items_select_super_admin ON public.payuni_platform_fee_items
      FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
  END IF;
END $$;

COMMIT;
