
-- 點數平台合作夥伴設定表
CREATE TABLE public.points_platform_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name TEXT NOT NULL,
  platform_code TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  point_to_currency_rate NUMERIC NOT NULL DEFAULT 1.0,
  webhook_url TEXT,
  webhook_secret TEXT,
  contact_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 點數交易記錄表
CREATE TABLE public.point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.points_platform_partners(id),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deduct', 'refund')),
  points_amount INTEGER NOT NULL,
  currency_amount INTEGER NOT NULL,
  external_user_id TEXT NOT NULL,
  external_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.points_platform_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;

-- 只允許 super_admin 查看合作夥伴設定
CREATE POLICY "Super admins can manage partners"
  ON public.points_platform_partners
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 只允許 super_admin 和相關住宿管理員查看交易記錄
CREATE POLICY "Admins can view point transactions"
  ON public.point_transactions
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.user_roles ur ON ur.accommodation_id = o.accommodation_id
      WHERE o.id = point_transactions.order_id
        AND ur.user_id = auth.uid()
    )
  );

-- Updated at triggers
CREATE TRIGGER update_points_platform_partners_updated_at
  BEFORE UPDATE ON public.points_platform_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_point_transactions_updated_at
  BEFORE UPDATE ON public.point_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
