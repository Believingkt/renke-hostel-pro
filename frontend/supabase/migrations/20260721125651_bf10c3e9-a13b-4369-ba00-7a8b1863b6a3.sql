
CREATE TABLE public.closer_team_bonus_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_rate numeric NOT NULL,
  effective_from date NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT closer_team_bonus_settings_effective_from_unique UNIQUE (effective_from)
);
COMMENT ON TABLE public.closer_team_bonus_settings IS '成交組團獎比例設定，bonus_rate 存小數（0.2=20%），新增版本不刪舊資料';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closer_team_bonus_settings TO authenticated;
GRANT ALL ON public.closer_team_bonus_settings TO service_role;

ALTER TABLE public.closer_team_bonus_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bonus_settings_select_authenticated"
  ON public.closer_team_bonus_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "bonus_settings_insert_admin"
  ON public.closer_team_bonus_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_super());

INSERT INTO public.closer_team_bonus_settings (bonus_rate, effective_from, note)
VALUES (0.2, '2026-08-01', '初始設定 20%');

CREATE TABLE public.closer_team_bonus_distribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL,
  closer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_count integer NOT NULL DEFAULT 0,
  bonus_amount numeric NOT NULL DEFAULT 0,
  pool_total numeric NOT NULL DEFAULT 0,
  pool_total_count integer NOT NULL DEFAULT 0,
  is_finalized boolean NOT NULL DEFAULT false,
  finalized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT closer_team_bonus_distribution_ymc_unique UNIQUE (year, month, closer_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closer_team_bonus_distribution TO authenticated;
GRANT ALL ON public.closer_team_bonus_distribution TO service_role;

ALTER TABLE public.closer_team_bonus_distribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bonus_distribution_admin_all"
  ON public.closer_team_bonus_distribution FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY "bonus_distribution_closer_select_own"
  ON public.closer_team_bonus_distribution FOR SELECT TO authenticated
  USING (closer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_closer_team_bonus_distribution_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_closer_team_bonus_distribution_updated_at
  BEFORE UPDATE ON public.closer_team_bonus_distribution
  FOR EACH ROW EXECUTE FUNCTION public.update_closer_team_bonus_distribution_updated_at();
