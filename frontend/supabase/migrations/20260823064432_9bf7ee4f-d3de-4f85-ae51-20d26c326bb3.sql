CREATE TABLE public.performance_notification_source_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  source text NOT NULL,
  included boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_by_email text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_notification_source_rules TO authenticated;
GRANT ALL ON public.performance_notification_source_rules TO service_role;

ALTER TABLE public.performance_notification_source_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY perf_source_rules_select ON public.performance_notification_source_rules
  FOR SELECT TO authenticated
  USING (public.user_has_any_team_role(auth.uid()));

CREATE POLICY perf_source_rules_write ON public.performance_notification_source_rules
  FOR ALL TO authenticated
  USING (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'am'::app_role)
  )
  WITH CHECK (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'am'::app_role)
  );

CREATE UNIQUE INDEX perf_source_rules_uniq
  ON public.performance_notification_source_rules (accommodation_id, source);

CREATE TRIGGER trg_perf_source_rules_updated_at
  BEFORE UPDATE ON public.performance_notification_source_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.performance_notification_source_rule_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  user_id uuid,
  user_email text,
  user_name text,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.performance_notification_source_rule_logs TO authenticated;
GRANT ALL ON public.performance_notification_source_rule_logs TO service_role;

ALTER TABLE public.performance_notification_source_rule_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY perf_source_rule_logs_select ON public.performance_notification_source_rule_logs
  FOR SELECT TO authenticated
  USING (public.user_has_any_team_role(auth.uid()));

CREATE POLICY perf_source_rule_logs_insert ON public.performance_notification_source_rule_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'am'::app_role)
  );

CREATE INDEX perf_source_rule_logs_acc_idx
  ON public.performance_notification_source_rule_logs (accommodation_id, created_at DESC);