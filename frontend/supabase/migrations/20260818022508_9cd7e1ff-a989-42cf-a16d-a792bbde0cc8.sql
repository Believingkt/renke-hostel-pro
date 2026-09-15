CREATE TABLE public.performance_notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  name text NOT NULL,
  body text NOT NULL DEFAULT '',
  is_primary boolean NOT NULL DEFAULT false,
  include_modified_notice boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_notification_templates TO authenticated;
GRANT ALL ON public.performance_notification_templates TO service_role;

ALTER TABLE public.performance_notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY perf_templates_select ON public.performance_notification_templates
  FOR SELECT TO authenticated
  USING (public.user_has_any_team_role(auth.uid()));

CREATE POLICY perf_templates_write ON public.performance_notification_templates
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

CREATE UNIQUE INDEX perf_templates_one_primary
  ON public.performance_notification_templates (accommodation_id)
  WHERE is_primary;

CREATE INDEX perf_templates_acc_idx
  ON public.performance_notification_templates (accommodation_id, display_order);

CREATE TRIGGER trg_perf_templates_updated_at
  BEFORE UPDATE ON public.performance_notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 回填：每個既有通報設定 → 一份「完整版」模板
INSERT INTO public.performance_notification_templates (accommodation_id, name, body, is_primary, display_order)
SELECT s.accommodation_id, '完整版（Email）', COALESCE(s.email_template, ''), true, 0
FROM public.performance_notification_settings s;

ALTER TABLE public.line_push_targets
  ADD COLUMN performance_template_id uuid REFERENCES public.performance_notification_templates(id) ON DELETE SET NULL;