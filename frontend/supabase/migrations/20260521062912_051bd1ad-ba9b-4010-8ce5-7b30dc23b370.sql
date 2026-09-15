
-- 段一
CREATE TABLE IF NOT EXISTS public.scout_team_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id),
  target_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, month, accommodation_id)
);
ALTER TABLE public.scout_team_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_targets_select" ON public.scout_team_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "team_targets_write" ON public.scout_team_targets FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role) OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role));

CREATE TABLE IF NOT EXISTS public.scout_monthly_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  scout_id UUID NOT NULL REFERENCES public.team_member_profiles(user_id),
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id),
  target_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, month, scout_id, accommodation_id)
);
ALTER TABLE public.scout_monthly_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_targets_select" ON public.scout_monthly_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "monthly_targets_write" ON public.scout_monthly_targets FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role) OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role));

-- 段二
CREATE TABLE IF NOT EXISTS public.order_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  accommodation_id UUID REFERENCES public.accommodation_info(id),
  closer_id UUID REFERENCES public.team_member_profiles(user_id),
  video_creator_id UUID REFERENCES public.team_member_profiles(user_id),
  scout_id UUID REFERENCES public.team_member_profiles(user_id),
  influencer_cid TEXT,
  traffic_source TEXT,
  booking_method TEXT,
  ad_id TEXT,
  is_excluded BOOLEAN DEFAULT false,
  exclusion_note TEXT,
  import_source TEXT DEFAULT 'manual',
  kol_commission_only BOOLEAN DEFAULT false,
  filled_by UUID REFERENCES public.team_member_profiles(user_id),
  filled_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id)
);
ALTER TABLE public.order_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_meta_select" ON public.order_meta FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_meta_insert" ON public.order_meta FOR INSERT TO authenticated
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'closer'::app_role)
  OR public.user_has_team_role(auth.uid(), 'scout'::app_role)
  OR public.user_has_team_role(auth.uid(), 'video'::app_role)
  OR public.user_has_team_role(auth.uid(), 'franchise'::app_role)
);
CREATE POLICY "order_meta_update" ON public.order_meta FOR UPDATE TO authenticated
USING (filled_by = auth.uid() OR public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));

-- 段三
CREATE TABLE IF NOT EXISTS public.accommodation_commission_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id),
  role TEXT NOT NULL,
  rate NUMERIC(6,5) NOT NULL,
  effective_from DATE NOT NULL,
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.accommodation_commission_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commission_settings_select" ON public.accommodation_commission_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "commission_settings_write" ON public.accommodation_commission_settings FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.common_ad_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.common_ad_ids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "common_ad_ids_select" ON public.common_ad_ids FOR SELECT TO authenticated USING (true);
CREATE POLICY "common_ad_ids_write" ON public.common_ad_ids FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role) OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role));

CREATE TABLE IF NOT EXISTS public.ad_video_creator_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  video_creator_id UUID NOT NULL REFERENCES public.team_member_profiles(user_id),
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.ad_video_creator_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_rules_select" ON public.ad_video_creator_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "ad_rules_write" ON public.ad_video_creator_rules FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role) OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role));

-- 段四
CREATE TABLE IF NOT EXISTS public.order_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id),
  order_meta_id UUID REFERENCES public.order_meta(id),
  member_id UUID NOT NULL REFERENCES public.team_member_profiles(user_id),
  role TEXT NOT NULL,
  base_amount NUMERIC NOT NULL,
  rate_snapshot NUMERIC(6,5),
  amount NUMERIC NOT NULL,
  multiplier_applied NUMERIC(5,2) DEFAULT 1.0,
  multiplier_reason TEXT,
  rate_effective_from DATE,
  payout_status TEXT DEFAULT 'pending',
  payout_date DATE,
  payout_rule_id UUID,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  locked_at TIMESTAMPTZ
);
ALTER TABLE public.order_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commissions_select" ON public.order_commissions FOR SELECT TO authenticated
USING (member_id = auth.uid() OR public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "commissions_write" ON public.order_commissions FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.commission_payout_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_type TEXT NOT NULL,
  rule_name TEXT,
  cycle_type TEXT DEFAULT 'bimonthly',
  payout_days INTEGER[],
  cutoff_description TEXT,
  settlement_offset_days INTEGER DEFAULT 0,
  effective_from DATE NOT NULL,
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.commission_payout_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payout_rules_select" ON public.commission_payout_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "payout_rules_write" ON public.commission_payout_rules FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));

-- 段五
CREATE TABLE IF NOT EXISTS public.scout_monthly_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  scout_id UUID NOT NULL REFERENCES public.team_member_profiles(user_id),
  base_salary NUMERIC DEFAULT 0,
  team_bonus NUMERIC DEFAULT 0,
  kol_commission NUMERIC DEFAULT 0,
  total_payout NUMERIC DEFAULT 0,
  individual_achieved BOOLEAN,
  team_achieved BOOLEAN,
  base_salary_rule JSONB,
  team_bonus_rule JSONB,
  kol_commission_rate NUMERIC(6,5),
  individual_target_snapshot JSONB,
  team_target_snapshot JSONB,
  multiplier_applied NUMERIC(5,2) DEFAULT 1.0,
  multiplier_reason TEXT,
  data_source TEXT DEFAULT 'system_calculated',
  import_note TEXT,
  payout_status TEXT DEFAULT 'pending',
  payout_date DATE,
  locked_at TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, month, scout_id)
);
ALTER TABLE public.scout_monthly_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scout_payouts_select" ON public.scout_monthly_payouts FOR SELECT TO authenticated
USING (scout_id = auth.uid() OR public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "scout_payouts_write" ON public.scout_monthly_payouts FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.scout_tier_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name TEXT NOT NULL,
  min_count INTEGER NOT NULL,
  max_count INTEGER,
  commission_rate NUMERIC(6,5) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  effective_from DATE NOT NULL,
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.scout_tier_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tier_settings_select" ON public.scout_tier_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "tier_settings_write" ON public.scout_tier_settings FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.scout_salary_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_salary NUMERIC NOT NULL DEFAULT 3000,
  team_bonus NUMERIC NOT NULL DEFAULT 2000,
  team_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 50,
  effective_from DATE NOT NULL,
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.scout_salary_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "salary_settings_select" ON public.scout_salary_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "salary_settings_write" ON public.scout_salary_settings FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));

-- 段六
CREATE TABLE IF NOT EXISTS public.franchise_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  accommodation_type TEXT,
  plan_name TEXT,
  plan_price NUMERIC NOT NULL,
  quantity INTEGER DEFAULT 1,
  sold_by UUID NOT NULL REFERENCES public.team_member_profiles(user_id),
  team_leader UUID REFERENCES public.team_member_profiles(user_id),
  commission_rate NUMERIC(6,5),
  leader_rate NUMERIC(6,5),
  company_rate NUMERIC(6,5),
  commission_amount NUMERIC,
  leader_amount NUMERIC,
  company_amount NUMERIC,
  multiplier_applied NUMERIC(5,2) DEFAULT 1.0,
  multiplier_reason TEXT,
  sold_at DATE,
  payment_confirmed BOOLEAN DEFAULT false,
  payment_at DATE,
  settled_at DATE,
  payout_date DATE,
  payout_status TEXT DEFAULT 'pending',
  contract_uploaded BOOLEAN DEFAULT false,
  invoice_number TEXT,
  notes TEXT,
  import_source TEXT DEFAULT 'manual',
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.franchise_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "franchise_orders_select" ON public.franchise_orders FOR SELECT TO authenticated
USING (sold_by = auth.uid() OR public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "franchise_orders_insert" ON public.franchise_orders FOR INSERT TO authenticated
WITH CHECK (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role) OR public.user_has_team_role(auth.uid(), 'franchise'::app_role));

CREATE TABLE IF NOT EXISTS public.franchise_plan_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  accommodation_type TEXT,
  effective_from DATE NOT NULL,
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.franchise_plan_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "franchise_plan_select" ON public.franchise_plan_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "franchise_plan_write" ON public.franchise_plan_settings FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));

-- 段七
CREATE TABLE IF NOT EXISTS public.starlink_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  client_tax_id TEXT,
  business_type TEXT,
  plan_name TEXT,
  plan_price NUMERIC NOT NULL,
  sold_by UUID NOT NULL REFERENCES public.team_member_profiles(user_id),
  level_at_sale TEXT,
  commission_rate NUMERIC(6,5),
  commission_amount NUMERIC,
  multiplier_applied NUMERIC(5,2) DEFAULT 1.0,
  multiplier_reason TEXT,
  sold_at DATE,
  settlement_date DATE,
  payout_date DATE,
  payout_status TEXT DEFAULT 'pending',
  contract_uploaded BOOLEAN DEFAULT false,
  payment_confirmed BOOLEAN DEFAULT false,
  payment_last5 TEXT,
  invoice_number TEXT,
  notes TEXT,
  import_source TEXT DEFAULT 'manual',
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.starlink_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "starlink_orders_select" ON public.starlink_orders FOR SELECT TO authenticated
USING (sold_by = auth.uid() OR public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "starlink_orders_insert" ON public.starlink_orders FOR INSERT TO authenticated
WITH CHECK (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role) OR public.user_has_team_role(auth.uid(), 'starlink'::app_role));

CREATE TABLE IF NOT EXISTS public.starlink_tier_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL,
  tier_name TEXT NOT NULL,
  min_count INTEGER NOT NULL,
  max_count INTEGER,
  signup_bonus_rate NUMERIC(6,5),
  per_order_rate NUMERIC(6,5),
  sort_order INTEGER DEFAULT 0,
  effective_from DATE NOT NULL,
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.starlink_tier_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "starlink_tier_select" ON public.starlink_tier_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "starlink_tier_write" ON public.starlink_tier_settings FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));

-- 段八
CREATE TABLE IF NOT EXISTS public.meta_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT UNIQUE NOT NULL,
  ad_name TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  status TEXT,
  start_date DATE,
  stop_date DATE,
  created_time DATE,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.meta_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_ads_select" ON public.meta_ads FOR SELECT TO authenticated USING (true);
CREATE POLICY "meta_ads_write" ON public.meta_ads FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role));

CREATE TABLE IF NOT EXISTS public.meta_ad_weekly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  status TEXT,
  date_range TEXT NOT NULL,
  spend NUMERIC DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  msg_started INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, date_range)
);
ALTER TABLE public.meta_ad_weekly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_ad_weekly_select" ON public.meta_ad_weekly FOR SELECT TO authenticated USING (true);
CREATE POLICY "meta_ad_weekly_write" ON public.meta_ad_weekly FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role));

-- 段九
CREATE TABLE IF NOT EXISTS public.accommodation_info_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  has_franchise BOOLEAN DEFAULT false,
  has_starlink BOOLEAN DEFAULT false,
  updated_by UUID REFERENCES public.team_member_profiles(user_id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(accommodation_id)
);
ALTER TABLE public.accommodation_info_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accommodation_flags_select" ON public.accommodation_info_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY "accommodation_flags_write" ON public.accommodation_info_flags FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.performance_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  notify_time TEXT DEFAULT '23:30',
  show_general_booking BOOLEAN DEFAULT true,
  general_booking_target NUMERIC DEFAULT 400000,
  show_franchise_sales BOOLEAN DEFAULT false,
  franchise_sales_target NUMERIC,
  franchise_sales_year_target NUMERIC,
  show_franchise_booking BOOLEAN DEFAULT false,
  franchise_booking_target NUMERIC,
  show_starlink BOOLEAN DEFAULT false,
  starlink_target NUMERIC,
  email_template TEXT,
  updated_by UUID REFERENCES public.team_member_profiles(user_id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(accommodation_id)
);
ALTER TABLE public.performance_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_settings_select" ON public.performance_notification_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "notification_settings_write" ON public.performance_notification_settings FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.external_order_import_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name TEXT NOT NULL,
  accommodation_id UUID REFERENCES public.accommodation_info(id),
  field_mapping JSONB,
  last_import_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.team_member_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.external_order_import_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_settings_select" ON public.external_order_import_settings FOR SELECT TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "import_settings_write" ON public.external_order_import_settings FOR ALL TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));
