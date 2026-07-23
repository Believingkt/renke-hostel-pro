
-- ============================================
-- 1) audit_logs: restrict INSERT to accessible accommodations + action allow-list
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can insert their own audit logs" ON public.audit_logs;

CREATE POLICY "Authenticated users can insert their own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND ((user_email IS NULL) OR (user_email = (auth.jwt() ->> 'email')))
  AND action_type IN (
    'create','update','delete','enable','disable','clone',
    'backup','restore','login','logout','sync'
  )
  AND action_category IN (
    'accommodation','user','order','system','backup','auth'
  )
  AND (
    -- Global/self actions with no accommodation scope
    (
      accommodation_id IS NULL
      AND action_category IN ('auth','user','system','backup')
    )
    -- Super admin can log anything
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'::app_role
    )
    -- Otherwise the accommodation must be one the user has access to
    OR (
      accommodation_id IS NOT NULL
      AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
    )
  )
);

-- ============================================
-- 2) kol_venue_settings: restrict SELECT to team members
-- ============================================
DROP POLICY IF EXISTS "authenticated can read kol_venue_settings" ON public.kol_venue_settings;

CREATE POLICY "team members can read kol_venue_settings"
ON public.kol_venue_settings
FOR SELECT
TO authenticated
USING (public.user_has_any_team_role(auth.uid()));

-- ============================================
-- 3) kol_venues + kol_venue_link_rules: restrict SELECT to team members
-- ============================================
DROP POLICY IF EXISTS "authenticated can read kol_venues" ON public.kol_venues;

CREATE POLICY "team members can read kol_venues"
ON public.kol_venues
FOR SELECT
TO authenticated
USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS "authenticated can read kol_venue_link_rules" ON public.kol_venue_link_rules;

CREATE POLICY "team members can read kol_venue_link_rules"
ON public.kol_venue_link_rules
FOR SELECT
TO authenticated
USING (public.user_has_any_team_role(auth.uid()));

-- ============================================
-- 4) order_meta: remove blanket closer role from UPDATE, scope to ownership/accommodation
-- ============================================
DROP POLICY IF EXISTS "order_meta_update" ON public.order_meta;

CREATE POLICY "order_meta_update"
ON public.order_meta
FOR UPDATE
TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR filled_by = auth.uid()
  OR closer_id = auth.uid()
  OR scout_id = auth.uid()
  OR video_creator_id = auth.uid()
  OR (
    accommodation_id IS NOT NULL
    AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  )
)
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR filled_by = auth.uid()
  OR closer_id = auth.uid()
  OR scout_id = auth.uid()
  OR video_creator_id = auth.uid()
  OR (
    accommodation_id IS NOT NULL
    AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  )
);

-- ============================================
-- 5) system_settings: restrict SELECT to admins only
-- ============================================
DROP POLICY IF EXISTS "Staff can view system settings" ON public.system_settings;

CREATE POLICY "Admins can view system settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
  )
);
