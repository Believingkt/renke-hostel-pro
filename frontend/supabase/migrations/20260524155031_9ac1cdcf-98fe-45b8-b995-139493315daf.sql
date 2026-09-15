
-- ============================================================
-- Helper: check if user has any team-level role (accommodation_id IS NULL)
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_has_any_team_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id IS NULL
      AND role IN (
        'super_admin'::app_role,
        'admin'::app_role,
        'scout'::app_role,
        'scout_manager'::app_role,
        'closer'::app_role,
        'video'::app_role,
        'franchise'::app_role,
        'starlink'::app_role
      )
  );
$$;

-- ============================================================
-- AI configuration tables: split read (admin+super) from write (super_admin)
-- ============================================================
DROP POLICY IF EXISTS "ai_prompts admin all" ON public.ai_prompts;
CREATE POLICY "ai_prompts read admin" ON public.ai_prompts
  FOR SELECT USING (public.is_admin_or_super());
CREATE POLICY "ai_prompts write super" ON public.ai_prompts
  FOR ALL USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role))
           WITH CHECK (public.user_has_team_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "ai_knowledge admin all" ON public.ai_knowledge;
CREATE POLICY "ai_knowledge read admin" ON public.ai_knowledge
  FOR SELECT USING (public.is_admin_or_super());
CREATE POLICY "ai_knowledge write super" ON public.ai_knowledge
  FOR ALL USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role))
           WITH CHECK (public.user_has_team_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "ai_examples admin all" ON public.ai_examples;
CREATE POLICY "ai_examples read admin" ON public.ai_examples
  FOR SELECT USING (public.is_admin_or_super());
CREATE POLICY "ai_examples write super" ON public.ai_examples
  FOR ALL USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role))
           WITH CHECK (public.user_has_team_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "ai_ab_tests admin all" ON public.ai_ab_tests;
CREATE POLICY "ai_ab_tests read admin" ON public.ai_ab_tests
  FOR SELECT USING (public.is_admin_or_super());
CREATE POLICY "ai_ab_tests write super" ON public.ai_ab_tests
  FOR ALL USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role))
           WITH CHECK (public.user_has_team_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "ai_conversation_logs admin all" ON public.ai_conversation_logs;
CREATE POLICY "ai_conversation_logs read admin" ON public.ai_conversation_logs
  FOR SELECT USING (public.is_admin_or_super());
CREATE POLICY "ai_conversation_logs write super" ON public.ai_conversation_logs
  FOR ALL USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role))
           WITH CHECK (public.user_has_team_role(auth.uid(), 'super_admin'::app_role));

-- ============================================================
-- Internal compensation / config tables: restrict SELECT to team members
-- ============================================================
DROP POLICY IF EXISTS commission_settings_select ON public.accommodation_commission_settings;
CREATE POLICY commission_settings_select ON public.accommodation_commission_settings
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS salary_settings_select ON public.scout_salary_settings;
CREATE POLICY salary_settings_select ON public.scout_salary_settings
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS tier_settings_select ON public.scout_tier_settings;
CREATE POLICY tier_settings_select ON public.scout_tier_settings
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS monthly_targets_select ON public.scout_monthly_targets;
CREATE POLICY monthly_targets_select ON public.scout_monthly_targets
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS team_targets_select ON public.scout_team_targets;
CREATE POLICY team_targets_select ON public.scout_team_targets
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS bonus_multiplier_select_all ON public.bonus_multiplier_settings;
CREATE POLICY bonus_multiplier_select_all ON public.bonus_multiplier_settings
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS payout_rules_select ON public.commission_payout_rules;
CREATE POLICY payout_rules_select ON public.commission_payout_rules
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS rarity_settings_read ON public.kol_rarity_settings;
CREATE POLICY rarity_settings_read ON public.kol_rarity_settings
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS franchise_team_select_all ON public.franchise_team_settings;
CREATE POLICY franchise_team_select_all ON public.franchise_team_settings
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS franchise_plan_select ON public.franchise_plan_settings;
CREATE POLICY franchise_plan_select ON public.franchise_plan_settings
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS "authenticated can read" ON public.franchise_commission_settings;
CREATE POLICY "team can read" ON public.franchise_commission_settings
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS starlink_tier_select ON public.starlink_tier_settings;
CREATE POLICY starlink_tier_select ON public.starlink_tier_settings
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS notification_settings_select ON public.performance_notification_settings;
CREATE POLICY notification_settings_select ON public.performance_notification_settings
  FOR SELECT TO authenticated USING (public.user_has_any_team_role(auth.uid()));

-- ============================================================
-- team_member_profiles: only team members or row owner
-- ============================================================
DROP POLICY IF EXISTS team_profiles_select_all ON public.team_member_profiles;
CREATE POLICY team_profiles_select ON public.team_member_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_has_any_team_role(auth.uid()));

-- ============================================================
-- KOL data
-- ============================================================
DROP POLICY IF EXISTS kol_profiles_select ON public.kol_profiles;
CREATE POLICY kol_profiles_select ON public.kol_profiles
  FOR SELECT TO authenticated
  USING (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role)
    OR public.user_has_team_role(auth.uid(), 'scout'::app_role)
  );

DROP POLICY IF EXISTS kol_profiles_insert ON public.kol_profiles;
CREATE POLICY kol_profiles_insert ON public.kol_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role)
    OR public.user_has_team_role(auth.uid(), 'scout'::app_role)
  );

DROP POLICY IF EXISTS prospects_select ON public.kol_prospects;
CREATE POLICY prospects_select ON public.kol_prospects
  FOR SELECT TO authenticated
  USING (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role)
    OR public.user_has_team_role(auth.uid(), 'scout'::app_role)
  );

DROP POLICY IF EXISTS prospects_insert ON public.kol_prospects;
CREATE POLICY prospects_insert ON public.kol_prospects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role)
    OR public.user_has_team_role(auth.uid(), 'scout'::app_role)
  );

-- ============================================================
-- Meta ads: admin / super_admin only
-- ============================================================
DROP POLICY IF EXISTS meta_ads_select ON public.meta_ads;
CREATE POLICY meta_ads_select ON public.meta_ads
  FOR SELECT TO authenticated
  USING (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  );

-- meta_ad_weekly only has an ALL admin policy already (no public SELECT). Add explicit SELECT to be safe.
DROP POLICY IF EXISTS meta_ad_weekly_select ON public.meta_ad_weekly;
CREATE POLICY meta_ad_weekly_select ON public.meta_ad_weekly
  FOR SELECT TO authenticated
  USING (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  );

-- ============================================================
-- order_meta: scope to accommodation access or team admins or assigned member
-- ============================================================
DROP POLICY IF EXISTS order_meta_select ON public.order_meta;
CREATE POLICY order_meta_select ON public.order_meta
  FOR SELECT TO authenticated
  USING (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR filled_by = auth.uid()
    OR scout_id = auth.uid()
    OR closer_id = auth.uid()
    OR video_creator_id = auth.uid()
    OR (accommodation_id IS NOT NULL AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id))
  );
