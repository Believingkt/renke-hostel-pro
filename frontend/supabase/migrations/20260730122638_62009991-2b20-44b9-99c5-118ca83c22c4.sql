-- 業主月結門檻式收費規則（append-only 版本控管）
-- 設計說明：本表不設 unique constraint，同館別同月份可有多筆。
-- 查詢邏輯：取 accommodation_id = ? AND effective_from <= 目標月份月初，
--          依 effective_from DESC, created_at DESC 取第一筆為當期生效規則。
-- 僅允許 INSERT（無 UPDATE / DELETE policy），確保歷史月份規則不可竄改。
CREATE TABLE public.owner_settlement_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  commission_rate numeric NOT NULL,
  commission_threshold numeric NOT NULL DEFAULT 0,
  marketing_fee_low numeric NOT NULL DEFAULT 0,
  marketing_fee_high numeric NOT NULL DEFAULT 0,
  marketing_fee_threshold numeric NOT NULL DEFAULT 0,
  tier_rate_enabled boolean NOT NULL DEFAULT false,
  exempt_order_sources text[],
  revenue_breakdown_type text,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.owner_settlement_pricing_rules IS
  'Append-only 業主月結收費規則版本表。禁止 UPDATE/DELETE；查詢時取 effective_from <= 目標月份的最新一筆（effective_from DESC, created_at DESC）。';
COMMENT ON COLUMN public.owner_settlement_pricing_rules.effective_from IS '生效月份，一律存該月月初日期';
COMMENT ON COLUMN public.owner_settlement_pricing_rules.commission_rate IS '基礎抽成費率，小數存法（0.10 = 10%）';
COMMENT ON COLUMN public.owner_settlement_pricing_rules.commission_threshold IS '抽成門檻，僅超過門檻部分抽成；0 = 全額抽成無門檻';
COMMENT ON COLUMN public.owner_settlement_pricing_rules.marketing_fee_threshold IS '行銷推廣費門檻；0 = 恆用 marketing_fee_low';
COMMENT ON COLUMN public.owner_settlement_pricing_rules.tier_rate_enabled IS '費率隨門檻累進的功能開關，目前預留不啟用';

CREATE INDEX idx_ospr_acc_effective
  ON public.owner_settlement_pricing_rules (accommodation_id, effective_from DESC, created_at DESC);

GRANT SELECT, INSERT ON public.owner_settlement_pricing_rules TO authenticated;
GRANT ALL ON public.owner_settlement_pricing_rules TO service_role;

ALTER TABLE public.owner_settlement_pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view pricing rules"
  ON public.owner_settlement_pricing_rules
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_hotel_admin_of(accommodation_id)
  );

CREATE POLICY "Admins can insert current or future pricing rules"
  ON public.owner_settlement_pricing_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      public.is_super_admin(auth.uid())
      OR public.is_hotel_admin_of(accommodation_id)
    )
    AND effective_from >= date_trunc('month', (now() AT TIME ZONE 'Asia/Taipei'))::date
  );
