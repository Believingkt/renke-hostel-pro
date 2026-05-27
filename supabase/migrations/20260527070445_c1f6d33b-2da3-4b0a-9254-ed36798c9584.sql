CREATE TABLE IF NOT EXISTS public.kol_venue_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_name text NOT NULL,
  group_name text NOT NULL,
  calc_type text NOT NULL CHECK (calc_type IN ('每日', '每週')),
  daily_limit integer NOT NULL DEFAULT 1,
  collab_start date,
  collab_end date,
  allowed_weekdays integer[] NOT NULL DEFAULT '{}',
  special_start date,
  special_end date,
  special_limit integer,
  special_weekdays integer[],
  monthly_limit integer,
  link_rule text,
  order_number_rule text,
  is_active boolean DEFAULT true,
  is_starlink boolean DEFAULT false,
  personal_target integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_venue_settings TO authenticated;
GRANT ALL ON public.kol_venue_settings TO service_role;

ALTER TABLE public.kol_venue_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read kol_venue_settings"
ON public.kol_venue_settings FOR SELECT
TO authenticated USING (true);

CREATE POLICY "manager can manage kol_venue_settings"
ON public.kol_venue_settings FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role, 'scout_manager'::app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role, 'scout_manager'::app_role)
  )
);

CREATE TRIGGER update_kol_venue_settings_updated_at
BEFORE UPDATE ON public.kol_venue_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.kol_venue_link_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_name text NOT NULL UNIQUE,
  rule_code text NOT NULL,
  is_active boolean DEFAULT true,
  website_type text,
  cid_rule text,
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_venue_link_rules TO authenticated;
GRANT ALL ON public.kol_venue_link_rules TO service_role;

ALTER TABLE public.kol_venue_link_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read kol_venue_link_rules"
ON public.kol_venue_link_rules FOR SELECT
TO authenticated USING (true);

CREATE POLICY "manager can manage kol_venue_link_rules"
ON public.kol_venue_link_rules FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role, 'scout_manager'::app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role, 'scout_manager'::app_role)
  )
);