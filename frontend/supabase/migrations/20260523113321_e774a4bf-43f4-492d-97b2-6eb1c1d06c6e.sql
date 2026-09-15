CREATE TABLE public.franchise_commission_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('internal', 'external')),
  project_name text NOT NULL DEFAULT '森山第一期',
  base_rate numeric DEFAULT 0.10,
  tier1_rate numeric DEFAULT 0.11,
  tier2_rate numeric DEFAULT 0.13,
  leader_supplement_rate numeric DEFAULT 0,
  company_rate numeric DEFAULT 0.035,
  sales_rate numeric DEFAULT 0.20,
  co_sales1_rate numeric DEFAULT 0.10,
  co_sales2_rate numeric DEFAULT 0.15,
  payout_day text DEFAULT '10',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.franchise_commission_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can all" ON public.franchise_commission_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
      AND accommodation_id IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
      AND accommodation_id IS NULL
    )
  );

CREATE POLICY "authenticated can read" ON public.franchise_commission_settings
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.franchise_commission_settings
  (type, project_name, base_rate, tier1_rate, tier2_rate,
   leader_supplement_rate, company_rate, payout_day, effective_from)
VALUES
  ('internal', '森山第一期', 0.10, 0.11, 0.13, 0, 0.035, '10,25', '2025-01-01');

INSERT INTO public.franchise_commission_settings
  (type, project_name, sales_rate, co_sales1_rate, co_sales2_rate,
   payout_day, effective_from)
VALUES
  ('external', '森山第一期', 0.20, 0.10, 0.15, '10', '2025-01-01');