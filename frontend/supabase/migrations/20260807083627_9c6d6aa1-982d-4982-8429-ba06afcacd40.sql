CREATE TABLE public.accommodation_partnership_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date,
  bonus_policy text NOT NULL DEFAULT 'full',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accommodation_partnership_periods_policy_chk CHECK (bonus_policy IN ('full','none')),
  CONSTRAINT accommodation_partnership_periods_range_chk CHECK (end_date IS NULL OR end_date >= start_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_partnership_periods TO authenticated;
GRANT ALL ON public.accommodation_partnership_periods TO service_role;

ALTER TABLE public.accommodation_partnership_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partnership_periods_select_authenticated"
ON public.accommodation_partnership_periods FOR SELECT TO authenticated USING (true);

CREATE POLICY "partnership_periods_write_admin"
ON public.accommodation_partnership_periods FOR ALL TO authenticated
USING (public.is_admin_or_super())
WITH CHECK (public.is_admin_or_super());

CREATE INDEX idx_partnership_periods_acc ON public.accommodation_partnership_periods(accommodation_id, start_date);

CREATE OR REPLACE FUNCTION public.check_partnership_period_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.accommodation_partnership_periods p
    WHERE p.accommodation_id = NEW.accommodation_id
      AND p.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND daterange(p.start_date, COALESCE(p.end_date, 'infinity'::date), '[]')
          && daterange(NEW.start_date, COALESCE(NEW.end_date, 'infinity'::date), '[]')
  ) THEN
    RAISE EXCEPTION '合作期間與既有期間重疊（館別 %）', NEW.accommodation_id;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_partnership_period_overlap
BEFORE INSERT OR UPDATE ON public.accommodation_partnership_periods
FOR EACH ROW EXECUTE FUNCTION public.check_partnership_period_overlap();

ALTER TABLE public.team_member_profiles ADD COLUMN IF NOT EXISTS resigned_at date;