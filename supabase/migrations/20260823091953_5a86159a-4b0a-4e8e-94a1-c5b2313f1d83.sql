CREATE TABLE public.venue_team_bonus_tier_rule_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid,
  accommodation_id uuid,
  bonus_type text NOT NULL,
  effective_from date,
  action text NOT NULL,
  actor_id uuid,
  actor_email text,
  tiers_before jsonb,
  tiers_after jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vtbtrl_rule ON public.venue_team_bonus_tier_rule_logs(rule_id);
CREATE INDEX idx_vtbtrl_acc ON public.venue_team_bonus_tier_rule_logs(accommodation_id, bonus_type);

GRANT SELECT ON public.venue_team_bonus_tier_rule_logs TO authenticated;
GRANT ALL ON public.venue_team_bonus_tier_rule_logs TO service_role;

ALTER TABLE public.venue_team_bonus_tier_rule_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team members can read venue tier rule logs"
ON public.venue_team_bonus_tier_rule_logs FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.log_venue_team_bonus_tier_rule_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_uid uuid := auth.uid();
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  IF (TG_OP = 'DELETE') THEN
    INSERT INTO public.venue_team_bonus_tier_rule_logs
      (rule_id, accommodation_id, bonus_type, effective_from, action, actor_id, actor_email, tiers_before, tiers_after, note)
    VALUES (OLD.id, OLD.accommodation_id, OLD.bonus_type, OLD.effective_from, 'delete', v_uid, v_email, OLD.tiers, NULL, OLD.note);
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.venue_team_bonus_tier_rule_logs
      (rule_id, accommodation_id, bonus_type, effective_from, action, actor_id, actor_email, tiers_before, tiers_after, note)
    VALUES (NEW.id, NEW.accommodation_id, NEW.bonus_type, NEW.effective_from, 'update', v_uid, v_email, OLD.tiers, NEW.tiers, NEW.note);
    RETURN NEW;
  ELSE
    INSERT INTO public.venue_team_bonus_tier_rule_logs
      (rule_id, accommodation_id, bonus_type, effective_from, action, actor_id, actor_email, tiers_before, tiers_after, note)
    VALUES (NEW.id, NEW.accommodation_id, NEW.bonus_type, NEW.effective_from, 'create', COALESCE(v_uid, NEW.created_by), v_email, NULL, NEW.tiers, NEW.note);
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_log_venue_team_bonus_tier_rule
AFTER INSERT OR UPDATE OR DELETE ON public.venue_team_bonus_tier_rules
FOR EACH ROW EXECUTE FUNCTION public.log_venue_team_bonus_tier_rule_change();