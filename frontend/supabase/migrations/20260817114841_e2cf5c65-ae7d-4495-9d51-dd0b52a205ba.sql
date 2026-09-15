ALTER TABLE public.team_base_salaries DROP CONSTRAINT IF EXISTS team_base_salaries_user_id_salary_month_key;
DROP INDEX IF EXISTS public.idx_team_base_salaries_user_month;
ALTER TABLE public.team_base_salaries DROP COLUMN IF EXISTS salary_month;
ALTER TABLE public.team_base_salaries ADD COLUMN IF NOT EXISTS effective_from date NOT NULL DEFAULT (date_trunc('month', (now() AT TIME ZONE 'Asia/Taipei'))::date);
ALTER TABLE public.team_base_salaries ADD COLUMN IF NOT EXISTS created_by_email text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_base_salaries_user_eff ON public.team_base_salaries (user_id, effective_from);

DROP POLICY IF EXISTS "salary managers can update" ON public.team_base_salaries;
DROP POLICY IF EXISTS "salary managers can delete" ON public.team_base_salaries;

CREATE POLICY "salary managers can delete future versions"
  ON public.team_base_salaries FOR DELETE TO authenticated
  USING (public.is_team_salary_manager() AND effective_from > (now() AT TIME ZONE 'Asia/Taipei')::date);