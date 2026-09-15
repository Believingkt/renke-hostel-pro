
-- 1. traffic_sources / booking_methods: remove unrestricted authenticated insert
DROP POLICY IF EXISTS "authenticated can insert traffic_sources" ON public.traffic_sources;
DROP POLICY IF EXISTS "authenticated can insert booking_methods" ON public.booking_methods;

-- 2. meta_ad_weekly: use team-role helper (accommodation-scope aware) instead of raw user_roles check
DROP POLICY IF EXISTS "admin can manage meta_ad_weekly" ON public.meta_ad_weekly;
CREATE POLICY "team admin can manage meta_ad_weekly"
ON public.meta_ad_weekly FOR ALL TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
);
DROP POLICY IF EXISTS "meta_ad_weekly_select" ON public.meta_ad_weekly;
CREATE POLICY "meta_ad_weekly_select"
ON public.meta_ad_weekly FOR SELECT TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role)
);

-- 3. line_oa_channels: credentials -> super_admin only
DROP POLICY IF EXISTS "line_oa_channels admin read" ON public.line_oa_channels;
DROP POLICY IF EXISTS "line_oa_channels admin write" ON public.line_oa_channels;
CREATE POLICY "line_oa_channels super admin read"
ON public.line_oa_channels FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));
CREATE POLICY "line_oa_channels super admin write"
ON public.line_oa_channels FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- 4. line_event_types: lookup readable by admins, writable by super_admin only
DROP POLICY IF EXISTS "line_event_types admin write" ON public.line_event_types;
CREATE POLICY "line_event_types super admin write"
ON public.line_event_types FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- 5. line_push_targets: scope hotel_admin to their own accommodations
DROP POLICY IF EXISTS "line_push_targets admin read" ON public.line_push_targets;
DROP POLICY IF EXISTS "line_push_targets admin write" ON public.line_push_targets;
CREATE POLICY "line_push_targets scoped read"
ON public.line_push_targets FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    accommodation_ids IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM unnest(accommodation_ids) AS aid
      WHERE public.user_has_role(auth.uid(), aid, 'hotel_admin'::app_role)
    )
  )
);
CREATE POLICY "line_push_targets scoped write"
ON public.line_push_targets FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    accommodation_ids IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM unnest(accommodation_ids) AS aid
      WHERE public.user_has_role(auth.uid(), aid, 'hotel_admin'::app_role)
    )
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    accommodation_ids IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM unnest(accommodation_ids) AS aid
      WHERE public.user_has_role(auth.uid(), aid, 'hotel_admin'::app_role)
    )
  )
);

-- 6. orders: restrict read/update/delete policies to authenticated role only
--    (public insert for the website booking flow is preserved)
DROP POLICY IF EXISTS "Only admins can delete orders" ON public.orders;
CREATE POLICY "Only admins can delete orders"
ON public.orders FOR DELETE TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);
DROP POLICY IF EXISTS "Only admins can update orders" ON public.orders;
CREATE POLICY "Only admins can update orders"
ON public.orders FOR UPDATE TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);
DROP POLICY IF EXISTS "finance can view orders" ON public.orders;
CREATE POLICY "finance can view orders"
ON public.orders FOR SELECT TO authenticated
USING (public.user_has_team_role(auth.uid(), 'finance'::app_role));

-- 7. Pin search_path on email queue functions
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
