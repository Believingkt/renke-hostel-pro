
CREATE TABLE public.franchise_monthly_distributions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  project_name text NOT NULL,
  unit_price numeric NOT NULL,
  payment_date date GENERATED ALWAYS AS (
    (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date
  ) STORED,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.franchise_monthly_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "franchise_manager and admin can manage"
ON public.franchise_monthly_distributions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::app_role, 'super_admin'::app_role, 'franchise_manager'::app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::app_role, 'super_admin'::app_role, 'franchise_manager'::app_role)
  )
);

CREATE TRIGGER update_franchise_monthly_distributions_updated_at
BEFORE UPDATE ON public.franchise_monthly_distributions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
