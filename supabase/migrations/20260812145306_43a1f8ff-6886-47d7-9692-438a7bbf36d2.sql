-- =========================================================
-- 1. 團購活動
-- =========================================================
CREATE TABLE public.group_buy_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description_html TEXT,
  cover_image_url TEXT,
  gallery_urls TEXT[] NOT NULL DEFAULT '{}',
  kol_profile_id UUID REFERENCES public.kol_profiles(id) ON DELETE SET NULL,
  kol_display_name TEXT,
  discount_code_id UUID REFERENCES public.discount_codes(id) ON DELETE SET NULL,
  discount_code TEXT,
  sale_start TIMESTAMPTZ,
  sale_end TIMESTAMPTZ,
  stay_start_date DATE,
  stay_end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','ended')),
  deposit_percentage INTEGER NOT NULL DEFAULT 30 CHECK (deposit_percentage > 0 AND deposit_percentage <= 100),
  payment_deadline_hours INTEGER NOT NULL DEFAULT 72 CHECK (payment_deadline_hours > 0),
  counts_owner_settlement BOOLEAN NOT NULL DEFAULT true,
  commission_rate NUMERIC NOT NULL DEFAULT 0 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  commission_note TEXT,
  public_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  contact_note TEXT,
  terms_html TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gb_campaigns_accommodation ON public.group_buy_campaigns(accommodation_id);
CREATE INDEX idx_gb_campaigns_status ON public.group_buy_campaigns(status);

GRANT SELECT ON public.group_buy_campaigns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_buy_campaigns TO authenticated;
GRANT ALL ON public.group_buy_campaigns TO service_role;

ALTER TABLE public.group_buy_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active campaigns"
ON public.group_buy_campaigns FOR SELECT
USING (status = 'active');

CREATE POLICY "Managers can view own campaigns"
ON public.group_buy_campaigns FOR SELECT TO authenticated
USING (public.is_admin_or_super() OR public.is_hotel_admin_of(accommodation_id));

CREATE POLICY "Managers can insert campaigns"
ON public.group_buy_campaigns FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_super() OR public.is_hotel_admin_of(accommodation_id));

CREATE POLICY "Managers can update campaigns"
ON public.group_buy_campaigns FOR UPDATE TO authenticated
USING (public.is_admin_or_super() OR public.is_hotel_admin_of(accommodation_id))
WITH CHECK (public.is_admin_or_super() OR public.is_hotel_admin_of(accommodation_id));

CREATE POLICY "Managers can delete campaigns"
ON public.group_buy_campaigns FOR DELETE TO authenticated
USING (public.is_admin_or_super() OR public.is_hotel_admin_of(accommodation_id));

CREATE TRIGGER trg_gb_campaigns_updated_at
BEFORE UPDATE ON public.group_buy_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2. 團購方案
-- =========================================================
CREATE TABLE public.group_buy_campaign_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.group_buy_campaigns(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.accommodation_packages(id) ON DELETE CASCADE,
  room_type_id UUID REFERENCES public.room_types(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  group_buy_price NUMERIC NOT NULL CHECK (group_buy_price >= 0),
  original_price NUMERIC,
  max_quantity INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gb_pkg_target_required CHECK (package_id IS NOT NULL OR room_type_id IS NOT NULL)
);
CREATE INDEX idx_gb_campaign_packages_campaign ON public.group_buy_campaign_packages(campaign_id);

GRANT SELECT ON public.group_buy_campaign_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_buy_campaign_packages TO authenticated;
GRANT ALL ON public.group_buy_campaign_packages TO service_role;

ALTER TABLE public.group_buy_campaign_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view packages of active campaigns"
ON public.group_buy_campaign_packages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = campaign_id AND c.status = 'active'
));

CREATE POLICY "Managers can manage campaign packages"
ON public.group_buy_campaign_packages FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = campaign_id
    AND (public.is_admin_or_super() OR public.is_hotel_admin_of(c.accommodation_id))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = campaign_id
    AND (public.is_admin_or_super() OR public.is_hotel_admin_of(c.accommodation_id))
));

CREATE TRIGGER trg_gb_campaign_packages_updated_at
BEFORE UPDATE ON public.group_buy_campaign_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 3. 收款帳戶（不開放 anon）
-- =========================================================
CREATE TABLE public.group_buy_bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.group_buy_campaigns(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  bank_code TEXT,
  branch_name TEXT,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  note TEXT,
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gb_bank_accounts_campaign ON public.group_buy_bank_accounts(campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_buy_bank_accounts TO authenticated;
GRANT ALL ON public.group_buy_bank_accounts TO service_role;

ALTER TABLE public.group_buy_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage bank accounts"
ON public.group_buy_bank_accounts FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = campaign_id
    AND (public.is_admin_or_super() OR public.is_hotel_admin_of(c.accommodation_id))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = campaign_id
    AND (public.is_admin_or_super() OR public.is_hotel_admin_of(c.accommodation_id))
));

CREATE TRIGGER trg_gb_bank_accounts_updated_at
BEFORE UPDATE ON public.group_buy_bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 4. 團購佣金
-- =========================================================
CREATE TABLE public.group_buy_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.group_buy_campaigns(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kol_profile_id UUID REFERENCES public.kol_profiles(id) ON DELETE SET NULL,
  revenue_base NUMERIC NOT NULL DEFAULT 0,
  commission_rate NUMERIC NOT NULL DEFAULT 0,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','void')),
  settled_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);
CREATE INDEX idx_gb_commissions_campaign ON public.group_buy_commissions(campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_buy_commissions TO authenticated;
GRANT ALL ON public.group_buy_commissions TO service_role;

ALTER TABLE public.group_buy_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage group buy commissions"
ON public.group_buy_commissions FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = campaign_id
    AND (public.is_admin_or_super() OR public.is_hotel_admin_of(c.accommodation_id))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = campaign_id
    AND (public.is_admin_or_super() OR public.is_hotel_admin_of(c.accommodation_id))
));

CREATE TRIGGER trg_gb_commissions_updated_at
BEFORE UPDATE ON public.group_buy_commissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 5. 對帳軌跡（append-only）
-- =========================================================
CREATE TABLE public.group_buy_payment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.group_buy_campaigns(id) ON DELETE SET NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('guest_reported','admin_confirmed','expired','cancelled','note')),
  amount NUMERIC,
  account_last5 TEXT,
  transferred_at TIMESTAMPTZ,
  actor_user_id UUID,
  actor_label TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gb_payment_events_order ON public.group_buy_payment_events(order_id);

GRANT SELECT, INSERT ON public.group_buy_payment_events TO authenticated;
GRANT ALL ON public.group_buy_payment_events TO service_role;

ALTER TABLE public.group_buy_payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view payment events"
ON public.group_buy_payment_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = campaign_id
    AND (public.is_admin_or_super() OR public.is_hotel_admin_of(c.accommodation_id))
));

CREATE POLICY "Managers can insert payment events"
ON public.group_buy_payment_events FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = campaign_id
    AND (public.is_admin_or_super() OR public.is_hotel_admin_of(c.accommodation_id))
));

-- =========================================================
-- 6. 團購訂單不進現有團隊分潤基準
-- =========================================================
CREATE OR REPLACE FUNCTION public.calc_team_commission_price(_order_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN o.order_source = 'group_buy' THEN 0
    ELSE GREATEST(
      0,
      COALESCE(o.final_price, 0) - COALESCE((
        SELECT SUM(COALESCE((elem->>'total')::numeric, 0))
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(o.custom_addon_details) = 'array'
               THEN o.custom_addon_details ELSE '[]'::jsonb END
        ) AS elem
      ), 0)
    )
  END
  FROM public.orders o
  WHERE o.id = _order_id;
$function$;