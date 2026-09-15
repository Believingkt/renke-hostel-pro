CREATE TABLE public.team_base_salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  salary_month text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, salary_month)
);

CREATE INDEX idx_team_base_salaries_user_month ON public.team_base_salaries (user_id, salary_month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_base_salaries TO authenticated;
GRANT ALL ON public.team_base_salaries TO service_role;

ALTER TABLE public.team_base_salaries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_team_salary_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::app_role, 'admin'::app_role)
  );
$$;

CREATE POLICY "salary managers can read all"
  ON public.team_base_salaries FOR SELECT TO authenticated
  USING (public.is_team_salary_manager() OR user_id = auth.uid());

CREATE POLICY "salary managers can insert"
  ON public.team_base_salaries FOR INSERT TO authenticated
  WITH CHECK (public.is_team_salary_manager());

CREATE POLICY "salary managers can update"
  ON public.team_base_salaries FOR UPDATE TO authenticated
  USING (public.is_team_salary_manager())
  WITH CHECK (public.is_team_salary_manager());

CREATE POLICY "salary managers can delete"
  ON public.team_base_salaries FOR DELETE TO authenticated
  USING (public.is_team_salary_manager());

CREATE TRIGGER update_team_base_salaries_updated_at
  BEFORE UPDATE ON public.team_base_salaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();