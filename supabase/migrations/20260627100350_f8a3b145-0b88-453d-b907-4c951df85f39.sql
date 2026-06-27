
CREATE TABLE public.commission_payout_marks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  role_key text NOT NULL,
  member_id uuid REFERENCES public.team_member_profiles(id) ON DELETE SET NULL,
  payout_status text NOT NULL DEFAULT 'paid',
  payout_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Taipei')::date,
  marked_by uuid REFERENCES auth.users(id),
  marked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX commission_payout_marks_unique
  ON public.commission_payout_marks(source_table, source_id, role_key);
CREATE INDEX commission_payout_marks_member_idx
  ON public.commission_payout_marks(member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_payout_marks TO authenticated;
GRANT ALL ON public.commission_payout_marks TO service_role;

ALTER TABLE public.commission_payout_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payout_marks_select" ON public.commission_payout_marks
  FOR SELECT TO authenticated
  USING (
    user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_team_role(auth.uid(), 'admin'::app_role)
    OR user_has_team_role(auth.uid(), 'finance'::app_role)
    OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  );

CREATE POLICY "payout_marks_write" ON public.commission_payout_marks
  FOR ALL TO authenticated
  USING (
    user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_team_role(auth.uid(), 'admin'::app_role)
    OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  )
  WITH CHECK (
    user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_team_role(auth.uid(), 'admin'::app_role)
    OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  );

CREATE OR REPLACE FUNCTION public.touch_commission_payout_marks()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER commission_payout_marks_touch
  BEFORE UPDATE ON public.commission_payout_marks
  FOR EACH ROW EXECUTE FUNCTION public.touch_commission_payout_marks();
