-- 1. KOL bonus editor whitelist
CREATE TABLE public.teamcommission_kol_bonus_editor_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teamcommission_kol_bonus_editor_whitelist_user_id_key UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teamcommission_kol_bonus_editor_whitelist TO authenticated;
GRANT ALL ON public.teamcommission_kol_bonus_editor_whitelist TO service_role;
ALTER TABLE public.teamcommission_kol_bonus_editor_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kol_bonus_editor_whitelist_select" ON public.teamcommission_kol_bonus_editor_whitelist
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "kol_bonus_editor_whitelist_write" ON public.teamcommission_kol_bonus_editor_whitelist
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

INSERT INTO public.teamcommission_kol_bonus_editor_whitelist (user_id) VALUES
  ('66b7a62a-e994-4c71-b86d-78a9ba8881ec'),
  ('b472ef53-b395-4d72-b5a0-ea8ed2642d47')
ON CONFLICT (user_id) DO NOTHING;

-- 2. helper function
CREATE OR REPLACE FUNCTION public.is_kol_bonus_editor(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teamcommission_kol_bonus_editor_whitelist w
    WHERE w.user_id = check_user_id
  );
$$;

-- 3. role bindings (append-only)
CREATE TABLE public.teamcommission_role_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_type text NOT NULL CHECK (role_type IN ('am_manager','closer_manager','kol_bonus_recipient')),
  member_id uuid NOT NULL REFERENCES public.team_member_profiles(id),
  effective_from date NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tc_role_bindings_type_eff ON public.teamcommission_role_bindings (role_type, effective_from DESC, created_at DESC);
GRANT SELECT, INSERT ON public.teamcommission_role_bindings TO authenticated;
GRANT ALL ON public.teamcommission_role_bindings TO service_role;
ALTER TABLE public.teamcommission_role_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tc_role_bindings_select" ON public.teamcommission_role_bindings
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));
CREATE POLICY "tc_role_bindings_insert" ON public.teamcommission_role_bindings
  FOR INSERT TO authenticated WITH CHECK (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  );

-- 4. shared revenue source whitelist (append-only)
CREATE TABLE public.teamcommission_shared_revenue_source_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  included_order_sources text[] NOT NULL DEFAULT '{}',
  effective_from date NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tc_shared_src_eff ON public.teamcommission_shared_revenue_source_whitelist (effective_from DESC, created_at DESC);
GRANT SELECT, INSERT ON public.teamcommission_shared_revenue_source_whitelist TO authenticated;
GRANT ALL ON public.teamcommission_shared_revenue_source_whitelist TO service_role;
ALTER TABLE public.teamcommission_shared_revenue_source_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tc_shared_src_select" ON public.teamcommission_shared_revenue_source_whitelist
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));
CREATE POLICY "tc_shared_src_insert" ON public.teamcommission_shared_revenue_source_whitelist
  FOR INSERT TO authenticated WITH CHECK (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  );

-- 5. kol revenue source whitelist (append-only)
CREATE TABLE public.teamcommission_kol_revenue_source_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  included_order_sources text[] NOT NULL DEFAULT '{}',
  effective_from date NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tc_kol_src_eff ON public.teamcommission_kol_revenue_source_whitelist (effective_from DESC, created_at DESC);
GRANT SELECT, INSERT ON public.teamcommission_kol_revenue_source_whitelist TO authenticated;
GRANT ALL ON public.teamcommission_kol_revenue_source_whitelist TO service_role;
ALTER TABLE public.teamcommission_kol_revenue_source_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tc_kol_src_select" ON public.teamcommission_kol_revenue_source_whitelist
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));
CREATE POLICY "tc_kol_src_insert" ON public.teamcommission_kol_revenue_source_whitelist
  FOR INSERT TO authenticated WITH CHECK (public.is_kol_bonus_editor(auth.uid()));

-- 6. bonus rate settings (append-only)
CREATE TABLE public.teamcommission_bonus_rate_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_type text NOT NULL CHECK (bonus_type IN ('am_performance','closer_performance','am_manager','closer_manager','kol_commission','kol_monthly','venue_closing')),
  rate numeric,
  fixed_amount numeric,
  effective_from date NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tc_bonus_rate_type_eff ON public.teamcommission_bonus_rate_settings (bonus_type, effective_from DESC, created_at DESC);
GRANT SELECT, INSERT ON public.teamcommission_bonus_rate_settings TO authenticated;
GRANT ALL ON public.teamcommission_bonus_rate_settings TO service_role;
ALTER TABLE public.teamcommission_bonus_rate_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tc_bonus_rate_select" ON public.teamcommission_bonus_rate_settings
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));
CREATE POLICY "tc_bonus_rate_insert" ON public.teamcommission_bonus_rate_settings
  FOR INSERT TO authenticated WITH CHECK (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  );

-- 7. owner_settlement_pricing_rules new column
ALTER TABLE public.owner_settlement_pricing_rules
  ADD COLUMN IF NOT EXISTS charges_marketing_fee boolean NOT NULL DEFAULT false;